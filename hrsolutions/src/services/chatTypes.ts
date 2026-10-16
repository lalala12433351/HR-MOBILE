export type ConversationType = 'team_channel' | 'group' | 'direct' | 'hr_ticket';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ChatParticipant {
  employeeId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  employeeRole: string | null;
  lastReadAt: string | null;
  lastReadMessageId: string | null;
}

export interface ChatTicketInfo {
  status: TicketStatus;
  category: string | null;
  priority: TicketPriority;
  assignedHrId: string | null;
  assignedHrName: string | null;
  resolvedAt: string | null;
}

export interface ChatConversation {
  id: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  avatar: string | null;
  teamId: string | null;
  teamName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  createdBy: string | null;
  createdByName: string | null;
  isArchived: boolean;
  lastMessageAt: string | null;
  createdAt: string | null;
  myRole: 'owner' | 'admin' | 'member' | null;
  isParticipant: boolean;
  muted: boolean;
  unreadCount: number;
  lastMessage: {
    id: string;
    body: string;
    type: 'text' | 'system' | 'file';
    senderId: string | null;
    senderName: string | null;
    createdAt: string | null;
    isDeleted: boolean;
    hasAttachments: boolean;
  } | null;
  ticket: ChatTicketInfo | null;
  participants: ChatParticipant[];
}

export interface ChatAttachment {
  id: string;
  fileKey: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  /** Client-only object URL for optimistic image/video previews. */
  localPreviewUrl?: string;
}

export interface ChatReaction {
  emoji: string;
  employeeIds: string[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string | null;
  senderAvatar: string | null;
  body: string;
  type: 'text' | 'system' | 'file';
  parentMessageId: string | null;
  parent: { id: string; senderName: string | null; body: string; isDeleted: boolean } | null;
  replyCount: number;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string | null;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
  clientId?: string;
  /** Client-only delivery state for optimistic messages. */
  status?: 'sending' | 'failed';
}

export interface ChatPerson {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  departmentName: string | null;
  jobTitle: string | null;
}

export interface ChatMe {
  employeeId: string;
  name: string;
  role: string;
  ticketCategories: string[];
}

export interface ChatAttachmentInput {
  fileKey: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number;
}
