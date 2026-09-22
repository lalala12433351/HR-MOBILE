---
trigger: manual
---

# UI Design Ideology & Component Guidelines

This document outlines the core design philosophy, color system, typography rules, and component patterns established for this project. **All future UI modifications and new components MUST strictly follow these rules.**

---

## 1. Core Philosophy & Aesthetic Principles

- **Clean Minimalism over Container Clutter**:
  - Avoid unnecessary container boxes with borders and grey backgrounds (`bg-slate-50 border border-slate-200`).
  - Use generous whitespace, subtle separators, and typography hierarchy rather than nested boxes.
- **No Tacky Badges, Emojis, Blinking Dots, or Extra Labels**:
  - **No Decorative Dots or Pips:** Never include decorative indicator dots, pulsing circles, or bullet pips (`•`, `w-1.5 h-1.5 rounded-full animate-pulse`) inside status badges, pills, or headers. Badges must be pure, clean text with semantic background and border tints only.
  - **No Extra / Redundant Labels:** Avoid stacking extra micro-labels, descriptor tags, or redundant prefixes (e.g., repeating "Status: Active") that crowd the interface. Clear typography and standard badge strings (`ACTIVE`, `NOT ACTIVATED`, `PROBATION`) are sufficient.
  - Avoid decorative emojis, blinking status lights, or oversaturated badges.
  - Keep icons minimal, monochrome, and functional (`lucide-react` with `stroke-[1.8]` or `stroke-[2]`).
- **Unified Brand Color Consistency**:
  - All primary active elements and steppers must share the exact same blue theme (`bg-blue-600 text-white font-bold`).
  - Never mix arbitrary primary colors (e.g. green for step 1, purple for step 2, dark slate for step 3).

---

## 2. Color & Component Palette

| Context | Background / Border | Text | Purpose |
| :--- | :--- | :--- | :--- |
| **Primary Action** | `bg-blue-600 hover:bg-blue-700` | `text-white font-bold` | Main CTA (e.g., `Start Tracking`, `Add Task`) |
| **Pause Action** | `bg-amber-500 hover:bg-amber-600` | `text-white font-bold` | Live timer pause |
| **Success / Completed** | `bg-emerald-50 border-emerald-200` | `text-emerald-700 font-bold` | Approved / Completed status badges |
| **Secondary Button** | `bg-white border-slate-200 hover:bg-slate-50` | `text-slate-700 font-semibold` | Secondary actions |
| **Cancel / Dismiss** | Transparent / `hover:bg-slate-100` | `text-slate-400 hover:text-slate-700` | Modal cancel, close buttons |
| **Dark Container (Kanban/Cards)** | `bg-[#121214] border-[#282830]` | `text-white` | Dark board cards & filters |
| **Light Drawer / Modal** | `bg-white border-slate-100 shadow-2xl` | `text-slate-900` | Detail drawers & confirmation modals |

---

## 3. Time & Progress Representation

- **Direct, Clean Typography**:
  - Format time purely in hours and minutes: `0h 0m`, `1h 45m`.
  - Use clean `font-mono font-bold text-slate-900` without bright background containers or glowing borders.
- **Streamlined Actions**:
  - Modals should present a single clear primary CTA (e.g. **`Start Tracking`**) and a lightweight **`Cancel`** option. Avoid cluttering with conflicting alternate paths.

---

## 4. Role-Based Scoping & Permission Rules

- **Employee Persona (`!isAdmin`)**:
  - **Task Visibility**: Only sees tasks assigned to themselves.
  - **Employee Filter**: Organization-wide employee filters (`All Employees` dropdown) must be **hidden**.
  - **Drag & Drop**: Can only drag tasks assigned to themselves.
  - **Task Creation**: Assignee field is locked to themselves (`Assigned to You`).
  - **Project Creation**: Cannot create new projects (no `+ Add Project` button).
- **Admin / Super Admin (`isAdmin` / `isSuperAdmin`)**:
  - Full visibility into all employees and tasks.
  - Can assign any team member to tasks.
  - Can create and manage projects.
  - Super Admin exclusively approves transitions from `Review` to `Completed`.

---

## 5. Modal & Drawer Anatomy

- **Modal Header**:
  - Title: Crisp `text-lg font-bold text-slate-900` (e.g., `Move to In Progress`).
  - Subtitle: Subtle `text-xs text-slate-500 mt-0.5`.
  - Close: Minimal `text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100`.
- **Content Area**:
  - Open typography: Pill badge for project category (`bg-blue-50 text-blue-600`), dot separator, assignee name, and bold title.
  - Only show alerts or warnings when strictly actionable.
