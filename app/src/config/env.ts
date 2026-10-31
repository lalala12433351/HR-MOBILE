import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),
  ALLOWED_ORIGINS: z.string().default('*'),
  APP_ORIGIN: z.string().optional(),
  MASTER_ADMIN_ORIGIN: z.string().optional(),
  FRONTEND_APP_ORIGIN: z.string().optional(),

  // PostgreSQL / Standard AWS RDS (db.t4g.micro)
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('enterprise_bos'),
  DB_USER: z.string().default('postgresadmin'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_MAX_CONNECTIONS: z.coerce.number().default(10),

  // AWS Cognito
  AWS_REGION: z.string().default('ap-south-1'),
  COGNITO_USER_POOL_ID: z.string().default('us-east-1_examplepool'),
  COGNITO_CLIENT_ID: z.string().default('exampleclientid12345'),
  COGNITO_CLIENT_SECRET: z.string().optional().default(''),

  // AWS S3
  S3_BUCKET_NAME: z.string().default('enterprise-bos-documents-local'),
  S3_PRESIGNED_EXPIRATION_SECONDS: z.coerce.number().default(900),

  // Auth
  JWT_SECRET: z.string().optional(),

  // Transactional email (Amazon SES v2)
  EMAIL_TRANSPORT: z.enum(['ses', 'log']).default('ses'),
  SES_FROM_EMAIL: z.string().default('Pixbe <auth@pixbe.in>'),
  SES_REPLY_TO: z.string().optional(),
  SES_CONFIGURATION_SET: z.string().optional(),
  EMAIL_BRAND_NAME: z.string().default('Pixbe'),
  SUPPORT_EMAIL: z.string().default('support@pixbe.in'),

  // Web Push (desktop notifications). Empty keys disable push; chat still works.
  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().optional().default('mailto:support@pixbe.in'),

  // Firebase Cloud Messaging (native Android/iOS). Empty keys disable native push.
  FCM_PROJECT_ID: z.string().optional().default(''),
  FCM_CLIENT_EMAIL: z.string().optional().default(''),
  // Private key may include literal \n when stored in env files.
  FCM_PRIVATE_KEY: z.string().optional().default(''),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
