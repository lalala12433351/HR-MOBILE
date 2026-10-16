import fs from 'node:fs';
import path from 'node:path';
import {
  inviteEmployeeEmail,
  passwordChangedEmail,
  passwordResetEmail,
  taskAssignedEmail,
  taskDueSoonEmail,
  verifyEmailCodeEmail,
} from '../emails/templates.js';

const outDir = path.resolve(process.cwd(), 'tmp', 'email-previews');
fs.mkdirSync(outDir, { recursive: true });

const samples = {
  invite: inviteEmployeeEmail({
    firstName: 'Ananya',
    email: 'ananya@acme.in',
    workspaceName: 'Acme Technologies',
    role: 'hr_manager',
    invitedBy: 'Libin',
    url: 'https://app.pixbe.in/accept-invite?token=sample-token',
    expiresInHours: 72,
  }),
  'verify-email': verifyEmailCodeEmail({ name: 'Libin', code: '482915', expiresInMinutes: 10 }),
  'password-reset': passwordResetEmail({
    firstName: 'Ananya',
    workspaceName: 'Acme Technologies',
    url: 'https://app.pixbe.in/reset-password?token=sample-token',
    expiresInHours: 1,
  }),
  'account-activated': passwordChangedEmail({
    firstName: 'Ananya',
    workspaceName: 'Acme Technologies',
    reason: 'activated',
    loginUrl: 'https://app.pixbe.in/login',
  }),
  'password-changed': passwordChangedEmail({
    firstName: 'Ananya',
    workspaceName: 'Acme Technologies',
    reason: 'reset',
    loginUrl: 'https://app.pixbe.in/login',
  }),
  'task-assigned': taskAssignedEmail({
    firstName: 'Ananya',
    workspaceName: 'Acme Technologies',
    assignerName: 'Libin',
    title: 'Prepare Q3 payroll close',
    description: 'Reconcile leave balances and lock the payroll run.',
    projectName: 'People Operations',
    dueDate: '2026-10-20',
    priority: 'high',
    tasksUrl: 'https://app.pixbe.in/projects',
  }),
  'task-due-soon': taskDueSoonEmail({
    firstName: 'Ananya',
    workspaceName: 'Acme Technologies',
    title: 'Prepare Q3 payroll close',
    description: 'Reconcile leave balances and lock the payroll run.',
    projectName: 'People Operations',
    dueDate: '2026-10-17',
    priority: 'high',
    daysUntilDue: 1,
    tasksUrl: 'https://app.pixbe.in/projects',
  }),
};

for (const [name, email] of Object.entries(samples)) {
  fs.writeFileSync(path.join(outDir, `${name}.html`), email.html, 'utf8');
  fs.writeFileSync(path.join(outDir, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}`, 'utf8');
  console.log(`wrote ${name}.html  (${email.subject})`);
}
console.log(`\nOpen the files in ${outDir}`);
