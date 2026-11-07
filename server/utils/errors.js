'use strict';
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const isUniqueViolation = err => !!err && (String(err.code).startsWith('SQLITE_CONSTRAINT') || /UNIQUE constraint failed/i.test(err.message || ''));
module.exports = { HttpError, isUniqueViolation };
