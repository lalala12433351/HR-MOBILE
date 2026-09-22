import { pool } from '../config/database.js';

async function clean() {
  console.log('🧹 Cleaning mock data from database...');
  const client = await pool.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS "tenant_demo_corp" CASCADE');
    await client.query("DELETE FROM public.tenants WHERE slug = 'demo_corp'");
    console.log('✅ Dropped schema tenant_demo_corp and removed demo_corp from public.tenants.');

    const res = await client.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' OR schema_name = 'public'"
    );
    console.log('Active schemas in database:', res.rows.map(r => r.schema_name));
  } finally {
    client.release();
    await pool.end();
  }
}

clean().catch(console.error);
