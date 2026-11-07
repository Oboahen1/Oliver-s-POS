'use strict';
const router = require('express').Router();
const { db } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');

router.use(requireAuth, requireRole('admin'));

// GET /api/reports/summary?from=ISO&to=ISO  (from inclusive, to exclusive)
router.get('/summary', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new HttpError(400, 'from and to are required');
  const range = [String(from), String(to)];
  const base = "s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?";

  const totals = db.prepare(
    `SELECT COALESCE(SUM(total_cents), 0) AS revenue_cents, COUNT(*) AS orders
     FROM sales s WHERE ${base}`
  ).get(...range);

  const profit = db.prepare(
    `SELECT COALESCE(SUM((si.unit_price_cents - si.unit_cost_cents) * si.qty), 0) AS profit_cents
     FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${base}`
  ).get(...range).profit_cents;

  const byMethod = db.prepare(
    `SELECT payment_method, COUNT(*) AS orders, SUM(total_cents) AS total_cents
     FROM sales s WHERE ${base} GROUP BY payment_method`
  ).all(...range);

  const topProducts = db.prepare(
    `SELECT si.name, SUM(si.qty) AS qty, SUM(si.qty * si.unit_price_cents) AS revenue_cents
     FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${base}
     GROUP BY si.product_id ORDER BY qty DESC LIMIT 5`
  ).all(...range);

  const lowStock = db.prepare(
    `SELECT id, name, sku, stock FROM products
     WHERE active = 1 AND stock <= low_stock_threshold ORDER BY stock, name LIMIT 20`
  ).all();

  res.json({ ...totals, profit_cents: profit, by_method: byMethod, top_products: topProducts, low_stock: lowStock });
});

module.exports = router;
