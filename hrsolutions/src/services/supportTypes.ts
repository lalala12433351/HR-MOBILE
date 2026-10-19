export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SupportAuthorKind = 'user' | 'support';

export interface SupportAttachment {
  id: string;
  messageId: string;
  fileKey: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  downloadUrl?: string;
}

export interface SupportAttachmentInput {
  fileKey: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number;
}

export interface SupportMessage {
  id: string;
  threadId: string;
  authorKind: SupportAuthorKind;
  authorName: string | null;
  body: string;
  createdAt: string;
  attachments: SupportAttachment[];
}

export interface SupportThread {
  id: string;
  ticketNumber: string;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  tenantSchema: string | null;
  requesterEmployeeId: string;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  category: string;
  priority: SupportPriority;
  status: SupportStatus;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
}

export const SUPPORT_CATEGORIES = [
  'Product',
  'License & billing',
  'Login & access',
  'Attendance & leave',
  'Other',
] as const;

export const SUPPORT_MAIL = 'support@pixbe.in';
