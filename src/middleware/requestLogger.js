import { logger } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const originalEnd = res.end;

  res.end = function endWithTiming(...args) {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time-Ms', elapsedMs.toFixed(1));
    }
    logger.info({
      message: 'request',
      method: req.method,
      path: req.originalUrl?.split('?')[0],
      status: res.statusCode,
      ms: Number(elapsedMs.toFixed(1)),
    });
    return originalEnd.apply(this, args);
  };

  next();
}
