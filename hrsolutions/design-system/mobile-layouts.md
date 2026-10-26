# Mobile layout sources

All layouts are fluid. The 390px Figma frames define spacing, hierarchy and content order; they are not embedded as images. Existing API handlers, permissions and data remain in use. Desktop layouts keep their existing structure.

| Area | Figma nodes | Implementation |
| --- | --- | --- |
| Employee dashboard | `9:67988` | `UserDashboardView`, `dashboard.css`, mobile card order in `src/app/mobile.css` |
| My/team/class attendance | `182:9455`, `182:9550`, `182:9705` | `KekaAttendanceModule`, workday cards and `people-attendance.css` |
| Leave, regularizations, holidays | `182:9873`, `182:9965`, `182:10045` | Attendance subviews and existing approval handlers |
| Employees, directory | `203:7689`, `203:7694` | `EmployeeTableTab`, `StaffCardsTab`; phone roster defaults to flat cards |
| Projects: Board, List, Projects | `280:9182`, `280:9335`, `280:9418` | `ProjectsModule`, `workspaces.css`; status selector and optional filters |
| Project/task details and forms | `280:9492`, `280:9553`, `280:9612`, `280:9681`, `280:9758` | Existing drawers adapt to full-screen mobile forms |
| Timesheets: Day, Week, Month, List | `282:9378`, `282:9483`, `282:9640`, `282:9798` | `TimesheetsModule`, day agenda, calendar and record cards |
| Time entry and scheduling | `282:9914`, `282:9981` | Time-entry dialog with scrollable fields and fixed actions |
| Payroll review | `193:59129` | `PayrollRunModule`, `finance-studio.css` |
| Unbilled work and invoice | `193:59359`, `193:59569` | `PayrollBillableModule`, editable line-item cards and invoice layout |
| Shared phone navigation | `280:9182`, `282:9378` | `MobileBottomBar`, `Header`; labelled tabs, role-aware destinations, safe areas |

## Views without a dedicated phone frame

- **Admin/HR dashboard:** use the employee mobile spacing, stack panels and turn attendance rows into labelled cards.
- **Chat:** adapt the desktop conversation design (`32:4990`) into list → thread → details navigation, preserving composer, attachments and HR requests.
- **Settings:** adapt the desktop form system (`182:7724`) with an area strip, searchable page selector, single-column forms and mobile record cards.
- **Reports:** use the same finance/attendance card pattern for all report views, retaining filters, exports, pagination and employee detail actions.
- **Auth and onboarding:** retain desktop form design (`9:10104`, `9:13202`, `9:10831`) with compact progress navigation, stacked choices, touch-sized controls and local fonts.
- **Students/timetable:** retain institute permissions and use roster cards and a day agenda with the existing add/edit handlers.
- **Announcements/notifications/platform console:** use the shared canvas, mobile spacing, wrapping toolbars, full-screen drawers and labelled table cards where appropriate.

## Shared components

`ResponsiveTable` keeps one semantic table and one set of live controls. It derives cell labels from the headers; CSS presents each row as a card on phones. It does not duplicate records or mutation handlers.

`ResponsiveFilters` keeps desktop filters expanded and discloses the same controls on phones. Applied filters stay selected when collapsed.

`mobile.css` is loaded by the root layout after the global stylesheet. Component selectors are scoped to the mobile breakpoint. Bottom navigation and drawers account for safe-area insets; layouts use dynamic viewport height. Browser zoom remains available. Local Plus Jakarta Sans files are shared by the workspace and onboarding.

## Verification

These scripts use synthetic local fixtures and inert API responses. They never save to a tenant or contact the production backend.

```powershell
node scripts/mobile-preview.cjs --build
node scripts/mobile-check.cjs
node scripts/mobile-interactions.cjs
$env:MOBILE_WIDTH = '320'
node scripts/mobile-check.cjs projects timesheets reports settings login otp
npx tsc --noEmit --incremental false
```

Screenshots and check results go to the ignored `test-results/mobile` folder. The fixture source has the `.fixture` extension so it is excluded from the app's TypeScript compilation.
