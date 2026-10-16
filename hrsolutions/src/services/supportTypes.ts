export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportAuthorKind = 'user' | 'support';

export interface SupportMessage {
  id: string;
  threadId: string;
  authorKind: SupportAuthorKind;
  authorName: string | null;
  body: string;
  createdAt: string;
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
  status: SupportStatus;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
}
