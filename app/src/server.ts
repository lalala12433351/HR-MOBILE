import { createApp } from './app.js';
import { env } from './config/env.js';
import { testDatabaseConnection, pool } from './config/database.js';
import { runPublicMigrations } from './db/migrator.js';
import { ensureInstituteTables } from './db/ensureInstituteTables.js';
import { log } from './utils/logger.js';

async function bootstrap() {
  let dbHost = env.DB_HOST;
  if (env.DATABASE_URL) {
    try {
      dbHost = new URL(env.DATABASE_URL).host;
    } catch (_) {}
  }

  log.banner({
    serviceName: 'Enterprise BOS Multi-Tenant Cloud Backend',
    port: env.PORT,
    env: env.NODE_ENV,
    awsRegion: env.AWS_REGION,
    cognitoPoolId: env.COGNITO_USER_POOL_ID,
    cognitoClientId: env.COGNITO_CLIENT_ID,
    hasClientSecret: Boolean(env.COGNITO_CLIENT_SECRET),
    dbHost,
    dbName: env.DB_NAME,
  });

  // Test Database connectivity
  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    if (env.NODE_ENV === 'production') {
      log.error('Fatal: PostgreSQL database could not be reached in production. Exiting...');
      process.exit(1);
    } else {
      log.warn('PostgreSQL database is currently unreachable.', {
        tip: 'Verify your RDS endpoint or start local Postgres via `docker-compose up -d postgres`.',
      });
    }
  } else {
    // Automatically apply public control plane migrations
    try {
      await runPublicMigrations();
      log.success('Public control plane tables verified & migrations active.');
      await ensureInstituteTables('tenant_demo');
      log.success('Institute domain tables verified (strictly empty / zero mock data).');
    } catch (migErr: any) {
      log.error('Error initializing database migrations', migErr);
    }
  }

  const app = createApp();

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    log.info(`Backend server actively listening on http://0.0.0.0:${env.PORT}`);
    log.info(`🩺 Health check URL: http://localhost:${env.PORT}/health`);
    log.info(`🛡️ Schema-per-tenant PostgreSQL isolation engine active.`);
  });

  // Graceful Shutdown Signal Handling
  const shutdown = async (signal: string) => {
    log.warn(`Received ${signal}. Commencing graceful shutdown...`);

    server.close(async () => {
      log.info('Closed incoming HTTP connections.');
      try {
        await pool.end();
        log.success('PostgreSQL connection pool drained cleanly.');
        process.exit(0);
      } catch (err: any) {
        log.error('Error occurred while closing PostgreSQL pool', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      log.error('Graceful shutdown timeout exceeded (10s). Forcing termination.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  log.error('Unhandled Exception during server startup', err);
  process.exit(1);
});

