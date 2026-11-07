'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { str } = require('../utils/validate');

router.post('/login', (req, res) => {
  const username = str(req.body?.username, 'Username', { max: 50 });
  const password = str(req.body?.password, 'Password', { max: 200 });
  const portal = req.body?.portal;
  if (!['admin', 'sales'].includes(portal)) throw new HttpError(400, 'Unknown sign-in portal');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    throw new HttpError(401, 'Incorrect username or password');
  }
  // Each portal only accepts its own kind of account
  if (portal === 'admin' && user.role !== 'admin') {
    throw new HttpError(403, 'This account is not allowed in the Administrator Portal.');
  }
  if (portal === 'sales' && user.role !== 'cashier') {
    throw new HttpError(403, 'This account is not allowed in the Sales Terminal.');
  }
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.tokenTtl });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.post('/change-password', requireAuth, (req, res) => {
  const current = str(req.body?.current_password, 'Current password', { max: 200 });
  const next = str(req.body?.new_password, 'New password', { min: 8, max: 200 });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current, user.password_hash)) throw new HttpError(400, 'Current password is incorrect');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), user.id);
  res.json({ ok: true });
});

module.exports = router;
