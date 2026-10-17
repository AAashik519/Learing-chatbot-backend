import { HttpError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'That page or route was not found.'));
}

export function errorHandler(err, _req, res, _next) {
  let error = err;
  if (err?.type === 'entity.parse.failed') {
    error = new HttpError(400, 'INVALID_JSON', 'The request body must be valid JSON.');
  }

  const status = error.status || 500;
  const code = error.code || 'INTERNAL_ERROR';
  if (status >= 500) {
    logger.error({ message: error.message, code });
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message: status >= 500 && code !== 'DATABASE_UNAVAILABLE'
        ? 'Something went wrong. Please try again.'
        : error.message,
    },
  });
}
