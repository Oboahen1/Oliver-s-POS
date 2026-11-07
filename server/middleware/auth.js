'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db');
const { HttpError } = require('../utils/errors');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Authentication required');
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret); }
  catch { throw new HttpError(401, 'Session expired, please sign in again'); }
  const user = db.prepare('SELECT id, username, role, active FROM users WHERE id = ?').get(payload.sub);
  if (!user || !user.active) throw new HttpError(401, 'Account is not active');
  req.user = { id: user.id, username: user.username, role: user.role };
  next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have permission to do that');
  next();
};

module.exports = { requireAuth, requireRole };
