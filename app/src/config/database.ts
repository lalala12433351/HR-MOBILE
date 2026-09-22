import pg from 'pg';
import { env } from './env.js';
import { log } from '../utils/logger.js';

const { Pool } = pg;

// PostgreSQL connection configuration tailored for Standard AWS RDS PostgreSQL (db.t4g.micro) & Local Postgres
function buildPoolConfig(): pg.PoolConfig {
  let maxConnections = env.DB_MAX_CONNECTIONS;
  let isSsl = env.DB_SSL === 'true';

  const baseConfig: pg.PoolConfig = {
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  if (env.DATABASE_URL) {
    baseConfig.connectionString = env.DATABASE_URL;

    try {
      const parsedUrl = new URL(env.DATABASE_URL);
      const urlLimit = parsedUrl.searchParams.get('connection_limit');
      if (urlLimit && !isNaN(Number(urlLimit))) {
        maxConnections = Number(urlLimit);
      }
      const sslMode = parsedUrl.searchParams.get('sslmode');
      if (sslMode === 'require' || sslMode === 'prefer' || parsedUrl.hostname.includes('rds.amazonaws.com')) {
        isSsl = true;
      }
    } catch {
      if (env.DATABASE_URL.includes('sslmode=require') || env.DATABASE_URL.includes('rds.amazonaws.com')) {
        isSsl = true;
      }
    }
  } else {
    baseConfig.host = env.DB_HOST;
    baseConfig.port = env.DB_PORT;
    baseConfig.database = env.DB_NAME;
    baseConfig.user = env.DB_USER;
    baseConfig.password = env.DB_PASSWORD;
  }

  // Conservative pool limit to prevent connection exhaustion on standard RDS (db.t4g.micro)
  baseConfig.max = maxConnections;

  // Enforce TLS/SSL encryption with AWS RDS Amazon Root CA compatibility
  if (isSsl) {
    baseConfig.ssl = {
      rejectUnauthorized: false, // Ensures TLS encryption without node cert chain failures on AWS RDS Root CA
    };
  } else {
    baseConfig.ssl = false;
  }

  return baseConfig;
}

export const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  log.warn('Unexpected error on idle PostgreSQL client pool', err);
});

export async function ensureDatabaseExists(): Promise<void> {
  // Test connection to the target database
  try {
    const client = await pool.connect();
    client.release();
  } catch (err: any) {
    // If target database does not exist (code 3D000 in PostgreSQL)
    if (err.code === '3D000' || err.message?.includes('does not exist')) {
      log.info(`Target database does not exist yet. Creating it automatically...`);
      
      let maintenanceConfig: pg.PoolConfig;
      let targetDbName = env.DB_NAME;

      if (env.DATABASE_URL) {
        try {
          const parsed = new URL(env.DATABASE_URL);
          targetDbName = parsed.pathname.replace(/^\//, '').split('?')[0] || env.DB_NAME;
          parsed.pathname = '/postgres';
          parsed.search = '';
          maintenanceConfig = {
            connectionString: parsed.toString(),
            ssl: parsed.hostname.includes('rds.amazonaws.com') || env.DATABASE_URL.includes('sslmode=require') || env.DB_SSL === 'true'
              ? { rejectUnauthorized: false }
              : false,
          };
        } catch {
          maintenanceConfig = {
            host: env.DB_HOST,
            port: env.DB_PORT,
            database: 'postgres',
            user: env.DB_USER,
            password: env.DB_PASSWORD,
            ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
          };
        }
      } else {
        maintenanceConfig = {
          host: env.DB_HOST,
          port: env.DB_PORT,
          database: 'postgres',
          user: env.DB_USER,
          password: env.DB_PASSWORD,
          ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        };
      }

      const maintenancePool = new Pool(maintenanceConfig);
      const client = await maintenancePool.connect();
      try {
        await client.query(`CREATE DATABASE "${targetDbName}"`);
        log.success(`Database "${targetDbName}" auto-created successfully.`);
      } finally {
        client.release();
        await maintenancePool.end();
      }
    } else {
      throw err;
    }
  }
}

export async function testDatabaseConnection(): Promise<boolean> {
  let client;
  try {
    await ensureDatabaseExists();
    client = await pool.connect();
    const res = await client.query('SELECT current_database(), current_user, version()');
    log.success(`PostgreSQL Connected: DB="${res.rows[0].current_database}", User="${res.rows[0].current_user}"`);
    return true;
  } catch (err: any) {
    log.error('Failed to connect to PostgreSQL database', err, 'Check RDS endpoint, security groups, and credentials in app/.env');
    return false;
  } finally {
    if (client) client.release();
  }
}


