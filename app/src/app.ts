import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.middleware.js';
import { pool } from './config/database.js';

import { authRoutes } from './modules/auth/auth.routes.js';
import { controlPlaneRoutes } from './modules/control-plane/control-plane.routes.js';
import { licenseRoutes, tenantLicenseRoutes } from './modules/licenses/license.routes.js';
import { orgRoutes } from './modules/org/org.routes.js';
import { identityRoutes } from './modules/identity/identity.routes.js';
import { attendanceRoutes } from './modules/attendance/attendance.routes.js';
import { projectRoutes } from './modules/projects/projects.routes.js';
import { payrollRoutes } from './modules/payroll/payroll.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { auditCommsRoutes } from './modules/audit-comms/audit.routes.js';
import { storageRoutes } from './modules/storage/storage.routes.js';
import { instituteRoutes } from './modules/institute/institute.routes.js';
import { setupRoutes } from './modules/setup/setup.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { chatRoutes } from './modules/chat/chat.routes.js';
import { pushRoutes } from './modules/push/push.routes.js';
import { supportRoutes } from './modules/support/support.routes.js';

import { requestLogger } from './utils/logger.js';

export function createApp(): Express {
  const app = express();
  // Behind one load balancer hop; needed so rate limits key on the real client IP.
  app.set('trust proxy', 1);

  // Clean Human-Readable HTTP Request/Response Logger
  if (env.NODE_ENV !== 'test') {
    app.use(requestLogger);
  }

  // Test

  // Security & Utility Middlewares
  app.use(helmet({
    contentSecurityPolicy: false, // Permit Next.js / Vite SPA consumption
  }));

  app.use(cors({
    origin: env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS.split(',').map(s => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'Accept'],
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // --- Health Checks (ALB Target Group & ECS Fargate Task Agent) ---
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'enterprise-bos-backend',
      uptime: process.uptime(),
      environment: env.NODE_ENV,
    });
  });

  app.get('/ready', async (_req: Request, res: Response) => {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      res.status(200).json({ status: 'ready', database: 'connected' });
    } catch (err: any) {
      res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
    }
  });

  // --- API Routes ---
  const API_PREFIX = '/api/v1';

  // Public Authentication & Onboarding (Standard & Versioned paths)
  app.use('/api/auth', authRoutes);
  app.use(`${API_PREFIX}/auth`, authRoutes);

  // Public license catalog (signup picker — no auth)
  app.use(`${API_PREFIX}/license-plans`, licenseRoutes);
  app.use(`${API_PREFIX}/license`, tenantLicenseRoutes);

  // Global Control Plane (Tenants, Subscriptions, Auth Mappings)
  app.use(`${API_PREFIX}/control-plane`, controlPlaneRoutes);

  // Tenant Functional Domains (Schema-per-tenant isolated)
  app.use(`${API_PREFIX}/org`, orgRoutes);
  app.use(`${API_PREFIX}/identity`, identityRoutes);
  app.use(`${API_PREFIX}/attendance`, attendanceRoutes);
  app.use(`${API_PREFIX}/projects`, projectRoutes);
  app.use(`${API_PREFIX}/payroll`, payrollRoutes);
  app.use(`${API_PREFIX}/billing`, billingRoutes);
  app.use(`${API_PREFIX}/audit-comms`, auditCommsRoutes);
  app.use(`${API_PREFIX}/storage`, storageRoutes);
  app.use(`${API_PREFIX}/institute`, instituteRoutes);
  // Workspace onboarding is a tenant-scoped flow and must be registered with
  // the versioned API prefix used by the Next.js client.
  app.use(`${API_PREFIX}/setup`, setupRoutes);
  app.use(`${API_PREFIX}/reports`, reportsRoutes);
  app.use(`${API_PREFIX}/chat`, chatRoutes);
  app.use(`${API_PREFIX}/push`, pushRoutes);
  app.use(`${API_PREFIX}/support`, supportRoutes);

  // 404 Route Handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested API endpoint was not found on this server.',
      },
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
