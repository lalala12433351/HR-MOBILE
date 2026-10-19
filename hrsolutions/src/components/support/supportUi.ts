import { api } from '@/services/apiClient';
import type { SupportAttachmentInput, SupportPriority, SupportStatus } from '@/services/supportTypes';
import { SUPPORT_MAIL } from '@/services/supportTypes';

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function supportStatusClass(status: SupportStatus): string {
  switch (status) {
    case 'open':
      return 'bg-[#e7eef0] text-[#17324e] dark:bg-white/10 dark:text-slate-100';
    case 'in_progress':
      return 'bg-[#d8e8f2] text-[#17324e] dark:bg-sky-500/15 dark:text-sky-200';
    case 'resolved':
      return 'bg-[#eaf1ee] text-[#2f5d45] dark:bg-emerald-500/15 dark:text-emerald-200';
    case 'closed':
    default:
      return 'bg-[var(--bg-surface-subtle)] text-[var(--text-muted)]';
  }
}

export function supportMailto(subject?: string): string {
  const next = (subject || 'Pixbe support').trim() || 'Pixbe support';
  return `mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent(next)}`;
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function uploadSupportFiles(
  files: File[],
  mode: { kind: 'tenant' } | { kind: 'platform'; ticketId: string }
): Promise<SupportAttachmentInput[]> {
  const uploaded: SupportAttachmentInput[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`"${file.name}" is larger than 25 MB. Share a smaller file or a link instead.`);
    }
    const payload = {
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileSizeBytes: file.size,
    };
    const presigned =
      mode.kind === 'tenant'
        ? await api.support.createUpload(payload)
        : await api.controlPlane.createSupportUpload(mode.ticketId, payload);
    const { uploadUrl, s3Key } = presigned.data as { uploadUrl: string; s3Key: string };
    await api.storage.uploadFileToS3(uploadUrl, file);
    uploaded.push({ fileKey: s3Key, fileName: file.name, mimeType: file.type || null, sizeBytes: file.size });
  }
  return uploaded;
}
