'use strict';
const { HttpError } = require('./errors');

function int(v, name, { min = 0, max = 1e9, required = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${name} is required`);
    return undefined;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${name} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

function str(v, name, { min = 1, max = 200 } = {}) {
  if (typeof v !== 'string') throw new HttpError(400, `${name} is required`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `${name} must be ${min}-${max} characters`);
  return s;
}

module.exports = { int, str };
