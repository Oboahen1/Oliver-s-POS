'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { HttpError, isUniqueViolation } = require('../utils/errors');
const { int, str } = require('../utils/validate');

router.use(requireAuth, requireRole('admin'));
const ROLES = ['admin', 'cashier'];
const publicFields = 'id, username, role, active, created_at';

router.get('/', (req, res) => {
  res.json(db.prepare(`SELECT ${publicFields} FROM users ORDER BY username COLLATE NOCASE`).all());
});

router.post('/', (req, res) => {
  const username = str(req.body?.username, 'Username', { min: 3, max: 50 });
  const password = str(req.body?.password, 'Password', { min: 8, max: 200 });
  const role = req.body?.role;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Invalid role');
  try {
    const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run(username, bcrypt.hashSync(password, 10), role);
    res.status(201).json(db.prepare(`SELECT ${publicFields} FROM users WHERE id = ?`).get(info.lastInsertRowid));
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'That username is taken');
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const id = int(req.params.id, 'id', { min: 1 });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw new HttpError(404, 'User not found');
  const b = req.body || {};
  const role = b.role === undefined ? user.role : b.role;
  const active = b.active === undefined ? user.active : (b.active ? 1 : 0);
  if (!ROLES.includes(role)) throw new HttpError(400, 'Invalid role');
  if (id === req.user.id && (!active || role !== 'admin')) {
    throw new HttpError(400, 'You cannot deactivate or demote your own account');
  }
  const hash = b.password ? bcrypt.hashSync(str(b.password, 'Password', { min: 8, max: 200 }), 10) : user.password_hash;
  db.prepare('UPDATE users SET role = ?, active = ?, password_hash = ? WHERE id = ?').run(role, active, hash, id);
  res.json(db.prepare(`SELECT ${publicFields} FROM users WHERE id = ?`).get(id));
});

module.exports = router;
