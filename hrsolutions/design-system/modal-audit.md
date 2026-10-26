# Modal audit against Figma

Source: Figma file `3WBnpJRZWuIwgDDSOWLQ5A`. This pass compares existing dialogs with the supplied designs; an existing dialog or shared token stylesheet does not establish visual fidelity.

## Corrected in this pass

| Dialog | Desktop frame | Mobile frame | Change |
| --- | --- | --- | --- |
| Add a task | 71:2787 | 280:9553 | Rebuilt field order, typography, 420px drawer, mobile two-column priority/date, multi-select people, description, billable switch, fixed actions. |
| Task details | 71:2554 | 280:9492 | Rebuilt workflow controls, description, metadata, checklist, time actions, attachment cards, desktop drawer and mobile cards/back navigation. |
| Task Log time | 74:2270 | 280:9758 | Replaced the old side drawer with the centered desktop dialog and mobile form. |
| Create a project | 71:3020 | 280:9612 | Rebuilt the form and responsive field arrangement. Existing extra priority field retained. |

Implementation: `src/components/modules/ProjectsModule.tsx`, `TaskPanels.tsx`, and scoped styles in `workspaces.css`.

Existing business behavior is retained: permissions, multi-assignee payloads, recurrence dates/weekdays, project/client billing, subtasks, attachments, timer controls, past-date regularization, project budget and lead fields. The mobile duration control uses the application's existing numeric hours model. Files retain their existing Download and Remove actions; a new file preview backend was not added.

## Confirmed remaining differences

| Dialog | Figma frame | Source | Finding |
| --- | --- | --- | --- |
| Project details and billing | 74:2100; mobile 280:9681 | ProjectsModule.tsx, Project Details section | Existing drawer still uses the older work-hours/allocation and approval sections. The reference has a compact approved-hours summary, project summary, billing and invoice sections. Requires its own structural pass while retaining approval/edit workflows. |
| Apply for regularization | 182:8584 | KekaAttendanceModule.tsx, showRegModal | Main fields exist, but the Figma manager/approval notice, date helper, available-reasons panel and footer explanation are absent. Shared input styling is not a full implementation of that frame. |

## Other Figma-backed dialogs located in the source

These have implementation counterparts. They remain flagged for direct rendered comparison; they are not certified complete by this audit.

| Dialog family | Figma nodes | Source |
| --- | --- | --- |
| Attendance leave, edit times | 182:8660, 182:8750 | KekaAttendanceModule.tsx |
| Location confirmation, outside office, punch confirmation, clock-out | 182:8835, 182:8900, 182:8958, 182:9005 | KekaAttendanceModule.tsx; attendance/WorkdayPunchDialogs.tsx |
| Office QR, punch photos, report export | 182:9045, 182:9094, 182:9137 | KekaAttendanceModule.tsx; attendance dialogs |
| Holiday templates, add holiday | 182:9202, 182:9303 | attendance/HolidayCalendarView.tsx |
| New shift, probation leave restriction | 182:9351, 182:9410 | AttendanceSettingsView.tsx; KekaAttendanceModule.tsx |
| Add employee/staff, employee peek | 203:7669, 203:7674, 203:7664 | hrms/AddEmployeeModal.tsx; hrms/EmployeeProfileCardModal.tsx |
| New chat, HR request, group administration | 42:2086, 50:1791, 32:5265 | chat/NewChatDialog.tsx; chat/Composer.tsx; chat conversation panels |
| Timesheet Log time / Schedule people | mobile 282:9914, 282:9981 | TimesheetsModule.tsx |
| User report | 193:57685, 193:57959 | reports/UserReportModal.tsx; reports/UserReportView.tsx |

## Additional overlays discovered

No exact Figma frame has been established for these entries in this pass. They should use the design system if the file has no suitable reference. This is not a statement that Figma contains no such frame.

- Project attachment picker/upload, start-tracking confirmation, project denial, and destructive confirmation.
- Employee detail edit drawers, milestones, contracts and payslips; student add/profile/attendance/password dialogs; org-chart details.
- Attendance settings editors and payroll settings drawers; employee custom-field editors; student timetable editors; notification settings; login email change.
- Document upload; Drive/Gmail/Meet/Sheets integration dialogs; AI assistant; command palette; desktop push prompt; print studio.
- Setup prompts/help, support composer/widget; master-admin licenses and administration forms.

Legacy candidates also occur in EmployeeSetupWizard, GanttChart, GoogleCalendarTimesheet, AddOfficeModal and AutomationModule. Their route reachability needs confirmation before treating them as active UI or undertaking a redesign.

## Validation

The local browser fixture mounts the real application components and intercepts API calls with inert responses. It exercises desktop/mobile layouts and inspects the real create-task payload without modifying a server. Successful backend persistence is outside that fixture's scope.

Run `node scripts/mobile-preview.cjs --build`, then `node scripts/task-modals-check.cjs`. Type check: `npx tsc --noEmit --incremental false`.
