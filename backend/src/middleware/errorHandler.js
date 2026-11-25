import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found', path: req.originalUrl },
  });
}

export function errorHandler(err, _req, res, _next) {
  const isProd = process.env.NODE_ENV === 'production';

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  // Prisma known errors
  if (err?.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_VALUE',
        message: 'A record with this value already exists',
        details: err.meta?.target ? { target: err.meta.target } : undefined,
      },
    });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Requested record was not found' },
    });
  }
  if (err?.code === 'P2003') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REFERENCE',
        message: 'Related record not found (invalid foreign key reference)',
        details: err.meta?.field_name ? { field: err.meta.field_name } : undefined,
      },
    });
  }

  const status = err instanceof AppError ? err.status : err.status || 500;
  const message = status >= 500 && isProd ? 'Internal server error' : err.message || 'Internal server error';

  if (status >= 500) console.error('[ERROR]', err);
  else if (!isProd) console.warn('[WARN]', err.message);

  return res.status(status).json({
    success: false,
    error: {
      code: err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      message,
      details: !isProd ? err.details : undefined,
    },
  });
}
