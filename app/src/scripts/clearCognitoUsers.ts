import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDeleteUserCommand,
  UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { env } from '../config/env.js';

const client = new CognitoIdentityProviderClient({ region: env.AWS_REGION });

export async function clearAllCognitoUsers(): Promise<number> {
  const userPoolId = env.COGNITO_USER_POOL_ID;
  console.log('=============================================================');
  console.log('🔥 COMMENCING AWS COGNITO USER POOL PURGE');
  console.log(`📍 Region:       ${env.AWS_REGION}`);
  console.log(`🆔 User Pool ID: ${userPoolId}`);
  console.log('=============================================================');

  let paginationToken: string | undefined = undefined;
  let totalDeleted = 0;

  do {
    const listCmd: ListUsersCommand = new ListUsersCommand({
      UserPoolId: userPoolId,
      PaginationToken: paginationToken,
      Limit: 60,
    });

    const res = await client.send(listCmd);
    const users: UserType[] = res.Users || [];
    paginationToken = res.PaginationToken;

    if (users.length === 0) {
      break;
    }

    console.log(`📦 Found ${users.length} user(s) in batch...`);

    for (const u of users) {
      if (!u.Username) continue;
      const emailAttr = u.Attributes?.find((a: any) => a.Name === 'email')?.Value || 'No email';
      try {
        await client.send(
          new AdminDeleteUserCommand({
            UserPoolId: userPoolId,
            Username: u.Username,
          })
        );
        totalDeleted++;
        console.log(`  🗑️ Deleted user: ${u.Username} (${emailAttr})`);
      } catch (err: any) {
        console.error(`  ❌ Failed to delete ${u.Username}:`, err.message);
      }
    }
  } while (paginationToken);

  console.log('=============================================================');
  console.log(`🎉 PURGE COMPLETE: Deleted ${totalDeleted} user(s) from AWS Cognito.`);
  console.log('=============================================================');

  return totalDeleted;
}

// Execute directly if run via CLI
clearAllCognitoUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error purging Cognito users:', err);
    process.exit(1);
  });
