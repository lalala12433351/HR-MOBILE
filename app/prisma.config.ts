import 'dotenv/config';

export default {
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/enterprise_bos?schema=public&connection_limit=10',
  },
};
