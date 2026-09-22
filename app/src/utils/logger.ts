/**
 * Enterprise BOS - Human-Readable Logging & Diagnostics System
 * 
 * Provides ultra-clear, color-coded, structured logs for:
 * 1. HTTP Request/Response lifecycle (Method, Path, Tenant, Auth, Duration, Status)
 * 2. AWS Cognito Authentication & Token verification steps
 * 3. PostgreSQL Schema-per-Tenant isolation & Query execution
 * 4. Control Plane provisioning and domain events
 * 5. Actionable troubleshooting hints for any errors
 */

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background badges
  bgBlue: '\x1b[44m\x1b[37m',
  bgGreen: '\x1b[42m\x1b[30m',
  bgYellow: '\x1b[43m\x1b[30m',
  bgRed: '\x1b[41m\x1b[37m',
  bgMagenta: '\x1b[45m\x1b[37m',
  bgCyan: '\x1b[46m\x1b[30m',
};

function formatTimestamp(): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${colors.gray}[${timeStr}.${ms}]${colors.reset}`;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'adminpassword',
  'newpassword',
  'oldpassword',
  'clientsecret',
  'secret',
  'token',
  'idtoken',
  'accesstoken',
  'refreshtoken',
  'authorization',
]);

/**
 * Recursively sanitizes sensitive fields from objects before logging
 */
export function sanitize(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '•••••••• (redacted)';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export const log = {
  /**
   * Beautiful Startup Banner for Backend Boot
   */
  banner(info: {
    serviceName: string;
    port: number | string;
    env: string;
    awsRegion: string;
    cognitoPoolId: string;
    cognitoClientId: string;
    hasClientSecret: boolean;
    dbHost?: string;
    dbName?: string;
  }) {
    const divider = '─'.repeat(68);
    console.log(`\n${colors.cyan}┌${divider}┐${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  ${colors.bright}${colors.green}🚀 ${info.serviceName}${colors.reset}${' '.repeat(Math.max(1, 64 - info.serviceName.length))}${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}├${divider}┤${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  🌐 ${colors.bright}Environment:${colors.reset}   ${info.env.padEnd(46)} ${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  🔌 ${colors.bright}Listening On:${colors.reset}  http://0.0.0.0:${String(info.port).padEnd(35)} ${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  🌍 ${colors.bright}AWS Region:${colors.reset}    ${info.awsRegion.padEnd(46)} ${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  🔐 ${colors.bright}Cognito Pool:${colors.reset}  ${info.cognitoPoolId.padEnd(46)} ${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  🔑 ${colors.bright}Client ID:${colors.reset}     ${info.cognitoClientId.padEnd(46)} ${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  🔒 ${colors.bright}Client Secret:${colors.reset} ${info.hasClientSecret ? `${colors.green}✅ Active (HMAC-SHA256)` : `${colors.gray}⚪ Not set (Public Client)`} ${colors.cyan}│${colors.reset}`);
    if (info.dbHost) {
      const dbLabel = `${info.dbHost} (${info.dbName || 'postgres'})`;
      console.log(`${colors.cyan}│${colors.reset}  🗄️  ${colors.bright}Postgres DB:${colors.reset}   ${dbLabel.slice(0, 46).padEnd(46)} ${colors.cyan}│${colors.reset}`);
    }
    console.log(`${colors.cyan}│${colors.reset}  🏢 ${colors.bright}Isolation:${colors.reset}     Schema-per-Tenant Active                     ${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}└${divider}┘\n${colors.reset}`);
  },

  /**
   * General Informational Log
   */
  info(message: string, meta?: any) {
    console.log(`${formatTimestamp()} ${colors.cyan}ℹ️  [INFO]${colors.reset} ${message}`);
    if (meta !== undefined) {
      console.log(`    ${colors.gray}└─ Details:${colors.reset}`, sanitize(meta));
    }
  },

  /**
   * Success Message Log
   */
  success(message: string, meta?: any) {
    console.log(`${formatTimestamp()} ${colors.green}✅ [SUCCESS]${colors.reset} ${colors.bright}${message}${colors.reset}`);
    if (meta !== undefined) {
      console.log(`    ${colors.gray}└─ Result:${colors.reset}`, sanitize(meta));
    }
  },

  /**
   * Warning Message Log
   */
  warn(message: string, meta?: any) {
    console.log(`${formatTimestamp()} ${colors.yellow}⚠️  [WARN]${colors.reset} ${colors.yellow}${message}${colors.reset}`);
    if (meta !== undefined) {
      console.log(`    ${colors.gray}└─ Context:${colors.reset}`, sanitize(meta));
    }
  },

  /**
   * Error Log with Clear Actionable Explanations
   */
  error(message: string, error?: any, hint?: string) {
    console.error(`\n${formatTimestamp()} ${colors.bgRed} ERROR ${colors.reset} ${colors.bright}${colors.red}${message}${colors.reset}`);
    if (error) {
      const errName = error.name || error.__type || (typeof error === 'object' ? 'Error' : '');
      const errMsg = error.message || error;
      if (errName) {
        console.error(`    ${colors.red}├─ Code / Type:${colors.reset} ${colors.bright}${errName}${colors.reset}`);
      }
      console.error(`    ${colors.red}├─ Message:${colors.reset}     ${errMsg}`);
      if (error.stack && process.env.NODE_ENV === 'development') {
        const cleanStack = String(error.stack).split('\n').slice(1, 4).map(l => l.trim()).join('\n        ');
        console.error(`    ${colors.gray}├─ Location:${colors.reset}    ${cleanStack}`);
      }
    }
    if (hint) {
      console.error(`    ${colors.yellow}└─ 💡 Fix Hint:${colors.reset}  ${hint}\n`);
    } else {
      console.error(`    ${colors.gray}└───────────────────────────────────────────────────${colors.reset}\n`);
    }
  },

  /**
   * Step-by-Step Progress Indicator (e.g., [Step 1/4])
   */
  step(current: number, total: number, title: string, details?: any) {
    const badge = `${colors.bgCyan} STEP ${current}/${total} ${colors.reset}`;
    console.log(`${formatTimestamp()} ${badge} ${colors.bright}${title}${colors.reset}`);
    if (details) {
      console.log(`    ${colors.gray}└─ Action:${colors.reset}`, sanitize(details));
    }
  },

  /**
   * Dedicated AWS Cognito Diagnostics
   */
  cognito(action: string, details: {
    email?: string;
    username?: string;
    name?: string;
    givenName?: string;
    familyName?: string;
    permanent?: boolean;
    userSub?: string;
    clientId?: string;
    userPoolId?: string;
    secretHashPresent?: boolean;
    status?: 'STARTING' | 'SUCCESS' | 'FAILED';
    error?: any;
    flow?: string;
    extra?: any;
    [key: string]: any;
  }) {
    const { email, userSub, clientId, userPoolId, secretHashPresent, status = 'STARTING', error, flow } = details;

    if (status === 'STARTING') {
      console.log(`${formatTimestamp()} ${colors.magenta}🔐 [AWS COGNITO]${colors.reset} ${colors.bright}🚀 ${action}${colors.reset}${flow ? ` (${flow})` : ''}`);
      if (email) console.log(`    ${colors.gray}├─ User / Email:${colors.reset}  ${email}`);
      if (userPoolId) console.log(`    ${colors.gray}├─ User Pool ID:${colors.reset}  ${userPoolId}`);
      if (clientId) console.log(`    ${colors.gray}├─ App Client ID:${colors.reset} ${clientId}`);
      if (secretHashPresent !== undefined) {
        console.log(`    ${colors.gray}└─ Secret Hash:${colors.reset}   ${secretHashPresent ? '✅ Included (HMAC-SHA256)' : '⚪ Not required (Public Client)'}`);
      }
    } else if (status === 'SUCCESS') {
      console.log(`${formatTimestamp()} ${colors.green}🔐 [AWS COGNITO]${colors.reset} ${colors.green}✅ ${action} Succeeded!${colors.reset}`);
      if (userSub) console.log(`    ${colors.gray}├─ Cognito UserSub:${colors.reset} ${userSub}`);
      if (email) console.log(`    ${colors.gray}└─ Authenticated:${colors.reset}   ${email}`);
    } else if (status === 'FAILED') {
      console.error(`${formatTimestamp()} ${colors.red}🔐 [AWS COGNITO]${colors.reset} ${colors.red}❌ ${action} Failed!${colors.reset}`);
      if (error) {
        const errName = error.name || error.__type || 'UnknownException';
        console.error(`    ${colors.red}├─ Error Name:${colors.reset}     ${errName}`);
        console.error(`    ${colors.red}├─ AWS Message:${colors.reset}    ${error.message || error}`);

        // Provide crystal-clear troubleshooting advice based on exact AWS Cognito error code
        if (errName === 'NotAuthorizedException' && String(error.message).includes('SECRET_HASH')) {
          console.error(`    ${colors.yellow}└─ 💡 Solution:${colors.reset} Your Cognito App Client has a Client Secret. Set COGNITO_CLIENT_SECRET=... in app/.env`);
        } else if (errName === 'NotAuthorizedException') {
          console.error(`    ${colors.yellow}└─ 💡 Solution:${colors.reset} Incorrect password, or user has not been confirmed yet.`);
        } else if (errName === 'UserNotFoundException') {
          console.error(`    ${colors.yellow}└─ 💡 Solution:${colors.reset} This user is not registered in Cognito pool "${userPoolId || 'configured'}". Sign up first.`);
        } else if (errName === 'UsernameExistsException') {
          console.error(`    ${colors.yellow}└─ 💡 Solution:${colors.reset} An account with this email already exists. Log in instead.`);
        } else if (errName === 'InvalidPasswordException') {
          console.error(`    ${colors.yellow}└─ 💡 Solution:${colors.reset} Password does not meet Cognito requirements (min 8 chars, uppercase, lowercase, number, symbol).`);
        } else if (errName === 'InvalidParameterException' && String(error.message).includes('custom:')) {
          console.error(`    ${colors.yellow}└─ 💡 Solution:${colors.reset} User pool lacks custom attributes. Creating user with standard attributes.`);
        } else if (errName === 'ResourceNotFoundException') {
          console.error(`    ${colors.yellow}└─ 💡 Solution:${colors.reset} User Pool ID "${userPoolId}" does not exist in region or is misconfigured.`);
        }
      }
    }
  },

  /**
   * Multi-Tenant Schema Routing & Isolation Diagnostics
   */
  tenant(action: string, details: {
    tenantId?: string;
    schemaName?: string;
    userEmail?: string;
    userRole?: string;
    reason?: string;
  }) {
    const { tenantId, schemaName, userEmail, userRole, reason } = details;
    console.log(`${formatTimestamp()} ${colors.yellow}🏢 [TENANT ROUTER]${colors.reset} ${colors.bright}${action}${colors.reset}`);
    if (tenantId) console.log(`    ${colors.gray}├─ Tenant Slug:${colors.reset} ${tenantId}`);
    if (schemaName) console.log(`    ${colors.gray}├─ Active Schema:${colors.reset} search_path -> "${schemaName}", public`);
    if (userEmail) console.log(`    ${colors.gray}├─ User / Role:${colors.reset}   ${userEmail} (${userRole || 'employee'})`);
    if (reason) console.log(`    ${colors.gray}└─ Resolution:${colors.reset}    ${reason}`);
  },

  /**
   * Auth & Token Verification Diagnostics
   */
  auth(action: string, details: {
    email?: string;
    sub?: string;
    role?: string;
    tenantId?: string;
    status?: 'VERIFIED' | 'FAILED' | 'EXTRACTED';
    reason?: string;
  }) {
    const { email, sub, role, tenantId, status = 'VERIFIED', reason } = details;
    if (status === 'VERIFIED') {
      console.log(`${formatTimestamp()} ${colors.blue}🛡️  [AUTH GUARD]${colors.reset} ${colors.green}Token Verified: ${email || sub}${colors.reset} ${colors.gray}[Role: ${role} | Tenant: ${tenantId}]${colors.reset}`);
    } else if (status === 'FAILED') {
      console.warn(`${formatTimestamp()} ${colors.blue}🛡️  [AUTH GUARD]${colors.reset} ${colors.red}Authentication Rejected: ${reason || 'Invalid Token'}${colors.reset}`);
    }
  },

  /**
   * Database Operation & Query Log
   */
  db(query: string, meta?: { durationMs?: number; rowCount?: number; schema?: string }) {
    const verbose =
      process.env.NODE_ENV !== 'production' || process.env.DEBUG_SQL === 'true';
    if (!verbose) return;

    const cleanQuery = query.replace(/\s+/g, ' ').trim();
    const truncated = cleanQuery.length > 120 ? `${cleanQuery.slice(0, 117)}...` : cleanQuery;
    const duration = meta?.durationMs !== undefined ? `${meta.durationMs}ms` : '';
    const rows = meta?.rowCount !== undefined ? `${meta.rowCount} row${meta.rowCount === 1 ? '' : 's'}` : '';
    const stats = [duration, rows, meta?.schema ? `schema: ${meta.schema}` : ''].filter(Boolean).join(', ');

    console.log(`${formatTimestamp()} ${colors.blue}🗄️  [DATABASE]${colors.reset} ${truncated} ${stats ? `${colors.gray}(${stats})${colors.reset}` : ''}`);
  },
};

/**
 * Express HTTP Request & Response Logging Middleware
 */
export function requestLogger(req: any, res: any, next: () => void) {
  const start = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;

  // Choose badge color by HTTP Method
  let methodBadge = `${colors.bgCyan} ${method} ${colors.reset}`;
  if (method === 'GET') methodBadge = `${colors.bgGreen} GET ${colors.reset}`;
  else if (method === 'POST') methodBadge = `${colors.bgBlue} POST ${colors.reset}`;
  else if (method === 'PUT' || method === 'PATCH') methodBadge = `${colors.bgYellow} ${method} ${colors.reset}`;
  else if (method === 'DELETE') methodBadge = `${colors.bgRed} DELETE ${colors.reset}`;

  const tenantHeader = req.headers['x-tenant-id'] || req.query.tenantId || '';
  const authHeader = req.headers.authorization ? '🔒 Bearer' : '⚪ Public';
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';

  console.log(`\n${formatTimestamp()} ${methodBadge} ${colors.bright}${url}${colors.reset} ${colors.gray}[${authHeader}${tenantHeader ? ` | Tenant: ${tenantHeader}` : ''} | IP: ${clientIp}]${colors.reset}`);

  // If there is a request body on write methods, log a sanitized preview (dev / DEBUG_HTTP only)
  const verboseHttp =
    process.env.NODE_ENV !== 'production' || process.env.DEBUG_HTTP === 'true';
  if (
    verboseHttp &&
    (method === 'POST' || method === 'PUT' || method === 'PATCH') &&
    req.body &&
    Object.keys(req.body).length > 0
  ) {
    const sanitizedBody = sanitize(req.body);
    const keys = Object.keys(sanitizedBody);
    if (keys.length <= 6) {
      console.log(`    ${colors.gray}└─ Payload:${colors.reset}`, sanitizedBody);
    } else {
      console.log(`    ${colors.gray}└─ Payload Fields:${colors.reset} [${keys.join(', ')}]`);
    }
  }

  // Intercept response finish to log status code, latency, and outcome
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;

    let statusColor = colors.green;
    let statusIcon = '✅';
    let statusBadge = `${colors.bgGreen} ${status} ${colors.reset}`;

    if (status >= 400 && status < 500) {
      statusColor = colors.yellow;
      statusIcon = '⚠️';
      statusBadge = `${colors.bgYellow} ${status} ${colors.reset}`;
    } else if (status >= 500) {
      statusColor = colors.red;
      statusIcon = '❌';
      statusBadge = `${colors.bgRed} ${status} ${colors.reset}`;
    }

    console.log(`${formatTimestamp()} ${statusIcon} ${statusBadge} ${colors.gray}${method}${colors.reset} ${url} ${colors.dim}(${duration}ms)${colors.reset}`);
  });

  next();
}
