import { Request, Response, NextFunction } from 'express';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../config/database.js';
import { sanitizeSchemaName } from '../db/queryRunner.js';
import { log } from '../utils/logger.js';

/**
 * Tenant Context Middleware:
 * Resolves the tenant's isolated schema and binds a request-scoped DB client
 * with search_path locked for the lifetime of the request (one connect/SET/RESET).
 */
export async function requireTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const schemaName =
    req.tenant?.schema ||
    req.user?.db_schema ||
    req.dbSchema ||
    (req.headers['x-tenant-id'] ? `tenant_${req.headers['x-tenant-id']}` : undefined);

  if (!schemaName || schemaName === 'public') {
    log.warn('Tenant Context Missing: Request blocked', {
      method: req.method,
      url: req.originalUrl || req.url,
      tip: 'Provide X-Tenant-ID header or authenticate with a tenant-scoped token.',
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'TENANT_CONTEXT_REQUIRED',
        message: 'A valid tenant schema context is required to access this resource.',
      },
    });
    return;
  }

  let client: PoolClient | undefined;
  let released = false;

  const releaseClient = async () => {
    if (released || !client) return;
    released = true;
    try {
      await client.query('RESET search_path');
    } catch (resetErr) {
      log.warn('Warning: Failed to reset search_path on client release', resetErr);
    }
    try {
      client.release();
    } catch (releaseErr) {
      log.warn('Warning: Failed to release tenant DB client', releaseErr);
    }
  };

  try {
    const validatedSchema = sanitizeSchemaName(schemaName);
    req.dbSchema = validatedSchema;

    client = await pool.connect();
    await client.query(`SET search_path TO "${validatedSchema}", public`);

    const boundClient = client;
    req.tenantQuery = async <T extends QueryResultRow = any>(
      text: string,
      params?: any[]
    ): Promise<QueryResult<T>> => {
      const qStart = Date.now();
      try {
        const resQuery = await boundClient.query<T>(text, params);
        log.db(text, {
          durationMs: Date.now() - qStart,
          rowCount: resQuery.rowCount ?? 0,
          schema: validatedSchema,
        });
        return resQuery;
      } catch (qErr: any) {
        log.error(`Query Failed on schema "${validatedSchema}"`, qErr);
        throw qErr;
      }
    };

    res.on('finish', () => {
      void releaseClient();
    });
    res.on('close', () => {
      void releaseClient();
    });

    log.tenant('Scoped Database Runner Bound', {
      schemaName: validatedSchema,
      tenantId: req.tenant?.id || req.tenantId || validatedSchema.replace('tenant_', ''),
      userEmail: req.user?.email,
      reason: 'search_path locked to isolated tenant schema (request-scoped client)',
    });

    next();
  } catch (error: any) {
    await releaseClient();

    if (
      error?.message?.includes('Invalid schema name') ||
      error?.message?.includes('reserved by PostgreSQL') ||
      error?.message?.includes('Schema name must be')
    ) {
      log.error(`Invalid Schema Name "${schemaName}"`, error);
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SCHEMA_IDENTIFIER',
          message: error.message || 'The specified tenant schema is invalid.',
        },
      });
      return;
    }

    log.error('Failed to bind tenant database context', error);
    res.status(503).json({
      success: false,
      error: {
        code: 'DB_UNAVAILABLE',
        message: 'Unable to acquire a database connection for this tenant request.',
      },
    });
  }
}
