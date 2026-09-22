import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pool } from '../config/database.js';

// Initialize the Prisma PG adapter with the existing node-postgres connection pool
const adapter = new PrismaPg(pool);

// Global Singleton Prisma Client
export const prisma = new PrismaClient({ adapter });

export default prisma;
