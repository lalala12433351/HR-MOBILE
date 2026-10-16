-- =============================================================================
-- Migration 002: Tenant Template Schema DDL
-- Executes within an isolated tenant schema (e.g. "tenant_demo_corp")
-- =============================================================================

-- 1. ORG MODULE: Offices (GPS Geofence), Departments, Teams, Job Roles
CREATE TABLE IF NOT EXISTS offices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    geofence_radius_meters INTEGER NOT NULL DEFAULT 100 CHECK (geofence_radius_meters > 0),
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,
    lead_employee_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS short_code VARCHAR(8);
CREATE UNIQUE INDEX IF NOT EXISTS departments_short_code_uq ON departments (LOWER(short_code)) WHERE short_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    lead_employee_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(128) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    level VARCHAR(32) NOT NULL DEFAULT 'L1'
);

-- 2. IDENTITY MODULE: Employees, Profiles, Bank Details, Documents
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub VARCHAR(128) UNIQUE,
    employee_code VARCHAR(32) UNIQUE NOT NULL,
    first_name VARCHAR(64) NOT NULL,
    last_name VARCHAR(64) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(32),
    office_id UUID REFERENCES offices(id),
    department_id UUID REFERENCES departments(id),
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    job_role_id UUID REFERENCES job_roles(id),
    reporting_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'employee' CHECK (role IN ('super_admin', 'hr_manager', 'manager', 'employee', 'faculty', 'teacher', 'student')),
    employment_status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'on_probation', 'terminated', 'resigned')),
    date_of_joining DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender VARCHAR(32);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS blood_group VARCHAR(16);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status VARCHAR(32);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality VARCHAR(64);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS primary_address TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS city VARCHAR(64);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS state_province VARCHAR(64);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS postal_code VARCHAR(32);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS country VARCHAR(64);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_tax_id VARCHAR(64);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS social_insurance VARCHAR(64);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact JSONB;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS custom_field_values JSONB;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS uploaded_documents JSONB;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_status VARCHAR(32) DEFAULT 'Not Activated';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_completed_profile BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS onboarding_progress INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(32) DEFAULT 'pending';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_cognito ON employees(cognito_sub);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);

-- Many-to-many: employees may work at multiple offices (primary stays on employees.office_id)
CREATE TABLE IF NOT EXISTS employee_offices (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (employee_id, office_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_offices_office ON employee_offices(office_id);
CREATE INDEX IF NOT EXISTS idx_employee_offices_primary ON employee_offices(employee_id) WHERE is_primary = true;

-- Backfill from legacy single office_id
INSERT INTO employee_offices (employee_id, office_id, is_primary)
SELECT e.id, e.office_id, true
FROM employees e
WHERE e.office_id IS NOT NULL
ON CONFLICT (employee_id, office_id) DO NOTHING;

-- Many-to-many: departments/teams may have several co-leads (primary stays on lead_employee_id)
CREATE TABLE IF NOT EXISTS department_leads (
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (department_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_department_leads_employee ON department_leads(employee_id);

CREATE TABLE IF NOT EXISTS team_leads (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_team_leads_employee ON team_leads(employee_id);

-- Backfill from legacy single lead_employee_id
INSERT INTO department_leads (department_id, employee_id, is_primary)
SELECT d.id, d.lead_employee_id, true
FROM departments d
JOIN employees e ON e.id = d.lead_employee_id
ON CONFLICT (department_id, employee_id) DO NOTHING;

INSERT INTO team_leads (team_id, employee_id, is_primary)
SELECT t.id, t.lead_employee_id, true
FROM teams t
JOIN employees e ON e.id = t.lead_employee_id
ON CONFLICT (team_id, employee_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS bank_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID UNIQUE NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    account_holder_name VARCHAR(128) NOT NULL,
    account_number VARCHAR(64) NOT NULL,
    bank_name VARCHAR(128) NOT NULL,
    routing_or_ifsc_code VARCHAR(32) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    document_type VARCHAR(64) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    s3_key TEXT NOT NULL,
    file_size_bytes BIGINT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. ATTENDANCE & LEAVES: Punches, Requests, Approvals
CREATE TABLE IF NOT EXISTS attendance_punches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    office_id UUID REFERENCES offices(id),
    punch_type VARCHAR(16) NOT NULL CHECK (punch_type IN ('check_in', 'check_out')),
    punch_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    distance_from_office_meters NUMERIC(8, 2),
    is_within_geofence BOOLEAN NOT NULL DEFAULT false,
    device_info VARCHAR(255),
    ip_address VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_punches_emp_time ON attendance_punches(employee_id, punch_timestamp);

CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(32) NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'unpaid', 'wfh')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count NUMERIC(4, 1) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    approver_id UUID REFERENCES employees(id),
    decision_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Widen leave_type for existing tenants (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'leave_requests'
  ) THEN
    ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
    ALTER TABLE leave_requests
      ADD CONSTRAINT leave_requests_leave_type_check
      CHECK (leave_type IN ('casual', 'sick', 'earned', 'unpaid', 'wfh'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS employee_leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year INT NOT NULL,
    casual_leave NUMERIC(5, 1) NOT NULL DEFAULT 0,
    sick_leave NUMERIC(5, 1) NOT NULL DEFAULT 0,
    earned_leave NUMERIC(5, 1) NOT NULL DEFAULT 0,
    wfh NUMERIC(5, 1) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_leave_balances_emp_year UNIQUE (employee_id, year)
);

CREATE TABLE IF NOT EXISTS leave_balance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year INT NOT NULL,
    leave_type VARCHAR(32) NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'wfh')),
    delta NUMERIC(5, 1) NOT NULL,
    reason VARCHAR(32) NOT NULL CHECK (reason IN ('accrual_init', 'approve', 'cancel_credit', 'manual_adjust', 'carry_over')),
    leave_request_id UUID REFERENCES leave_requests(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leave_balance_tx_emp_year
  ON leave_balance_transactions(employee_id, year, created_at DESC);

CREATE TABLE IF NOT EXISTS attendance_regularizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    requested_check_in TIME,
    requested_check_out TIME,
    reason TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approver_id UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS holidays (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    holiday_date DATE NOT NULL,
    year INT NOT NULL,
    day_of_week VARCHAR(32),
    is_approved BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_date ON holidays(holiday_date);

-- 4. PROJECTS MODULE: Projects, Tasks, Timesheets
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,
    description TEXT,
    client_name VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('planning', 'in_progress', 'on_hold', 'completed')),
    start_date DATE,
    end_date DATE,
    manager_id UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    priority VARCHAR(16) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(32) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timesheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
    work_date DATE NOT NULL,
    hours_spent NUMERIC(4, 2) NOT NULL CHECK (hours_spent >= 0 AND hours_spent <= 24),
    description TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    approver_id UUID REFERENCES employees(id),
    entry_type VARCHAR(16) NOT NULL DEFAULT 'task',
    title TEXT,
    start_time VARCHAR(16),
    end_time VARCHAR(16),
    category VARCHAR(64),
    meeting_link TEXT,
    billable BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS entry_type VARCHAR(16) NOT NULL DEFAULT 'task';
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS start_time VARCHAR(16);
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS end_time VARCHAR(16);
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS category VARCHAR(64);
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS meeting_link TEXT;
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_timesheets_emp_date ON timesheets(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_timesheets_entry_type_date ON timesheets(entry_type, work_date);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_mode VARCHAR(16) NOT NULL DEFAULT 'deliverable';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12, 2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency VARCHAR(8) NOT NULL DEFAULT 'INR';

CREATE TABLE IF NOT EXISTS billing_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    company_name VARCHAR(128),
    email VARCHAR(255),
    phone VARCHAR(32),
    billing_address TEXT,
    gstin VARCHAR(32),
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    payment_terms_days INTEGER NOT NULL DEFAULT 15,
    default_hourly_rate NUMERIC(12, 2),
    notes TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES billing_clients(id) ON DELETE SET NULL;

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS recurrence_series_id UUID;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS recurrence_rule JSONB;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS recurrence_end DATE;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS is_recurrence_template BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS occurrence_date DATE;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS billing_type VARCHAR(16) NOT NULL DEFAULT 'deliverable';
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS invoice_id UUID;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES billing_clients(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS project_task_assignees (
    task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (task_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_project_task_assignees_employee ON project_task_assignees(employee_id);

CREATE TABLE IF NOT EXISTS task_due_reminders (
    task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    reminder_kind VARCHAR(16) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, employee_id, due_date, reminder_kind)
);

ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS invoice_id UUID;

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    client_id UUID REFERENCES billing_clients(id) ON DELETE SET NULL,
    invoice_number VARCHAR(32) NOT NULL,
    customer_name VARCHAR(128),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    billing_period_start DATE,
    billing_period_end DATE,
    kind VARCHAR(16) NOT NULL DEFAULT 'project',
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES billing_clients(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_start DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_end DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'project';
ALTER TABLE invoices ALTER COLUMN project_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    source_task_id UUID,
    source_timesheet_id UUID
);

-- 5. PAYROLL MODULE: Salary Structures, Payroll Runs, Payslips
CREATE TABLE IF NOT EXISTS salary_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID UNIQUE NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    base_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    hra NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    special_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    conveyance_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    medical_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    other_allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    allowances JSONB DEFAULT '[]'::jsonb,
    provident_fund_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    tax_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS conveyance_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.0;
ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS medical_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.0;
ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS other_allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.0;
ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS allowances JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    total_payout NUMERIC(14, 2) NOT NULL DEFAULT 0.0,
    employee_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'processing', 'completed', 'disbursed')),
    executed_by_employee_id UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payroll_period UNIQUE (month, year)
);

CREATE TABLE IF NOT EXISTS payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month_year VARCHAR(32),
    base_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    hra NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    special_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    conveyance_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    medical_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    other_allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    allowances_breakdown JSONB DEFAULT '[]'::jsonb,
    pf_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    tax_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    net_payable NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    status VARCHAR(32) NOT NULL DEFAULT 'Paid',
    payment_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payslip_run_emp UNIQUE (payroll_run_id, employee_id)
);

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS conveyance_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS medical_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS other_allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS allowances_breakdown JSONB DEFAULT '[]'::jsonb;

-- 6. AUDIT & COMMS MODULE: Announcements, Notifications, Immutable Audit Trail
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_employee_id UUID REFERENCES employees(id),
    target_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    priority VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
    category VARCHAR(64) DEFAULT 'GENERAL',
    pin_to_header_banner BOOLEAN NOT NULL DEFAULT false,
    tags JSONB DEFAULT '[]'::jsonb,
    attachment_file_name VARCHAR(255),
    attachment_file_url TEXT,
    attachment_file_size BIGINT,
    attachment_mime_type VARCHAR(128),
    is_published BOOLEAN NOT NULL DEFAULT true,
    published_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Earlier tenant schemas predate the announcement metadata columns.  Reapplying
-- this idempotent migration upgrades them before the broadcast endpoint reads or
-- writes those fields.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'GENERAL';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS pin_to_header_banner BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_file_name VARCHAR(255);
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_file_url TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_file_size BIGINT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_mime_type VARCHAR(128);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(32) DEFAULT 'System',
    priority VARCHAR(16) DEFAULT 'medium',
    link_url TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_employee_id, is_read);

CREATE TABLE IF NOT EXISTS audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_name VARCHAR(128) NOT NULL,
    actor_sub VARCHAR(128),
    actor_email VARCHAR(255),
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128),
    details JSONB,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_trail(created_at DESC);

-- 7. INSTITUTE & ACADEMIC DOMAIN: Academic Batches, Students, Timetable, Student Attendance
CREATE TABLE IF NOT EXISTS academic_batches (
    id VARCHAR(64) PRIMARY KEY,
    grade VARCHAR(64) NOT NULL,
    section VARCHAR(64) NOT NULL,
    start_time VARCHAR(16) DEFAULT '08:30',
    end_time VARCHAR(16) DEFAULT '15:30',
    working_days JSONB DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]'::jsonb,
    max_capacity INTEGER DEFAULT 40,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_batch_grade_section ON academic_batches(grade, section);

CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(64) UNIQUE NOT NULL,
    first_name VARCHAR(64) NOT NULL,
    last_name VARCHAR(64),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(32),
    date_of_birth DATE,
    gender VARCHAR(32),
    blood_group VARCHAR(16),
    grade VARCHAR(64),
    section VARCHAR(64),
    batch_id VARCHAR(64),
    roll_number VARCHAR(32),
    guardian_name VARCHAR(128),
    guardian_phone VARCHAR(32),
    guardian_email VARCHAR(255),
    address TEXT,
    city VARCHAR(64),
    state_province VARCHAR(64),
    postal_code VARCHAR(32),
    country VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'Active',
    account_status VARCHAR(32) NOT NULL DEFAULT 'Activated',
    fees_status VARCHAR(32) NOT NULL DEFAULT 'Paid',
    onboarding_progress INTEGER NOT NULL DEFAULT 100,
    custom_field_values JSONB DEFAULT '{}'::jsonb,
    emergency_contact JSONB DEFAULT '{}'::jsonb,
    uploaded_documents JSONB DEFAULT '[]'::jsonb,
    attendance_stats JSONB DEFAULT '{"totalDays":0,"present":0,"absent":0,"late":0,"percentage":100}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_students_grade_section ON students(grade, section);
CREATE INDEX IF NOT EXISTS idx_students_batch_id ON students(batch_id);

CREATE TABLE IF NOT EXISTS timetable_slots (
    id VARCHAR(64) PRIMARY KEY,
    batch_id VARCHAR(64) NOT NULL,
    day_of_week VARCHAR(32) NOT NULL,
    slot_type VARCHAR(16) NOT NULL DEFAULT 'class' CHECK (slot_type IN ('class', 'break')),
    title VARCHAR(128) NOT NULL,
    subject_code VARCHAR(32),
    faculty_name VARCHAR(128),
    room VARCHAR(64),
    start_time VARCHAR(16) NOT NULL,
    end_time VARCHAR(16) NOT NULL,
    color VARCHAR(32) DEFAULT 'blue',
    sync_group_id VARCHAR(128),
    is_recurring_daily BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_timetable_batch_day ON timetable_slots(batch_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_timetable_faculty ON timetable_slots(faculty_name);

CREATE TABLE IF NOT EXISTS student_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_id VARCHAR(64),
    attendance_date DATE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Present' CHECK (status IN ('Present', 'Absent', 'Late', 'Half Day', 'Excused')),
    check_in_time VARCHAR(16),
    check_out_time VARCHAR(16),
    remarks TEXT,
    marked_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_attendance_day UNIQUE (student_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_student_att_date ON student_attendance(attendance_date);

-- 15. TENANT SETTINGS (key/value JSON blobs for setup + policy persistence)
CREATE TABLE IF NOT EXISTS tenant_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
