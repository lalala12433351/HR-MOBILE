import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { log } from '../utils/logger.js';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const method = req.method;
  const url = req.originalUrl || req.url;

  if (err instanceof ZodError) {
    log.warn(`Request Validation Failed [${method} ${url}]`, {
      issues: err.errors.map(e => `${e.path.join('.')}: ${e.message}`),
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload format or parameters.',
        details: err.errors,
      },
    });
    return;
  }

  const statusCode = typeof err.status === 'number' ? err.status : typeof err.statusCode === 'number' ? err.statusCode : 500;

  // Derive troubleshooting hint if possible
  let hint: string | undefined;
  if (err.code === 'ECONNREFUSED' || err.message?.includes('connect ECONNREFUSED')) {
    hint = 'PostgreSQL database connection refused. Verify RDS security group ingress or local docker port 5432.';
  } else if (err.code === '42P01' || err.message?.includes('relation') && err.message?.includes('does not exist')) {
    hint = 'Target database table does not exist. Check if schema migrations ran on this tenant.';
  } else if (err.name === 'NotAuthorizedException') {
    hint = 'AWS Cognito rejected the authentication request. Check user credentials or SECRET_HASH config.';
  }

  log.error(`Unhandled Exception in [${method} ${url}] (HTTP ${statusCode})`, err, hint);

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected internal error occurred.',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    },
  });
}

