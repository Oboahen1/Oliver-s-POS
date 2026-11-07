'use strict';
const router = require('express').Router();
const { getSettings, setSetting } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { str } = require('../utils/validate');

router.get('/', requireAuth, (req, res) => res.json(getSettings()));

router.put('/', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  const tax = Number(b.tax_rate);
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) throw new HttpError(400, 'Tax rate must be between 0 and 100');
  setSetting('business_name', str(b.business_name, 'Business name', { max: 80 }));
  setSetting('currency', str(b.currency, 'Currency symbol', { max: 5 }));
  setSetting('tax_rate', tax);
  if (!['0', '1'].includes(String(b.auto_print))) throw new HttpError(400, 'Invalid auto-print value');
  if (!['58', '80'].includes(String(b.receipt_width))) throw new HttpError(400, 'Receipt width must be 58 or 80');
  setSetting('auto_print', b.auto_print);
  setSetting('receipt_width', b.receipt_width);
  setSetting('receipt_footer', str(b.receipt_footer ?? '', 'Receipt footer', { min: 0, max: 120 }));
  res.json(getSettings());
});

module.exports = router;
