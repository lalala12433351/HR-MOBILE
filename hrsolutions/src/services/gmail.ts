export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessageDetail {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId?: string;
  internalDate?: string;
  payload?: {
    partId?: string;
    mimeType?: string;
    filename?: string;
    headers?: GmailHeader[];
    body?: {
      size?: number;
      data?: string;
    };
    parts?: any[];
  };
  // Processed convenience properties
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  bodyText?: string;
  isRead?: boolean;
  isStarred?: boolean;
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
  messagesUnread?: number;
}

/**
 * Utility to decode Base64URL string from Gmail API
 */
export function decodeBase64Url(input: string): string {
  try {
    let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(base64), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch (err) {
    console.error('Failed to decode Base64Url', err);
    return input;
  }
}

/**
 * Helper to parse body text from Gmail payload parts recursively
 */
export function parseBodyFromPayload(payload: any): string {
  if (!payload) return '';

  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        const rawHtml = decodeBase64Url(part.body.data);
        return rawHtml.replace(/<[^>]+>/g, ' '); // simple strip HTML tags
      }
    }
    for (const part of payload.parts) {
      const nested = parseBodyFromPayload(part);
      if (nested) return nested;
    }
  }

  return '';
}

/**
 * List message IDs from user's Gmail mailbox
 */
export const listGmailMessages = async (
  accessToken: string,
  q: string = '',
  maxResults: number = 20
): Promise<{ id: string; threadId: string }[]> => {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('maxResults', maxResults.toString());
  if (q) url.searchParams.set('q', q);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to list Gmail messages (${response.status})`);
  }

  const data = await response.json();
  return data.messages || [];
};

/**
 * Fetch full message details for a single Gmail message ID
 */
export const getGmailMessage = async (
  accessToken: string,
  messageId: string
): Promise<GmailMessageDetail> => {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to get Gmail message ${messageId}`);
  }

  const msg: GmailMessageDetail = await response.json();

  // Extract headers
  const headers = msg.payload?.headers || [];
  msg.from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
  msg.to = headers.find((h) => h.name.toLowerCase() === 'to')?.value || 'Me';
  msg.subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
  msg.date = headers.find((h) => h.name.toLowerCase() === 'date')?.value || new Date().toLocaleString();

  msg.bodyText = parseBodyFromPayload(msg.payload) || msg.snippet;
  msg.isRead = !msg.labelIds?.includes('UNREAD');
  msg.isStarred = msg.labelIds?.includes('STARRED');

  return msg;
};

/**
 * Send an email via Gmail API v1
 */
export const sendGmailEmail = async (
  accessToken: string,
  emailData: { to: string; subject: string; body: string; cc?: string }
): Promise<any> => {
  // Construct RFC 2822 email format
  const lines = [
    `To: ${emailData.to}`,
    emailData.cc ? `Cc: ${emailData.cc}` : '',
    `Subject: ${emailData.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    emailData.body,
  ].filter(Boolean);

  const rawEmail = lines.join('\r\n');

  // Convert to Base64URL
  const encodedEmail = btoa(unescape(encodeURIComponent(rawEmail)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedEmail,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to send email (${response.status})`);
  }

  return await response.json();
};

/**
 * List Gmail labels
 */
export const listGmailLabels = async (accessToken: string): Promise<GmailLabel[]> => {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to list Gmail labels');
  }

  const data = await response.json();
  return data.labels || [];
};

/**
 * Modify message labels (Star, Mark Read, Trash)
 */
export const modifyGmailMessageLabels = async (
  accessToken: string,
  messageId: string,
  addLabelIds: string[] = [],
  removeLabelIds: string[] = []
): Promise<any> => {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        addLabelIds,
        removeLabelIds,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to modify message labels');
  }

  return await response.json();
};
