'use strict';
const router = require('express').Router();
const { db } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { HttpError, isUniqueViolation } = require('../utils/errors');
const { int, str } = require('../utils/validate');

router.use(requireAuth);

// List products. Cashiers only see active products; admins can pass ?all=1.
router.get('/', (req, res) => {
  const includeInactive = req.user.role === 'admin' && req.query.all === '1';
  const rows = db.prepare(
    `SELECT * FROM products ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY name COLLATE NOCASE`
  ).all();
  res.json(rows);
});

function parseProduct(b) {
  return {
    sku: str(b.sku, 'SKU', { max: 50 }),
    name: str(b.name, 'Name', { max: 120 }),
    price_cents: int(b.price_cents, 'Price'),
    cost_cents: int(b.cost_cents ?? 0, 'Cost'),
    stock: int(b.stock ?? 0, 'Stock', { max: 1e7 }),
    low_stock_threshold: int(b.low_stock_threshold ?? 5, 'Low-stock threshold', { max: 1e6 })
  };
}

router.post('/', requireRole('admin'), (req, res) => {
  const p = parseProduct(req.body || {});
  try {
    const info = db.prepare(
      `INSERT INTO products (sku, name, price_cents, cost_cents, stock, low_stock_threshold)
       VALUES (@sku, @name, @price_cents, @cost_cents, @stock, @low_stock_threshold)`
    ).run(p);
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'A product with that SKU already exists');
    throw err;
  }
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const id = int(req.params.id, 'id', { min: 1 });
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) throw new HttpError(404, 'Product not found');
  const p = parseProduct(req.body || {});
  p.active = req.body.active === undefined ? existing.active : (req.body.active ? 1 : 0);
  try {
    db.prepare(
      `UPDATE products SET sku=@sku, name=@name, price_cents=@price_cents, cost_cents=@cost_cents,
       stock=@stock, low_stock_threshold=@low_stock_threshold, active=@active WHERE id=@id`
    ).run({ ...p, id });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'A product with that SKU already exists');
    throw err;
  }
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
});

// Soft delete keeps historical sales intact.
router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = int(req.params.id, 'id', { min: 1 });
  const info = db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(id);
  if (!info.changes) throw new HttpError(404, 'Product not found');
  res.json({ ok: true });
});

module.exports = router;
