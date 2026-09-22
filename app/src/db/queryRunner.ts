import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../config/database.js';
import { log } from '../utils/logger.js';

/**
 * Sanitizes and validates a PostgreSQL schema identifier.
 * Permits only lowercase alphanumeric characters and underscores.
 */
export function sanitizeSchemaName(schema: string): string {
  if (!schema || typeof schema !== 'string') {
    throw new Error('Schema name must be a non-empty string');
  }

  const normalized = schema.trim().toLowerCase();

  // Enforce strict naming rules for tenant schemas
  if (!/^[a-z0-9_]{3,63}$/.test(normalized)) {
    throw new Error(`Invalid schema name "${schema}". Must contain only lowercase alphanumeric characters and underscores (3-63 chars).`);
  }

  // Prevent forbidden system schema names
  const forbidden = ['pg_catalog', 'information_schema', 'pg_toast'];
  if (forbidden.includes(normalized)) {
    throw new Error(`Schema name "${normalized}" is reserved by PostgreSQL.`);
  }

  return normalized;
}

/**
 * Executes a callback function with PostgreSQL search_path set to the tenant's isolated schema.
 * Automatically releases client and resets search_path to prevent pool leakage.
 */
export async function withTenantContext<T>(
  schema: string,
  fn: (client: PoolClient, query: <R extends QueryResultRow = any>(text: string, params?: any[]) => Promise<QueryResult<R>>) => Promise<T>
): Promise<T> {
  const sanitizedSchema = sanitizeSchemaName(schema);
  const client = await pool.connect();

  try {
    // Set tenant schema context with fallback to public for global extensions/functions
    await client.query(`SET search_path TO "${sanitizedSchema}", public`);

    const query = async <R extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<R>> => {
      const qStart = Date.now();
      try {
        const res = await client.query<R>(text, params);
        log.db(text, {
          durationMs: Date.now() - qStart,
          rowCount: res.rowCount ?? 0,
          schema: sanitizedSchema,
        });
        return res;
      } catch (qErr: any) {
        log.error(`Query Failed on schema "${sanitizedSchema}"`, qErr);
        throw qErr;
      }
    };

    return await fn(client, query);
  } finally {
    // Reset search_path before returning connection back to pool
    try {
      await client.query('RESET search_path');
    } catch (resetErr) {
      log.warn('Warning: Failed to reset search_path on client release', resetErr);
    }
    client.release();
  }
}

