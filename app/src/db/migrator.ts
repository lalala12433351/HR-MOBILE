import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/database.js';
import { sanitizeSchemaName } from './queryRunner.js';
import { hashPassword } from '../utils/crypto.js';
import { log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to locate migration files whether running in tsx or compiled dist
function getMigrationPath(filename: string): string {
  const possiblePaths = [
    path.join(__dirname, 'migrations', filename),
    path.join(process.cwd(), 'src', 'db', 'migrations', filename),
    path.join(process.cwd(), 'dist', 'db', 'migrations', filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(`Could not find migration file ${filename} in searched paths`);
}

/**
 * Runs public control plane migrations (001 + 003 + 004 + 005 + 008 + 010 + 011)
 */
export async function runPublicMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    log.info('Running Public Control Plane Migration 001...');
    const sql001 = fs.readFileSync(getMigrationPath('001_public_control_plane.sql'), 'utf8');
    await client.query(sql001);
    log.success('Public Control Plane Migration 001 executed successfully.');

    log.info('Running Public Control Plane Migration 003 (platform_admin)...');
    const sql003 = fs.readFileSync(getMigrationPath('003_platform_admin.sql'), 'utf8');
    await client.query(sql003);
    log.success('Public Control Plane Migration 003 executed successfully.');

    // SQL cannot generate PBKDF2; replace the 003 placeholder so platform login works
    // without requiring seedDemoTenant. Never overwrite an already-hashed password.
    await client.query(
      `UPDATE public.global_auth_mapping
       SET password_hash = $1
       WHERE role = 'platform_admin'
         AND (password_hash IS NULL OR password_hash = 'platform_seed:pending')`,
      [hashPassword('Platform@123')]
    );

    log.info('Running Public Control Plane Migration 004 (auth_tokens)...');
    const sql004 = fs.readFileSync(getMigrationPath('004_auth_tokens.sql'), 'utf8');
    await client.query(sql004);
    log.success('Public Control Plane Migration 004 executed successfully.');

    log.info('Running Public Control Plane Migration 005 (unique auth email)...');
    const sql005 = fs.readFileSync(getMigrationPath('005_unique_auth_email.sql'), 'utf8');
    try {
      await client.query(sql005);
      log.success('Public Control Plane Migration 005 executed successfully.');
    } catch (err: any) {
      log.warn(
        `Migration 005 could not add a unique email index (${err.message}). Duplicate emails already in the database will not be removed; new registrations with those emails are still rejected.`
      );
    }

    log.info('Running Public Control Plane Migration 008 (support threads)...');
    const sql008 = fs.readFileSync(getMigrationPath('008_support_threads.sql'), 'utf8');
    await client.query(sql008);
    log.success('Public Control Plane Migration 008 executed successfully.');

    log.info('Running Public Control Plane Migration 010 (license plans)...');
    const sql010 = fs.readFileSync(getMigrationPath('010_license_plans.sql'), 'utf8');
    await client.query(sql010);
    log.success('Public Control Plane Migration 010 executed successfully.');

    log.info('Running Public Control Plane Migration 011 (tenant address)...');
    const sql011 = fs.readFileSync(getMigrationPath('011_tenant_address.sql'), 'utf8');
    await client.query(sql011);
    log.success('Public Control Plane Migration 011 executed successfully.');
  } finally {
    client.release();
  }
}

/**
 * Provisions an isolated tenant schema and applies tenant template DDL (Migration 002)
 */
export async function provisionTenantSchema(schemaName: string): Promise<void> {
  const sanitized = sanitizeSchemaName(schemaName);
  log.info(`Provisioning isolated tenant schema "${sanitized}"...`);

  const sqlPath = getMigrationPath('002_tenant_template_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${sanitized}"`);
    await client.query(`SET search_path TO "${sanitized}", public`);
    await client.query(sql);
    await client.query(fs.readFileSync(getMigrationPath('006_chat.sql'), 'utf8'));
    await client.query(fs.readFileSync(getMigrationPath('007_unique_org_names.sql'), 'utf8'));
    await client.query(fs.readFileSync(getMigrationPath('009_billing_clients.sql'), 'utf8'));
    await client.query('RESET search_path');
    log.success(`Tenant schema "${sanitized}" provisioned and migrated successfully with 15+ isolated domain tables.`);
  } finally {
    client.release();
  }
}

/**
 * Discovers every tenant schema and re-applies Migration 002.
 * Safe to re-run: DDL uses CREATE/ALTER IF NOT EXISTS.
 */
export async function migrateAllTenantSchemas(): Promise<string[]> {
  const client = await pool.connect();
  let schemas: string[] = [];

  try {
    const fromCatalog = await client.query<{ schema_name: string }>(
      `SELECT schema_name
       FROM information_schema.schemata
       WHERE schema_name LIKE 'tenant_%'
       ORDER BY schema_name`
    );
    schemas = fromCatalog.rows.map((row) => row.schema_name);

    try {
      const fromControlPlane = await client.query<{ schema_name: string }>(
        `SELECT DISTINCT schema_name
         FROM public.tenants
         WHERE schema_name IS NOT NULL AND schema_name <> ''
         ORDER BY schema_name`
      );
      for (const row of fromControlPlane.rows) {
        if (!schemas.includes(row.schema_name)) {
          schemas.push(row.schema_name);
        }
      }
    } catch {
      // public.tenants may not exist yet before Migration 001
    }
  } finally {
    client.release();
  }

  log.info(`Migrating ${schemas.length} tenant schema(s) with template 002...`);
  for (const schema of schemas) {
    await provisionTenantSchema(schema);
  }

  return schemas;
}

// Allow direct CLI execution: node dist/db/migrator.js or tsx src/db/migrator.ts
if (process.argv[1] && (process.argv[1].endsWith('migrator.ts') || process.argv[1]?.endsWith('migrator.js'))) {
  (async () => {
    try {
      await runPublicMigrations();
      const tenants = await migrateAllTenantSchemas();
      log.success(`Database migrations finished successfully (${tenants.length} tenant schema(s) updated).`);
      process.exit(0);
    } catch (err: any) {
      log.error('Migration execution failed', err);
      process.exit(1);
    } finally {
      await pool.end();
    }
  })();
}

