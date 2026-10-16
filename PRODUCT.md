# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pixbe serves two kinds of tenant organisation as equal, first-class markets:

- **Companies:** people-ops and workforce management.
- **Training institutes:** student administration.

Admin-side and member-side users carry equal weight in design trade-offs:

- **Admins and operators:** super admins, HR managers, and managers who run people operations. They approve leave and regularisations, review attendance, run payroll, manage the employee directory, onboard staff, and set policies. For institutes, the equivalent operators manage students, batches, timetables, and student attendance. These users mostly work on desktop, often in long sessions.
- **Members doing self-service:** employees who clock in and out, request leave, log timesheets, view payslips, and read announcements, plus students who check their attendance and timetables. These users often work from a phone, in short, frequent visits.
- **Platform admins:** Pixbe staff who manage tenants through a separate master-admin console (`masteradmin.pixbe.in`) and can impersonate tenant users.

## Product Purpose

Pixbe is a multi-tenant Business Operating System and HRMS. It gives an organisation one workspace for its people operations, so it doesn't have to stitch separate tools together. It covers:

- attendance, including geofenced GPS clock-in
- leave
- timesheets
- projects
- payroll and payslips
- the directory and org chart
- documents
- announcements and notifications
- reports and analytics
- onboarding

For institutes, it adds students, batches, timetables, and student attendance.

Success means that both kinds of user can finish their routine work quickly and without errors, inside one product:

- admins and operators get through their routine operations
- members get through their self-service tasks

## Positioning

Pixbe is an all-in-one business OS. HR, projects, timesheets, and payroll live in one workspace rather than as separate products bolted together. The same platform also serves training institutes as well as companies.

## Operating Context

- **Tenancy:** each organisation is an isolated tenant (schema-per-tenant PostgreSQL), and tenants are configured as either a company or an institute. The tenant app runs at `app.pixbe.in`. Platform administration lives at `masteradmin.pixbe.in`.
- **Roles:** `platform_admin`, `super_admin`, `hr_manager`, `manager`, `employee`, and `student`. What each role can see and do differs substantially.
- **Workflows:**
  - approval chains for leave, regularisation, and loss-of-pay decisions
  - shift-based clock-in and clock-out with GPS verification
  - payroll review and payslip issuance
  - invite-based employee onboarding
  - timetable sync for student batches
  - report export
- **Devices:** admins and operators mostly use desktop browsers. Members and students frequently use phones, and the web app has a dedicated mobile bottom navigation. A separate native mobile app repository (`iPrq/HR-Solutions-Moblie`) is kept in sync from this repo.
- **Market:** global, not tied to a single country.

## Capabilities and Constraints

- **Frontend:** `hrsolutions/` is Next.js 16 with React 19 and Tailwind CSS 4. It also uses `motion`, `recharts`, `leaflet`, `lucide-react`, and `sonner`. Light and dark themes exist.
- **Backend:** `app/` is Node.js 20 and TypeScript, with Prisma and PostgreSQL. It uses AWS Cognito JWT authentication and S3 with KMS presigned storage, and deploys through Amazon ECR and ECS.
- **AI:** an assistant and meeting summaries run on Google GenAI.
- **Terminology:**
  - "Pixbe Workspace" is the default name for a company workspace.
  - Institute mode uses "students", "batches", and "timetable".
  - "Regularization" and "LOP (loss of pay)" are attendance and leave terms.
- **Open decisions:**
  - competitive claims beyond the all-in-one position
  - pricing
  - target organisation size
  - any accessibility standard

## Brand Commitments

- **Name:** Pixbe. The product tagline in the code is "Modern Workforce & Human Resource Management", and the site description is "Manage your HR tasks smarter, faster, and easier — all in one place with Pixbe."
- **Icon component:** `PixbeIcon` (`hrsolutions/src/components/common/PixbeIcon`).

## Evidence on Hand

- There are no confirmed customers, testimonials, case studies, metrics, or press.
- "Kite Institute of Aviation" in the header is placeholder or demo data. Do not present it as a customer or as proof.
- Do not fabricate customer logos, usage numbers, or compliance certifications.

## Product Principles

1. **One workspace, not a suite of silos.** Modules should feel like parts of a single system, with shared people, shared data, and consistent patterns, never like separate apps.
2. **Two audiences, equal weight.** Every flow must serve both the operator who processes many records and the member who does one quick task. Neither should be sacrificed for the other.
3. **Company and institute are both first-class.** Institute mode is not a reskin. Its terminology and workflows deserve the same care as the HR workflows.
4. **Role-aware by default.** Show each role what it can act on. Hide what it can't, rather than presenting dead ends.
5. **Trustworthy with sensitive data.** Payroll, attendance, and personal records demand accuracy, clear confirmation of consequential actions, and no ambiguity about state.
