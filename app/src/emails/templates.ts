import { env } from '../config/env.js';
import {
  RenderedEmail,
  brand,
  button,
  codeBlock,
  detailsPanel,
  escapeHtml,
  linkFallback,
  notice,
  paragraph,
  renderLayout,
  strong,
} from './layout.js';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Administrator',
  hr_manager: 'HR Manager',
  manager: 'Manager',
  employee: 'Employee',
  faculty: 'Faculty',
  teacher: 'Teacher',
};

export function roleLabel(role?: string | null): string {
  if (!role) return 'Employee';
  return ROLE_LABELS[role] || role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatExpiry(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours === 1) return '1 hour';
  if (hours % 24 === 0) return hours === 24 ? '24 hours' : `${hours / 24} days`;
  return `${hours} hours`;
}

export function inviteEmployeeEmail(p: {
  firstName?: string;
  email: string;
  workspaceName: string;
  role?: string;
  invitedBy?: string;
  url: string;
  expiresInHours: number;
}): RenderedEmail {
  const name = p.firstName?.trim() || 'there';
  const role = roleLabel(p.role);
  const expiry = formatExpiry(p.expiresInHours);
  const inviter = p.invitedBy?.trim();
  const brandName = env.EMAIL_BRAND_NAME;

  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(
      `${inviter ? `${strong(inviter)} invited you` : 'You’ve been invited'} to join ${strong(p.workspaceName)} on ${escapeHtml(brandName)}. Create a password to activate your account.`
    ),
    detailsPanel([
      ['Workspace', p.workspaceName],
      ['Role', role],
      ['Email', p.email],
    ]),
    button('Accept invite', p.url),
    linkFallback(p.url),
    notice(
      `This invite expires in ${expiry} and works once. If you weren’t expecting it, you can ignore this email.`
    ),
  ].join('');

  return {
    subject: inviter
      ? `${inviter} invited you to join ${p.workspaceName} on ${brandName}`
      : `You’re invited to join ${p.workspaceName} on ${brandName}`,
    html: renderLayout({
      preheader: `Create your password to get started. The invite expires in ${expiry}.`,
      heading: `Join ${p.workspaceName}`,
      bodyHtml,
      workspaceName: p.workspaceName,
    }),
    text: [
      `Hi ${name},`,
      '',
      `${inviter ? `${inviter} invited you` : 'You’ve been invited'} to join ${p.workspaceName} on ${brandName} as ${role}.`,
      `Email: ${p.email}`,
      '',
      `Accept the invite: ${p.url}`,
      '',
      `This invite expires in ${expiry} and works once.`,
    ].join('\n'),
  };
}

export function verifyEmailCodeEmail(p: { name?: string; code: string; expiresInMinutes: number }): RenderedEmail {
  const name = p.name?.trim() || 'there';
  const brandName = env.EMAIL_BRAND_NAME;

  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(`Enter this code to confirm your email and finish setting up ${escapeHtml(brandName)}.`),
    codeBlock(p.code),
    paragraph(`<span class="muted" style="font-size:13px;color:${brand.muted};">Expires in ${p.expiresInMinutes} minutes.</span>`),
    notice(
      `Never share this code. ${escapeHtml(brandName)} will never ask for it. If you didn’t try to sign up, you can ignore this email.`
    ),
  ].join('');

  return {
    subject: `${p.code} is your ${brandName} verification code`,
    html: renderLayout({
      preheader: `Your code is ${p.code}. It expires in ${p.expiresInMinutes} minutes.`,
      heading: 'Confirm your email',
      bodyHtml,
    }),
    text: [
      `Hi ${name},`,
      '',
      `Your ${brandName} verification code is: ${p.code}`,
      `It expires in ${p.expiresInMinutes} minutes. Never share this code.`,
    ].join('\n'),
  };
}

export function changeLoginEmailCodeEmail(p: {
  firstName?: string;
  code: string;
  newEmail: string;
  url: string;
  expiresInMinutes: number;
}): RenderedEmail {
  const name = p.firstName?.trim() || 'there';
  const brandName = env.EMAIL_BRAND_NAME;

  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(`Enter this code to confirm ${strong(p.newEmail)} as your login email for ${escapeHtml(brandName)}.`),
    codeBlock(p.code),
    paragraph(`<span class="muted" style="font-size:13px;color:${brand.muted};">Expires in ${p.expiresInMinutes} minutes.</span>`),
    button('Enter the code', p.url),
    linkFallback(p.url),
    notice(`Never share this code. ${escapeHtml(brandName)} will never ask for it. If you didn’t request this change, you can ignore this email.`),
  ].join('');

  return {
    subject: `${p.code} confirms your new ${brandName} login email`,
    html: renderLayout({
      preheader: `Your code is ${p.code}. It expires in ${p.expiresInMinutes} minutes.`,
      heading: 'Confirm your new login email',
      bodyHtml,
    }),
    text: [
      `Hi ${name},`,
      '',
      `Your code to confirm ${p.newEmail} as your ${brandName} login email is: ${p.code}`,
      `It expires in ${p.expiresInMinutes} minutes.`,
      '',
      `Enter it here: ${p.url}`,
      '',
      'Never share this code. If you didn’t request this change, you can ignore this email.',
    ].join('\n'),
  };
}

export function changeLoginEmailNoticeEmail(p: { firstName?: string; newEmail: string }): RenderedEmail {
  const name = p.firstName?.trim() || 'there';
  const brandName = env.EMAIL_BRAND_NAME;
  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(`A change of your ${escapeHtml(brandName)} login email to ${strong(p.newEmail)} was requested.`),
    notice('Your current login still works until that address confirms the code. If you didn’t request this, ask your administrator to leave the login email as it is.'),
  ].join('');

  return {
    subject: `A login email change was requested on ${brandName}`,
    html: renderLayout({
      preheader: `A change to ${p.newEmail} was requested. Your current login still works.`,
      heading: 'Login email change requested',
      bodyHtml,
    }),
    text: [
      `Hi ${name},`,
      '',
      `A change of your ${brandName} login email to ${p.newEmail} was requested.`,
      'Your current login still works until that address confirms the code.',
      'If you didn’t request this, ask your administrator to leave the login email as it is.',
    ].join('\n'),
  };
}

export function passwordResetEmail(p: {
  firstName?: string;
  workspaceName?: string;
  url: string;
  expiresInHours: number;
}): RenderedEmail {
  const name = p.firstName?.trim() || 'there';
  const expiry = formatExpiry(p.expiresInHours);
  const account = p.workspaceName || env.EMAIL_BRAND_NAME;

  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(`We received a request to reset the password for your ${strong(account)} account.`),
    button('Choose a new password', p.url),
    linkFallback(p.url),
    notice(
      `This link expires in ${expiry} and works once. If you didn’t request a reset, ignore this email — your password won’t change.`
    ),
  ].join('');

  return {
    subject: `Reset your ${account} password`,
    html: renderLayout({
      preheader: `Choose a new password. The link expires in ${expiry}.`,
      heading: 'Reset your password',
      bodyHtml,
      workspaceName: p.workspaceName,
    }),
    text: [
      `Hi ${name},`,
      '',
      `We received a request to reset the password for your ${account} account.`,
      `Choose a new password: ${p.url}`,
      '',
      `This link expires in ${expiry}. If you didn't request this, ignore this email.`,
    ].join('\n'),
  };
}

export function passwordChangedEmail(p: {
  firstName?: string;
  workspaceName?: string;
  reason: 'activated' | 'reset';
  loginUrl: string;
}): RenderedEmail {
  const name = p.firstName?.trim() || 'there';
  const workspace = p.workspaceName || env.EMAIL_BRAND_NAME;
  const when = new Date().toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }) + ' IST';
  const activated = p.reason === 'activated';

  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(
      activated
        ? `Your ${strong(workspace)} account is ready. Sign in with your email and the password you just created.`
        : `The password for your ${strong(workspace)} account was just changed.`
    ),
    detailsPanel([
      ['Workspace', workspace],
      [activated ? 'Activated' : 'Changed', when],
    ]),
    button(activated ? 'Go to dashboard' : 'Sign in', p.loginUrl),
    notice(`Didn’t do this? Reset your password right away and let your workspace administrator know.`),
  ].join('');

  return {
    subject: activated ? `Your ${workspace} account is ready` : `Your ${workspace} password was changed`,
    html: renderLayout({
      preheader: activated ? 'Your account is active — you can sign in now.' : 'Your password was just changed.',
      heading: activated ? 'You’re all set' : 'Password changed',
      bodyHtml,
      workspaceName: p.workspaceName,
    }),
    text: [
      `Hi ${name},`,
      '',
      activated
        ? `Your ${workspace} account is ready. Sign in: ${p.loginUrl}`
        : `The password for your ${workspace} account was changed on ${when}.`,
      '',
      "Didn't do this? Reset your password and contact your administrator.",
    ].join('\n'),
  };
}

export function employeeInfoUpdatedEmail(p: {
  firstName?: string;
  actorName?: string;
  workspaceName?: string;
}): RenderedEmail {
  const name = p.firstName?.trim() || 'there';
  const workspace = p.workspaceName || env.EMAIL_BRAND_NAME;
  const actor = p.actorName?.trim();

  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(
      actor
        ? `${strong(actor)} updated information on your ${strong(workspace)} employee profile.`
        : `Information on your ${strong(workspace)} employee profile was updated.`
    ),
    paragraph('Sign in to review your details and let HR know if anything looks incorrect.'),
    notice('This is an automated notice. Bank and payroll details stay limited to HR and administrators.'),
  ].join('');

  return {
    subject: `Your ${workspace} profile was updated`,
    html: renderLayout({
      preheader: 'HR updated information on your employee profile.',
      heading: 'Profile updated',
      bodyHtml,
      workspaceName: p.workspaceName,
    }),
    text: [
      `Hi ${name},`,
      '',
      actor
        ? `${actor} updated information on your ${workspace} employee profile.`
        : `Information on your ${workspace} employee profile was updated.`,
      'Sign in to review your details.',
    ].join('\n'),
  };
}

export function supportTicketOpenedEmail(p: {
  ticketNumber: string;
  workspaceName: string;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  body: string;
}): RenderedEmail {
  const brandName = env.EMAIL_BRAND_NAME;
  const bodyHtml = [
    paragraph(`A new ${escapeHtml(brandName)} support thread was opened from ${strong(p.workspaceName)}.`),
    detailsPanel([
      ['Ticket', p.ticketNumber],
      ['Workspace', p.workspaceName],
      ['From', `${p.requesterName} <${p.requesterEmail}>`],
      ['Subject', p.subject],
    ]),
    paragraph(escapeHtml(p.body).replace(/\n/g, '<br/>')),
    notice('Reply in Master Admin → Support, or reply to this email to reach the requester directly.'),
  ].join('');

  return {
    subject: `[${p.ticketNumber}] ${p.subject}`,
    html: renderLayout({
      preheader: `${p.requesterName} asked for help from ${p.workspaceName}.`,
      heading: 'New support request',
      bodyHtml,
      workspaceName: p.workspaceName,
    }),
    text: [
      `New ${brandName} support thread ${p.ticketNumber}`,
      `Workspace: ${p.workspaceName}`,
      `From: ${p.requesterName} <${p.requesterEmail}>`,
      `Subject: ${p.subject}`,
      '',
      p.body,
    ].join('\n'),
  };
}

export function supportTicketFollowUpEmail(p: {
  ticketNumber: string;
  workspaceName: string;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  body: string;
}): RenderedEmail {
  const bodyHtml = [
    paragraph(`${strong(p.requesterName)} added a message to ${p.ticketNumber} (${escapeHtml(p.workspaceName)}).`),
    paragraph(escapeHtml(p.body).replace(/\n/g, '<br/>')),
  ].join('');

  return {
    subject: `Re: [${p.ticketNumber}] ${p.subject}`,
    html: renderLayout({
      preheader: `${p.requesterName} replied in ${p.ticketNumber}.`,
      heading: 'Support follow-up',
      bodyHtml,
      workspaceName: p.workspaceName,
    }),
    text: [`${p.requesterName} <${p.requesterEmail}> replied on ${p.ticketNumber}:`, '', p.body].join('\n'),
  };
}

export function licenseExpiryEmail(p: {
  firstName?: string;
  workspaceName: string;
  planName: string;
  daysRemaining: number;
  expired: boolean;
  seatsUsed?: number;
  maxSeats?: number;
  settingsUrl: string;
}): RenderedEmail {
  const name = p.firstName?.trim() || 'there';
  const days = Math.max(0, p.daysRemaining);
  const heading = p.expired ? 'Your Pixbe license has expired' : 'Your Pixbe license is ending soon';
  const when = p.expired
    ? `${escapeHtml(p.planName)} for ${escapeHtml(p.workspaceName)} has expired. New people cannot be added until the license is extended.`
    : `${escapeHtml(p.planName)} for ${escapeHtml(p.workspaceName)} expires in ${days} day${days === 1 ? '' : 's'}.`;
  const seats =
    p.maxSeats != null
      ? paragraph(`${p.seatsUsed ?? 0} of ${p.maxSeats} seats are in use.`)
      : '';
  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(when),
    seats,
    paragraph('Open License in Settings for dates and seats. Pixbe support can extend or change the plan.'),
    button('Open license settings', p.settingsUrl),
    linkFallback(p.settingsUrl),
  ].join('');

  return {
    subject: p.expired
      ? `${p.workspaceName}: ${p.planName} license expired`
      : `${p.workspaceName}: ${p.planName} expires in ${days} day${days === 1 ? '' : 's'}`,
    html: renderLayout({
      preheader: p.expired ? 'Your workspace license has expired.' : `License expires in ${days} day${days === 1 ? '' : 's'}.`,
      heading,
      bodyHtml,
      workspaceName: p.workspaceName,
    }),
    text: [
      `Hi ${name},`,
      '',
      p.expired
        ? `${p.planName} for ${p.workspaceName} has expired.`
        : `${p.planName} for ${p.workspaceName} expires in ${days} day${days === 1 ? '' : 's'}.`,
      p.maxSeats != null ? `${p.seatsUsed ?? 0} of ${p.maxSeats} seats are in use.` : '',
      '',
      `Open license settings: ${p.settingsUrl}`,
    ]
      .filter((line) => line !== undefined)
      .join('\n'),
  };
}

export function supportStaffReplyEmail(p: {
  firstName?: string;
  ticketNumber: string;
  workspaceName: string;
  subject: string;
  body: string;
  settingsUrl: string;
}): RenderedEmail {
  const name = p.firstName?.trim() || 'there';
  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(`Pixbe Support replied to your request ${strong(p.ticketNumber)} (${escapeHtml(p.subject)}).`),
    paragraph(escapeHtml(p.body).replace(/\n/g, '<br/>')),
    button('Open in Settings', p.settingsUrl),
    linkFallback(p.settingsUrl),
  ].join('');

  return {
    subject: `Re: [${p.ticketNumber}] ${p.subject}`,
    html: renderLayout({
      preheader: 'Pixbe Support replied to your request.',
      heading: 'Support reply',
      bodyHtml,
      workspaceName: p.workspaceName,
    }),
    text: [
      `Hi ${name},`,
      '',
      `Pixbe Support replied to ${p.ticketNumber} (${p.subject}):`,
      '',
      p.body,
      '',
      `Continue the thread: ${p.settingsUrl}`,
    ].join('\n'),
  };
}

function formatTaskDueDate(isoDate?: string | null): string {
  if (!isoDate) return '';
  const raw = String(isoDate).slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return raw;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function priorityLabel(priority?: string | null): string {
  const value = String(priority || 'medium').toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function taskAssignedEmail(p: {
  firstName?: string;
  workspaceName?: string;
  assignerName?: string;
  title: string;
  description?: string | null;
  projectName?: string | null;
  dueDate?: string | null;
  priority?: string | null;
  tasksUrl: string;
}): RenderedEmail {
  const name = p.firstName?.trim() || 'there';
  const workspace = p.workspaceName || env.EMAIL_BRAND_NAME;
  const assigner = p.assignerName?.trim();
  const due = formatTaskDueDate(p.dueDate);

  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(
      assigner
        ? `${strong(assigner)} assigned you a task in ${strong(workspace)}.`
        : `A task was assigned to you in ${strong(workspace)}.`
    ),
    detailsPanel([
      ['Task', p.title],
      ['Project', p.projectName || ''],
      ['Priority', priorityLabel(p.priority)],
      ['Due', due],
    ]),
    p.description ? paragraph(escapeHtml(p.description).replace(/\n/g, '<br/>')) : '',
    button('Open tasks', p.tasksUrl),
    linkFallback(p.tasksUrl),
  ].join('');

  return {
    subject: assigner ? `${assigner} assigned you: ${p.title}` : `You’ve been assigned: ${p.title}`,
    html: renderLayout({
      preheader: due ? `${p.title} is due ${due}.` : `${p.title} was assigned to you.`,
      heading: 'New task assigned',
      bodyHtml,
      workspaceName: p.workspaceName,
    }),
    text: [
      `Hi ${name},`,
      '',
      assigner ? `${assigner} assigned you a task in ${workspace}.` : `A task was assigned to you in ${workspace}.`,
      `Task: ${p.title}`,
      p.projectName ? `Project: ${p.projectName}` : '',
      `Priority: ${priorityLabel(p.priority)}`,
      due ? `Due: ${due}` : '',
      p.description ? `\n${p.description}` : '',
      '',
      `Open tasks: ${p.tasksUrl}`,
    ]
      .filter((line) => line !== '')
      .join('\n'),
  };
}

export function taskDueSoonEmail(p: {
  firstName?: string;
  workspaceName?: string;
  title: string;
  description?: string | null;
  projectName?: string | null;
  dueDate?: string | null;
  priority?: string | null;
  daysUntilDue: number;
  tasksUrl: string;
}): RenderedEmail {
  const name = p.firstName?.trim() || 'there';
  const workspace = p.workspaceName || env.EMAIL_BRAND_NAME;
  const due = formatTaskDueDate(p.dueDate);
  const when =
    p.daysUntilDue <= 0 ? 'due today' : p.daysUntilDue === 1 ? 'due tomorrow' : `due in ${p.daysUntilDue} days`;

  const bodyHtml = [
    paragraph(`Hi ${escapeHtml(name)},`),
    paragraph(`${strong(p.title)} in ${strong(workspace)} is ${when}.`),
    detailsPanel([
      ['Task', p.title],
      ['Project', p.projectName || ''],
      ['Priority', priorityLabel(p.priority)],
      ['Due', due],
    ]),
    p.description ? paragraph(escapeHtml(p.description).replace(/\n/g, '<br/>')) : '',
    button('Open tasks', p.tasksUrl),
    linkFallback(p.tasksUrl),
  ].join('');

  return {
    subject: `${p.title} is ${when}`,
    html: renderLayout({
      preheader: due ? `Due ${due}. Open the task to update progress.` : `A task assigned to you is ${when}.`,
      heading: 'Task due soon',
      bodyHtml,
      workspaceName: p.workspaceName,
    }),
    text: [
      `Hi ${name},`,
      '',
      `${p.title} in ${workspace} is ${when}.`,
      p.projectName ? `Project: ${p.projectName}` : '',
      `Priority: ${priorityLabel(p.priority)}`,
      due ? `Due: ${due}` : '',
      p.description ? `\n${p.description}` : '',
      '',
      `Open tasks: ${p.tasksUrl}`,
    ]
      .filter((line) => line !== '')
      .join('\n'),
  };
}
