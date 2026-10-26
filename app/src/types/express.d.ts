import { AuthenticatedUser } from './index.js';
import { QueryResult, QueryResultRow } from 'pg';

declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        schema: string;
        userSub: string;
        slug?: string;
        name?: string;
        industry?: string;
        address?: string;
        city?: string;
        stateProvince?: string;
        postalCode?: string;
        country?: string;
        createdAt?: string;
        adminEmail?: string;
      };
      user?: AuthenticatedUser;
      tenantId?: string;
      dbSchema?: string;
      tenantQuery?: <T extends QueryResultRow = any>(text: string, params?: any[]) => Promise<QueryResult<T>>;
    }
  }
}

export {};
