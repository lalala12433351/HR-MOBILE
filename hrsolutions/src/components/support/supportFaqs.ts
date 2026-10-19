export type SupportFaq = { id: string; question: string; answer: string };

export const SUPPORT_FAQS: SupportFaq[] = [
  {
    id: 'attendance',
    question: 'Where do I change shifts, offices, and leave rules?',
    answer:
      'Open Settings → Attendance & leave. Shift patterns, office geofences, holidays, and time-off policies apply to the whole workspace once saved.',
  },
  {
    id: 'people',
    question: 'How do I add people and control what they can see?',
    answer:
      'Use Settings → People & organization for employee fields, roles, and org structure. Invite people from People; they receive an email to set a password.',
  },
  {
    id: 'payroll',
    question: 'Where are pay cycles and salary groups configured?',
    answer:
      'Settings → Payroll holds pay cycles, salary groups, and compliance defaults. Run payroll from the Payroll module after those defaults are in place.',
  },
  {
    id: 'reports',
    question: 'Can I change which columns and widgets show on reports?',
    answer:
      'Yes. Settings → Reports controls landing views, overview widgets, attendance categories, filters, and CSV export options.',
  },
  {
    id: 'hr-vs-pixbe',
    question: 'When should I open a ticket instead of Ask HR?',
    answer:
      'Ask HR in Chat is for your company’s HR team (payslips, leave, policy). Tickets here are Pixbe product support — a separate chat with Super Admin, including files.',
  },
  {
    id: 'chat-email',
    question: 'What happens when I send a support message?',
    answer:
      'We open a ticket Pixbe Super Admin can chat on in Master Admin, with your client name and tenant. You can keep several tickets, attach files, and follow up in the thread. Replies also email you. You can write to support@pixbe.in instead. This is not mixed with Ask HR.',
  },
];
