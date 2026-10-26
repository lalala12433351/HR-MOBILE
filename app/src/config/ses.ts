import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { env } from './env.js';
import { log } from '../utils/logger.js';

export const sesClient = new SESv2Client({ region: env.AWS_REGION });

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/**
 * Sends a transactional email through Amazon SES v2.
 * With EMAIL_TRANSPORT=log the message (including any links) is printed instead.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const to = message.to.trim().toLowerCase();

  if (env.EMAIL_TRANSPORT === 'log') {
    log.info(
      `[email:log] To: ${to} | Subject: ${message.subject}${message.replyTo ? ` | Reply-To: ${message.replyTo}` : ''}`
    );
    console.log(`\n----- EMAIL (text) -----\n${message.text}\n------------------------\n`);
    return;
  }

  try {
    await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: env.SES_FROM_EMAIL,
        Destination: { ToAddresses: [to] },
        ReplyToAddresses: message.replyTo
          ? [message.replyTo]
          : env.SES_REPLY_TO
            ? [env.SES_REPLY_TO]
            : undefined,
        ConfigurationSetName: env.SES_CONFIGURATION_SET || undefined,
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: message.html, Charset: 'UTF-8' },
              Text: { Data: message.text, Charset: 'UTF-8' },
            },
          },
        },
      })
    );
    log.success(`Email sent via SES to ${to}`, { subject: message.subject });
  } catch (err: any) {
    log.error(
      `SES send failed for ${to}`,
      err,
      'Check the SES identity is verified in AWS_REGION, the account is out of the sandbox, and the IAM role allows ses:SendEmail.'
    );
    throw err;
  }
}

/** Tenant app origin for invite / reset / impersonate links in emails. Never localhost. */
export const APP_PIXBE_IN = 'https://app.pixbe.in';

/** Absolute URL into the tenant frontend app, used for links inside emails. */
export function frontendUrl(path: string): string {
  return `${APP_PIXBE_IN}${path.startsWith('/') ? path : `/${path}`}`;
}
