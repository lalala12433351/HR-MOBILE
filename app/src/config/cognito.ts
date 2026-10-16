import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  AdminConfirmSignUpCommand,
  AdminSetUserPasswordCommand,
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import crypto from 'crypto';
import { env } from './env.js';
import { UserRole } from '../types/index.js';

// Initialize AWS Cognito Identity Provider Client
export const cognitoClient = new CognitoIdentityProviderClient({
  region: env.AWS_REGION,
});

// AWS Cognito JWT Verifier using aws-jwt-verify (production JWKS caching and signature verification)
export const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: env.COGNITO_USER_POOL_ID,
  tokenUse: null, // Verifies both 'id' and 'access' tokens
  clientId: env.COGNITO_CLIENT_ID,
});

/**
 * Calculates Cognito SECRET_HASH if COGNITO_CLIENT_SECRET is provided.
 */
export function calculateSecretHash(username: string): string | undefined {
  if (!env.COGNITO_CLIENT_SECRET) {
    return undefined;
  }
  return crypto
    .createHmac('sha256', env.COGNITO_CLIENT_SECRET)
    .update(username + env.COGNITO_CLIENT_ID)
    .digest('base64');
}

export interface CognitoTokenPayload {
  sub: string;
  email?: string;
  'custom:role'?: string;
  'custom:tenant_id'?: string;
  'custom:db_schema'?: string;
  role?: string;
  tenant_id?: string;
  db_schema?: string;
  name?: string;
  [key: string]: any;
}

export interface CognitoAuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}

// Feature Flag: Set to true to force simulated local developer tokens
export const ENABLE_LOCAL_DEV_AUTH_FALLBACK = false;

/**
 * True only for test runs or an unconfigured placeholder Cognito pool. Unsigned `dev_` tokens
 * and simulated Cognito results are allowed solely in this mode — never against a live pool,
 * because anyone can mint a `dev_` token for any email.
 */
export function isLocalAuthFallbackEnabled(): boolean {
  return (
    ENABLE_LOCAL_DEV_AUTH_FALLBACK ||
    process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test' ||
    process.env.npm_lifecycle_event === 'test:backend' ||
    env.COGNITO_USER_POOL_ID.includes('examplepool') ||
    env.COGNITO_CLIENT_ID.includes('exampleclientid')
  );
}

import { log } from '../utils/logger.js';

/**
 * Registers a new user into AWS Cognito User Pool with emails explicitly suppressed (MessageAction: SUPPRESS).
 */
export async function cognitoSignUp(params: {
  email: string;
  password: string;
  name?: string;
  role?: string;
  tenantSlug?: string;
}): Promise<{ userSub: string; userConfirmed: boolean }> {
  const { email, password, name, role, tenantSlug } = params;
  const username = email.trim().toLowerCase();

  const secretHash = calculateSecretHash(username);

  const rawName = (name || '').trim() || username.split('@')[0] || 'Administrator';
  const nameParts = rawName.split(/\s+/);
  const givenName = nameParts[0] || 'Administrator';
  const familyName = nameParts.slice(1).join(' ') || givenName;

  log.cognito('User SignUp (Email Sending Disabled / Suppressed)', {
    email: username,
    userPoolId: env.COGNITO_USER_POOL_ID,
    clientId: env.COGNITO_CLIENT_ID,
    secretHashPresent: Boolean(secretHash),
    name: rawName,
    givenName,
    familyName,
    status: 'STARTING',
  });

  const fullAttributes = [
    { Name: 'email', Value: username },
    { Name: 'name', Value: rawName },
    { Name: 'given_name', Value: givenName },
    { Name: 'family_name', Value: familyName },
  ];

  if (role) {
    fullAttributes.push({ Name: 'custom:role', Value: role });
  }
  if (tenantSlug) {
    fullAttributes.push({ Name: 'custom:tenant_id', Value: tenantSlug });
  }

  const candidateAttributeSets = [
    // 1. All attributes (custom + standard given_name, family_name, name, email)
    fullAttributes,
    // 2. Standard attributes (given_name, family_name, name, email)
    [
      { Name: 'email', Value: username },
      { Name: 'name', Value: rawName },
      { Name: 'given_name', Value: givenName },
      { Name: 'family_name', Value: familyName },
    ],
    // 3. Name + given_name + email
    [
      { Name: 'email', Value: username },
      { Name: 'name', Value: rawName },
      { Name: 'given_name', Value: givenName },
    ],
    // 4. given_name + email
    [
      { Name: 'email', Value: username },
      { Name: 'given_name', Value: givenName },
    ],
    // 5. email only
    [
      { Name: 'email', Value: username },
    ],
  ];

  // Primary approach: AdminCreateUser with MessageAction='SUPPRESS' (Never sends any email verification or welcome email)
  let adminCreateRes: any = null;
  let lastAdminErr: any = null;

  for (let i = 0; i < candidateAttributeSets.length; i++) {
    const attributes = [
      ...candidateAttributeSets[i],
      { Name: 'email_verified', Value: 'true' },
    ];
    try {
      const adminCreate = new AdminCreateUserCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Username: username,
        MessageAction: 'SUPPRESS', // Disables all Cognito email sending
        UserAttributes: attributes,
      });
      adminCreateRes = await cognitoClient.send(adminCreate);
      lastAdminErr = null;
      break;
    } catch (attrErr: any) {
      lastAdminErr = attrErr;
      if (attrErr.name === 'UsernameExistsException') {
        break;
      }
      if (attrErr.name === 'InvalidParameterException' && i < candidateAttributeSets.length - 1) {
        log.warn(`AdminCreateUser attempt ${i + 1} rejected with InvalidParameterException ("${attrErr.message}"). Retrying next candidate...`);
        continue;
      }
      break;
    }
  }

  if (adminCreateRes) {
    const userSub =
      adminCreateRes.User?.Attributes?.find((a: any) => a.Name === 'sub')?.Value ||
      adminCreateRes.User?.Username ||
      username;

    const cognitoUsername = adminCreateRes.User?.Username || username;

    // Set permanent password so no temporary password emails or reset challenges are required
    await cognitoAdminSetUserPassword({ username: cognitoUsername, password, permanent: true });
    // Admin-confirm user explicitly to set status=CONFIRMED and email_verified=true
    await cognitoAdminConfirmUser(cognitoUsername);

    log.cognito('User SignUp (AdminCreateUser - Email Suppressed)', {
      email: username,
      userSub,
      status: 'SUCCESS',
    });

    return { userSub, userConfirmed: true };
  }

  if (lastAdminErr) {
    if (lastAdminErr.name === 'UsernameExistsException') {
      log.info(`User "${username}" already exists in Cognito. Ensuring password is set and account is confirmed.`);
      try {
        await cognitoAdminSetUserPassword({ username, password, permanent: true });
        await cognitoAdminConfirmUser(username);
      } catch (_) {}
      return { userSub: username, userConfirmed: true };
    }

    if (isLocalAuthFallbackEnabled()) {
      log.warn(`Cognito signup falling back for test environment: ${lastAdminErr.message}`);
      return { userSub: `sub_test_${Date.now()}`, userConfirmed: true };
    }

    log.error(`AdminCreateUser failed: ${lastAdminErr.message}`);
    throw lastAdminErr;
  }

  return { userSub: username, userConfirmed: true };
}

/**
 * Creates a user directly in Cognito with email notifications suppressed (MessageAction: 'SUPPRESS').
 */
export async function cognitoAdminCreateUser(params: {
  email: string;
  password?: string;
  name?: string;
  role?: string;
  tenantSlug?: string;
  suppressEmail?: boolean;
}): Promise<{ userSub: string }> {
  const { email, password, name, role, tenantSlug, suppressEmail = true } = params;
  const username = email.trim().toLowerCase();

  const rawName = (name || '').trim() || username.split('@')[0] || 'User';
  const nameParts = rawName.split(/\s+/);
  const givenName = nameParts[0] || 'User';
  const familyName = nameParts.slice(1).join(' ') || givenName;

  const attributes = [
    { Name: 'email', Value: username },
    { Name: 'name', Value: rawName },
    { Name: 'given_name', Value: givenName },
    { Name: 'family_name', Value: familyName },
    { Name: 'email_verified', Value: 'true' },
  ];
  if (role) attributes.push({ Name: 'custom:role', Value: role });
  if (tenantSlug) attributes.push({ Name: 'custom:tenant_id', Value: tenantSlug });

  const createWithAttributes = async (attrs: { Name: string; Value: string }[]) => {
    const createCmd = new AdminCreateUserCommand({
      UserPoolId: env.COGNITO_USER_POOL_ID,
      Username: username,
      MessageAction: suppressEmail ? 'SUPPRESS' : undefined,
      UserAttributes: attrs,
      TemporaryPassword: password || undefined,
    });
    const res = await cognitoClient.send(createCmd);
    return (
      res.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ||
      res.User?.Username ||
      ''
    );
  };

  try {
    let userSub = '';
    try {
      userSub = await createWithAttributes(attributes);
    } catch (attrErr: any) {
      // Some pools reject custom:* attributes — retry with standard attrs only.
      if (attrErr?.name === 'InvalidParameterException' && (role || tenantSlug)) {
        const baseAttrs = attributes.filter((a) => !a.Name.startsWith('custom:'));
        userSub = await createWithAttributes(baseAttrs);
      } else {
        throw attrErr;
      }
    }

    if (password) {
      await cognitoAdminSetUserPassword({ username, password, permanent: true });
    }

    if (!userSub) {
      const lookedUp = await cognitoFindUserSubByEmail(username);
      userSub = lookedUp || `sub_${Date.now()}`;
    }

    return { userSub };
  } catch (error: any) {
    // Never pretend Cognito succeeded for live pools — that leaves "Not Activated"
    // employees who cannot log in because no real Cognito user exists.
    if (isLocalAuthFallbackEnabled()) {
      return { userSub: `sub_dev_${Date.now()}` };
    }
    throw error;
  }
}

/**
 * Resolves the Cognito `sub` for an email username (pool may use email as Username).
 */
export async function cognitoFindUserSubByEmail(email: string): Promise<string | null> {
  const username = email.trim().toLowerCase();
  try {
    const listCmd = new ListUsersCommand({
      UserPoolId: env.COGNITO_USER_POOL_ID,
      Filter: `email = "${username}"`,
      Limit: 1,
    });
    const listRes = await cognitoClient.send(listCmd);
    const user = listRes.Users?.[0];
    if (!user) return null;
    return user.Attributes?.find((a) => a.Name === 'sub')?.Value || user.Username || null;
  } catch (err: any) {
    log.warn(`Could not look up Cognito user for ${username}`, err);
    return null;
  }
}

/**
 * Permanently removes every Cognito user registered under this email.
 * Returns false (instead of throwing) when Cognito is unreachable, so callers can
 * treat identity cleanup as best-effort after the database delete has committed.
 */
export async function cognitoAdminDeleteUserByEmail(email: string): Promise<boolean> {
  const username = email.trim().toLowerCase();
  const usernames = new Set<string>([username]);

  try {
    const listRes = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Filter: `email = "${username.replace(/"/g, '')}"`,
      })
    );
    for (const u of listRes.Users || []) {
      if (u.Username) usernames.add(u.Username);
    }
  } catch (_) {}

  let ok = true;
  for (const target of usernames) {
    try {
      await cognitoClient.send(
        new AdminDeleteUserCommand({ UserPoolId: env.COGNITO_USER_POOL_ID, Username: target })
      );
      log.cognito('AdminDeleteUser', { username: target, status: 'SUCCESS' });
    } catch (err: any) {
      if (err?.name === 'UserNotFoundException' || isLocalAuthFallbackEnabled()) continue;
      ok = false;
      log.cognito('AdminDeleteUser', { username: target, status: 'FAILED', error: err });
    }
  }
  return ok;
}

/**
 * Admin confirms an unconfirmed Cognito user account and marks email_verified=true
 */
export async function cognitoAdminConfirmUser(username: string): Promise<boolean> {
  const cleanUser = username.trim().toLowerCase();
  const usernamesToConfirm: string[] = [cleanUser];

  if (cleanUser.includes('@')) {
    try {
      const listCmd = new ListUsersCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Filter: `email = "${cleanUser}"`,
      });
      const listRes = await cognitoClient.send(listCmd);
      if (listRes.Users && listRes.Users.length > 0) {
        for (const u of listRes.Users) {
          if (u.Username && !usernamesToConfirm.includes(u.Username)) {
            usernamesToConfirm.push(u.Username);
          }
        }
      }
    } catch (_) {}
  }

  let confirmedAny = false;

  for (const targetUser of usernamesToConfirm) {
    try {
      const adminConfirm = new AdminConfirmSignUpCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Username: targetUser,
      });
      await cognitoClient.send(adminConfirm);
      confirmedAny = true;
    } catch (err: any) {
      if (err.message?.includes('CONFIRMED')) {
        confirmedAny = true;
      }
    }

    try {
      const updateAttr = new AdminUpdateUserAttributesCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Username: targetUser,
        UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
      });
      await cognitoClient.send(updateAttr);
    } catch (_) {}
  }

  if (confirmedAny) {
    log.info(`Successfully admin-confirmed Cognito user "${cleanUser}" (email_verified=true)`);
  }
  return confirmedAny;
}

/**
 * Authenticates user credentials via Cognito InitiateAuthCommand using USER_PASSWORD_AUTH.
 */
export async function cognitoLogin(params: {
  email: string;
  password: string;
}): Promise<CognitoAuthTokens> {
  const { email, password } = params;
  const username = email.trim().toLowerCase();

  const authParameters: Record<string, string> = {
    USERNAME: username,
    PASSWORD: password,
  };
  const secretHash = calculateSecretHash(username);
  if (secretHash) {
    authParameters.SECRET_HASH = secretHash;
  }

  log.cognito('InitiateAuth (USER_PASSWORD_AUTH)', {
    email: username,
    userPoolId: env.COGNITO_USER_POOL_ID,
    clientId: env.COGNITO_CLIENT_ID,
    secretHashPresent: Boolean(secretHash),
    status: 'STARTING',
  });

  const command = new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: env.COGNITO_CLIENT_ID,
    AuthParameters: authParameters,
  });

  try {
    let response;
    try {
      response = await cognitoClient.send(command);
    } catch (authErr: any) {
      // If user is unconfirmed, attempt admin auto-confirm, set email_verified=true, and retry
      if (authErr.name === 'UserNotConfirmedException') {
        const confirmed = await cognitoAdminConfirmUser(username);
        if (confirmed) {
          log.info(`Auto-confirmed unconfirmed user "${username}" and retrying login`);
          response = await cognitoClient.send(command);
        } else {
          throw authErr;
        }
      } else {
        throw authErr;
      }
    }

    const result = response.AuthenticationResult;

    if (!result || !result.IdToken || !result.AccessToken) {
      throw new Error('Authentication succeeded but did not return valid token set.');
    }

    log.cognito('InitiateAuth (USER_PASSWORD_AUTH)', {
      email: username,
      status: 'SUCCESS',
    });

    return {
      idToken: result.IdToken,
      accessToken: result.AccessToken,
      refreshToken: result.RefreshToken,
      expiresIn: result.ExpiresIn,
      tokenType: result.TokenType || 'Bearer',
    };
  } catch (error: any) {
    log.cognito('InitiateAuth (USER_PASSWORD_AUTH)', {
      email: username,
      userPoolId: env.COGNITO_USER_POOL_ID,
      clientId: env.COGNITO_CLIENT_ID,
      status: 'FAILED',
      error,
    });

    if (isLocalAuthFallbackEnabled()) {
      console.warn('⚠️ Cognito InitiateAuthCommand fallback for mock/test credentials:', error.message);
      return {
        idToken: `dev_token_id_${Buffer.from(JSON.stringify({ email, sub: `dev_sub_${email}` })).toString('base64')}`,
        accessToken: `dev_token_access_${Buffer.from(JSON.stringify({ email, sub: `dev_sub_${email}` })).toString('base64')}`,
        refreshToken: `dev_token_refresh_${Date.now()}`,
        expiresIn: 3600,
        tokenType: 'Bearer',
      };
    }
    throw error;
  }
}

/**
 * Refreshes an expired access token using Cognito REFRESH_TOKEN_AUTH.
 */
export async function cognitoRefreshToken(refreshToken: string, username?: string): Promise<Omit<CognitoAuthTokens, 'refreshToken'>> {
  const secretHash = username ? calculateSecretHash(username) : undefined;

  log.cognito('Token Refresh (REFRESH_TOKEN_AUTH)', {
    email: username || 'Session Refresh',
    userPoolId: env.COGNITO_USER_POOL_ID,
    clientId: env.COGNITO_CLIENT_ID,
    secretHashPresent: Boolean(secretHash),
    status: 'STARTING',
  });

  try {
    const authParameters: Record<string, string> = {
      REFRESH_TOKEN: refreshToken,
    };
    if (username && secretHash) {
      authParameters.SECRET_HASH = secretHash;
    }

    const command = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: env.COGNITO_CLIENT_ID,
      AuthParameters: authParameters,
    });

    const response = await cognitoClient.send(command);
    const result = response.AuthenticationResult;

    if (!result || !result.IdToken || !result.AccessToken) {
      throw new Error('Token refresh succeeded but did not return valid tokens.');
    }

    log.cognito('Token Refresh (REFRESH_TOKEN_AUTH)', {
      email: username || 'Session Refresh',
      status: 'SUCCESS',
    });

    return {
      idToken: result.IdToken,
      accessToken: result.AccessToken,
      expiresIn: result.ExpiresIn,
      tokenType: result.TokenType || 'Bearer',
    };
  } catch (error: any) {
    log.cognito('Token Refresh (REFRESH_TOKEN_AUTH)', {
      email: username || 'Session Refresh',
      status: 'FAILED',
      error,
    });
    if (isLocalAuthFallbackEnabled()) {
      console.warn('⚠️ Cognito Token Refresh fallback for mock/test credentials:', error.message);
      return {
        idToken: `dev_token_id_refreshed_${Date.now()}`,
        accessToken: `dev_token_access_refreshed_${Date.now()}`,
        expiresIn: 3600,
        tokenType: 'Bearer',
      };
    }
    throw error;
  }
}

/**
 * Validates token signature and expiration via aws-jwt-verify against Cognito User Pool.
 */
export async function verifyCognitoToken(token: string): Promise<CognitoTokenPayload> {
  const isDevOrTest = isLocalAuthFallbackEnabled();

  if (token.startsWith('dev_')) {
    if (!isDevOrTest) {
      log.warn('Rejected unsigned dev_ token: local auth fallback is disabled');
      throw new Error('Unsigned development tokens are not accepted by this environment.');
    }
    try {
      const parts = token.split('_');
      const b64 = parts[parts.length - 1];
      const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      return {
        sub: parsed.sub || `dev_user_${parsed.email || 'admin'}`,
        email: parsed.email || 'admin@demo.com',
        role: parsed['custom:role'] || parsed.role || 'super_admin',
        tenant_id: parsed['custom:tenant_id'] || parsed.tenant_id || 'demo',
        db_schema: parsed['custom:db_schema'] || parsed.db_schema || 'tenant_demo',
        name: parsed.name || 'Admin User',
      };
    } catch (_) {
      return {
        sub: 'dev_user_admin',
        email: 'admin@demo.com',
        role: 'super_admin',
        tenant_id: 'demo',
        db_schema: 'tenant_demo',
        name: 'Dev Admin',
      };
    }
  }

  // Strict live verification against official AWS Cognito User Pool with JWKS caching
  try {
    const payload = await jwtVerifier.verify(token);
    return payload as CognitoTokenPayload;
  } catch (err: any) {
    if (isDevOrTest) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
          return JSON.parse(payloadJson) as CognitoTokenPayload;
        }
      } catch (_) {}
    }
    throw err;
  }
}

/**
 * Sets permanent password for a user in AWS Cognito User Pool via AdminSetUserPasswordCommand.
 */
export async function cognitoAdminSetUserPassword(params: {
  username: string;
  password: string;
  permanent?: boolean;
}): Promise<void> {
  const { username, password, permanent = true } = params;
  const cleanUsername = username.trim();
  const targetUsernames: string[] = [cleanUsername];

  if (cleanUsername.includes('@')) {
    try {
      const listCmd = new ListUsersCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Filter: `email = "${cleanUsername.toLowerCase()}"`,
      });
      const listRes = await cognitoClient.send(listCmd);
      if (listRes.Users && listRes.Users.length > 0) {
        for (const u of listRes.Users) {
          if (u.Username && !targetUsernames.includes(u.Username)) {
            targetUsernames.push(u.Username);
          }
        }
      }
    } catch (_) {}
  }

  log.cognito('AdminSetUserPassword', {
    username: cleanUsername,
    userPoolId: env.COGNITO_USER_POOL_ID,
    permanent,
    status: 'STARTING',
  });

  for (const uName of targetUsernames) {
    try {
      const command = new AdminSetUserPasswordCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Username: uName,
        Password: password.trim(),
        Permanent: permanent,
      });
      await cognitoClient.send(command);
      log.cognito('AdminSetUserPassword', {
        username: uName,
        status: 'SUCCESS',
      });
    } catch (error: any) {
      log.cognito('AdminSetUserPassword', {
        username: uName,
        status: 'FAILED',
        error,
      });
      if (isLocalAuthFallbackEnabled()) return;
    }
  }
}

