# Mobile v2 implementation

The authoritative phone reference is [12 · Mobile · Rebuilt experience](https://www.figma.com/design/3WBnpJRZWuIwgDDSOWLQ5A/HR-Solutions-App?node-id=323-12254). It supersedes the earlier mobile frames listed in `mobile-layouts.md`. The desktop guidance in DESIGN.md still applies above 767px.

Use 390px as a fluid spacing reference, with 20px content gutters, a 64px header, white canvas, 20px section gaps, 15px medium row titles, 12px secondary copy, 48px form controls, and 8px control corners. Operational lists use dividers rather than stacked cards. Status text has no pill background. Preserve device safe areas without drawing OS status bars or home indicators.

| Feature | Reference nodes | Implementation |
| --- | --- | --- |
| Shared header and account drawer | 316:9858, 385:15910 | MobileHeader; native modal dialog handles focus trapping, Escape, and backdrop dismissal |
| Home / Work / Time / Chat / More | 315:9874 and navigation variants | MobileBottomBar; active families include nested routes |
| Home and team overview | 316:9854, 316:9941, 355:12289, 355:12453 | MobileDashboard; existing dashboard data and attendance actions |
| Attendance and history | 316:10021, 316:10165 | KekaAttendanceModule; Overview / History / Team with live sessions |
| Location, camera, punch confirmation | 316:10105, 356:13280, 358:15199 | WorkdayPunchDialogs and attendance module's existing punch flow; mobile confirmation offers no Retake |
| Work, project list, board and task forms | 318:10306–318:10670 | ProjectsModule; flat task rows open existing detail panels, creation action appears in shared header |
| Timesheets and time entry | 318:10757–318:10900 | TimesheetsModule; flat entries retain editing, calendar navigation and scheduling |
| Conversations and chat | 319:10705–319:10912 | Existing functional chat workspace with Mobile v2 spacing and controls |
| People and employee details | 319:10987, 319:11260, 320:11637 | Existing roster and profile modules with flat mobile records |
| More | 319:11162 | /more; destinations follow existing workspace permissions |
| Reports | 320:11227 | ReportsWorkspace; mobile landing uses live metrics and existing report views and export |
| Settings | 320:11308 | SettingsWorkspace; Personal and Workspace administration link to existing settings panes |
| Payroll and invoices | 319:11346, 320:11859, 357:15119–357:15585 | Existing finance workflows receive Mobile v2 flat records and controls |
| Authentication and verification | 321:11770–321:11831 | Existing authentication handlers, mobile header, field styles and pinned primary action |
| Setup and onboarding | 321:11857–321:12080 | Existing setup flows with Mobile v2 form styles |

All SVGs in public/mobile-v2 are original Figma exports saved locally. Profile photographs, maps, camera images and business records remain dynamic. Do not use Figma screenshots as screen assets or persist temporary asset URLs.

Workspace switching currently supports the active workspace and signing in with another account; this change does not add multi-tenant session switching. Google sign-in is not implemented by the current authentication service, so no inert Google button has been added.

## Validation

Use local synthetic fixtures; do not mutate production tenants.

```powershell
node scripts/mobile-preview.cjs --build
node scripts/mobile-check.cjs
node scripts/mobile-interactions.cjs
$env:MOBILE_WIDTH = '320'
node scripts/mobile-check.cjs dashboard projects timesheets attendance more reports settings login signup otp
npx tsc --noEmit --incremental false
npm run build
```

Screen checks inspect runtime errors, horizontal page overflow and locally rendered Figma SVGs. Interaction checks cover the account drawer, work views and filters, task creation, time-entry views and forms, profiles, reports, settings, timetable, chat, and verification inputs. Screenshots and results are under test-results/mobile.

These checks are functional and visual review aids, not proof that every one of the 170 Figma states has pixel-level parity. Secondary workflows retain existing content and business rules.
