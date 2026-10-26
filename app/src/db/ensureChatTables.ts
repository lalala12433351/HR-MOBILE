import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/database.js';
import { sanitizeSchemaName } from './queryRunner.js';
import { log } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ensuredSchemas = new Set<string>();
const inFlight = new Map<string, Promise<void>>();
const cachedSql = new Map<string, string>();

function loadMigrationSql(filename: string): string {
  const cached = cachedSql.get(filename);
  if (cached) return cached;
  const candidates = [
    path.join(__dirname, 'migrations', filename),
    path.join(process.cwd(), 'src', 'db', 'migrations', filename),
    path.join(process.cwd(), 'dist', 'db', 'migrations', filename),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`Could not find migration file ${filename}`);
  const sql = fs.readFileSync(found, 'utf8');
  cachedSql.set(filename, sql);
  return sql;
}

/**
 * Applies the chat DDL (Migration 006), the org-name dedupe (Migration 007),
 * and chat mentions / push subscriptions (Migration 013) to a tenant schema
 * once per process. All are idempotent, so existing tenant schemas pick them
 * up on first chat or push use.
 */
export async function ensureChatTables(schemaName: string): Promise<void> {
  const sanitized = sanitizeSchemaName(schemaName);
  if (ensuredSchemas.has(sanitized)) return;

  const pending = inFlight.get(sanitized);
  if (pending) return pending;

  const run = (async () => {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO "${sanitized}", public`);
      await client.query(loadMigrationSql('006_chat.sql'));
      await client.query(loadMigrationSql('007_unique_org_names.sql'));
      await client.query(loadMigrationSql('013_chat_mentions_push.sql'));
      ensuredSchemas.add(sanitized);
      log.success(`Chat tables verified for tenant schema "${sanitized}".`);
    } finally {
      try {
        await client.query('RESET search_path');
      } catch (_) {}
      client.release();
      inFlight.delete(sanitized);
    }
  })();

  inFlight.set(sanitized, run);
  return run;
}
