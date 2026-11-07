'use strict';
const router = require('express').Router();
const { db, getSettings } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { int } = require('../utils/validate');

const METHODS = ['cash', 'card', 'transfer'];
router.use(requireAuth);

function getSale(id) {
  const sale = db.prepare(
    `SELECT s.*, u.username AS cashier FROM sales s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
  ).get(id);
  if (!sale) return null;
  sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(id);
  return sale;
}

const newReceiptNo = () =>
  'R' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

// Create a sale. Prices, tax, totals and stock are all computed server-side.
router.post('/', (req, res) => {
  const { items, payment_method, tendered_cents } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length > 200) throw new HttpError(400, 'Cart is empty');
  if (!METHODS.includes(payment_method)) throw new HttpError(400, 'Invalid payment method');

  const wanted = new Map();
  for (const it of items) {
    const pid = int(it?.product_id, 'product_id', { min: 1 });
    const qty = int(it?.qty, 'Quantity', { min: 1, max: 10000 });
    wanted.set(pid, (wanted.get(pid) || 0) + qty);
  }

  const create = db.transaction(() => {
    const lines = [];
    let subtotal = 0;
    for (const [pid, qty] of wanted) {
      const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(pid);
      if (!p) throw new HttpError(400, 'A product in the cart is no longer available');
      if (p.stock < qty) throw new HttpError(409, `Not enough stock for ${p.name} (${p.stock} left)`);
      lines.push({ p, qty });
      subtotal += p.price_cents * qty;
    }
    const rate = parseFloat(getSettings().tax_rate) || 0;
    const tax = Math.round((subtotal * rate) / 100);
    const total = subtotal + tax;

    let tendered = total, change = 0;
    if (payment_method === 'cash') {
      tendered = int(tendered_cents ?? total, 'Cash tendered');
      if (tendered < total) throw new HttpError(400, 'Cash tendered is less than the total');
      change = tendered - total;
    }

    const saleId = db.prepare(
      `INSERT INTO sales (receipt_no, user_id, subtotal_cents, tax_cents, total_cents, payment_method, tendered_cents, change_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(newReceiptNo(), req.user.id, subtotal, tax, total, payment_method, tendered, change).lastInsertRowid;

    const addItem = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, sku, name, qty, unit_price_cents, unit_cost_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const takeStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    for (const { p, qty } of lines) {
      addItem.run(saleId, p.id, p.sku, p.name, qty, p.price_cents, p.cost_cents);
      takeStock.run(qty, p.id);
    }
    return saleId;
  });

  res.status(201).json(getSale(create()));
});

// List sales. Admins see everything; cashiers see only their own.
router.get('/', (req, res) => {
  const where = [], params = [];
  if (req.user.role !== 'admin') { where.push('s.user_id = ?'); params.push(req.user.id); }
  if (req.query.from) { where.push('s.created_at >= ?'); params.push(String(req.query.from)); }
  if (req.query.to) { where.push('s.created_at < ?'); params.push(String(req.query.to)); }
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = db.prepare(
    `SELECT s.id, s.receipt_no, s.total_cents, s.payment_method, s.status, s.created_at, u.username AS cashier,
            (SELECT COALESCE(SUM(qty), 0) FROM sale_items WHERE sale_id = s.id) AS item_count
     FROM sales s JOIN users u ON u.id = s.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY s.id DESC LIMIT ?`
  ).all(...params, limit);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const sale = getSale(int(req.params.id, 'id', { min: 1 }));
  if (!sale || (req.user.role !== 'admin' && sale.user_id !== req.user.id)) throw new HttpError(404, 'Sale not found');
  res.json(sale);
});

// Void a sale and return its items to stock.
router.post('/:id/void', requireRole('admin'), (req, res) => {
  const id = int(req.params.id, 'id', { min: 1 });
  const run = db.transaction(() => {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
    if (!sale) throw new HttpError(404, 'Sale not found');
    if (sale.status === 'voided') throw new HttpError(400, 'Sale is already voided');
    const restock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    for (const it of db.prepare('SELECT product_id, qty FROM sale_items WHERE sale_id = ?').all(id)) {
      restock.run(it.qty, it.product_id);
    }
    db.prepare("UPDATE sales SET status = 'voided' WHERE id = ?").run(id);
  });
  run();
  res.json(getSale(id));
});

module.exports = router;
