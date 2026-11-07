'use strict';
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET must be set in production');
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET not set: using a temporary secret (sessions reset on restart).');
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  jwtSecret,
  tokenTtl: '12h',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'pos.db'),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123'
};
