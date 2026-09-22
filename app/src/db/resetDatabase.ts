import { pool } from '../config/database.js';
import { runPublicMigrations, provisionTenantSchema } from './migrator.js';
import { withTenantContext } from './queryRunner.js';
import { hashPassword } from '../utils/crypto.js';

export async function resetDatabase(): Promise<void> {
  console.log('=============================================================');
  console.log('🔄 COMMENCING FULL POSTGRESQL MULTI-TENANT DATABASE RESET');
  console.log('=============================================================');

  const client = await pool.connect();
  try {
    // 1. Discover all existing tenant schemas and drop them
    const schemaRes = await client.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'`
    );
    const existingTenantSchemas = schemaRes.rows.map((r: any) => r.schema_name);
    console.log(`📦 Found ${existingTenantSchemas.length} tenant schema(s) to drop:`, existingTenantSchemas);

    for (const s of existingTenantSchemas) {
      await client.query(`DROP SCHEMA IF EXISTS "${s}" CASCADE`);
      console.log(`  🗑️ Dropped schema "${s}"`);
    }

    // 2. Drop and recreate public control plane tables
    console.log('🧹 Purging public control plane tables...');
    await client.query(`
      DROP TABLE IF EXISTS public.database_backups CASCADE;
      DROP TABLE IF EXISTS public.telemetry_snapshots CASCADE;
      DROP TABLE IF EXISTS public.tenant_subscriptions CASCADE;
      DROP TABLE IF EXISTS public.global_auth_mapping CASCADE;
      DROP TABLE IF EXISTS public.tenants CASCADE;
    `);
    console.log('✅ Public control plane wiped.');
  } finally {
    client.release();
  }

  // 3. Apply fresh Migration 001 (Public Control Plane)
  console.log('🚀 Running Public Control Plane Migration 001...');
  await runPublicMigrations();
  console.log('✅ Public Control Plane initialized.');

  // 4. Provision tenant_demo schema
  console.log('🏛️ Provisioning official "tenant_demo" schema...');
  await provisionTenantSchema('tenant_demo');
  console.log('✅ "tenant_demo" schema provisioned.');

  // 5. Create demo tenant in public control plane
  const client2 = await pool.connect();
  let demoTenantId: string;
  try {
    const tenantRes = await client2.query(
      `INSERT INTO public.tenants (slug, name, schema_name, status, plan, admin_email, contact_phone, industry)
       VALUES ('demo', 'Enterprise Demo Workspace', 'tenant_demo', 'active', 'enterprise', 'admin@demo.com', '+1 (555) 234-5678', 'Corporate / Technology')
       RETURNING id`
    );
    demoTenantId = tenantRes.rows[0].id;

    await client2.query(
      `INSERT INTO public.tenant_subscriptions (tenant_id, tier, max_employees, status, billing_cycle)
       VALUES ($1, 'enterprise', 500, 'active', 'annual')`,
      [demoTenantId]
    );

    const passwordHash = hashPassword('admin123');

    const authMappings = [
      { sub: 'sub_demo_admin_001', email: 'admin@demo.com', role: 'super_admin' },
      { sub: 'sub_demo_hr_002', email: 'hr@demo.com', role: 'hr_manager' },
      { sub: 'sub_demo_emp_003', email: 'david.kim@demo.com', role: 'employee' },
      { sub: 'sub_demo_emp_004', email: 'emily.watson@demo.com', role: 'employee' },
      { sub: 'sub_demo_faculty_005', email: 'meera.deshmukh@school.edu', role: 'faculty' },
    ];

    for (const u of authMappings) {
      await client2.query(
        `INSERT INTO public.global_auth_mapping (cognito_sub, email, password_hash, tenant_id, role, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [u.sub, u.email, passwordHash, demoTenantId, u.role]
      );
    }
    console.log('✅ Configured public.tenants and public.global_auth_mapping.');
  } finally {
    client2.release();
  }

  // 6. Populate authentic domain records in schema "tenant_demo"
  console.log('🌱 Seeding authentic PostgreSQL records into schema "tenant_demo"...');
  await withTenantContext('tenant_demo', async (_c, query) => {
    // 6.1 Offices
    const offRes = await query(
      `INSERT INTO offices (name, code, address, latitude, longitude, geofence_radius_meters, timezone)
       VALUES 
         ('Corporate Headquarters', 'HQ-BLR', 'Koramangala 5th Block, Bengaluru, Karnataka 560095', 12.9352, 77.6245, 250, 'Asia/Kolkata'),
         ('Innovation Hub', 'HUB-SFO', '100 Market St, Suite 300, San Francisco, CA 94105', 37.7928, -122.3969, 300, 'America/Los_Angeles')
       RETURNING id, code`
    );
    const hqOfficeId = offRes.rows.find((r: any) => r.code === 'HQ-BLR')!.id;
    const sfoOfficeId = offRes.rows.find((r: any) => r.code === 'HUB-SFO')!.id;

    // 6.2 Departments
    const deptRes = await query(
      `INSERT INTO departments (name, code)
       VALUES 
         ('Engineering', 'ENG'),
         ('Human Resources', 'HR'),
         ('Product & Design', 'PROD'),
         ('Sales & Marketing', 'SALES'),
         ('Faculty & Academics', 'FAC')
       RETURNING id, code`
    );
    const engDeptId = deptRes.rows.find((r: any) => r.code === 'ENG')!.id;
    const hrDeptId = deptRes.rows.find((r: any) => r.code === 'HR')!.id;
    const prodDeptId = deptRes.rows.find((r: any) => r.code === 'PROD')!.id;
    const salesDeptId = deptRes.rows.find((r: any) => r.code === 'SALES')!.id;
    const facDeptId = deptRes.rows.find((r: any) => r.code === 'FAC')!.id;

    // 6.3 Teams
    const teamRes = await query(
      `INSERT INTO teams (department_id, name)
       VALUES 
         ($1, 'Core Platform Team'),
         ($1, 'Frontend Architecture'),
         ($2, 'People Operations'),
         ($3, 'Brand & Product Design'),
         ($4, 'Enterprise Solutions'),
         ($5, 'Computer Science & Engineering')
       RETURNING id, name`,
      [engDeptId, hrDeptId, prodDeptId, salesDeptId, facDeptId]
    );
    const coreTeamId = teamRes.rows.find((r: any) => r.name === 'Core Platform Team')!.id;
    const prodTeamId = teamRes.rows.find((r: any) => r.name === 'Brand & Product Design')!.id;
    const csTeamId = teamRes.rows.find((r: any) => r.name === 'Computer Science & Engineering')!.id;

    // 6.4 Job Roles
    const roleRes = await query(
      `INSERT INTO job_roles (title, code, department_id, level)
       VALUES 
         ('Principal Cloud Architect', 'ARCH-01', $1, 'L4'),
         ('VP of People & Culture', 'HR-VP', $2, 'L5'),
         ('Senior Full Stack Engineer', 'DEV-SR', $1, 'L3'),
         ('Senior Product Designer', 'DES-SR', $3, 'L3'),
         ('Enterprise Account Executive', 'SALES-SR', $4, 'L3'),
         ('Senior Faculty & Academic Dean', 'PROF-DEAN', $5, 'L5')
       RETURNING id, code`,
      [engDeptId, hrDeptId, prodDeptId, salesDeptId, facDeptId]
    );
    const archRoleId = roleRes.rows.find((r: any) => r.code === 'ARCH-01')!.id;
    const hrRoleId = roleRes.rows.find((r: any) => r.code === 'HR-VP')!.id;
    const devRoleId = roleRes.rows.find((r: any) => r.code === 'DEV-SR')!.id;
    const desRoleId = roleRes.rows.find((r: any) => r.code === 'DES-SR')!.id;
    const profRoleId = roleRes.rows.find((r: any) => r.code === 'PROF-DEAN')!.id;

    // 6.5 Employees
    const empRes = await query(
      `INSERT INTO employees (
         cognito_sub, employee_code, first_name, last_name, email, phone,
         office_id, department_id, team_id, job_role_id, role, employment_status, date_of_joining
       ) VALUES 
         ('sub_demo_admin_001', 'EMP001', 'Alex', 'Morgan', 'admin@demo.com', '+1 (555) 234-5678', $1, $2, $3, $4, 'super_admin', 'active', '2024-01-10'),
         ('sub_demo_hr_002', 'EMP002', 'Sarah', 'Connor', 'hr@demo.com', '+1 (555) 876-5432', $1, $5, NULL, $6, 'hr_manager', 'active', '2024-03-15'),
         ('sub_demo_emp_003', 'EMP003', 'David', 'Kim', 'david.kim@demo.com', '+1 (555) 345-6789', $1, $2, $3, $7, 'employee', 'active', '2024-06-01'),
         ('sub_demo_emp_004', 'EMP004', 'Emily', 'Watson', 'emily.watson@demo.com', '+1 (555) 456-7890', $8, $9, $10, $11, 'employee', 'active', '2024-08-20'),
         ('sub_demo_faculty_005', 'EMP005', 'Meera', 'Deshmukh', 'meera.deshmukh@school.edu', '+91 98450 11223', $1, $12, $13, $14, 'faculty', 'active', '2023-08-01')
       RETURNING id, employee_code, first_name`,
      [
        hqOfficeId, engDeptId, coreTeamId, archRoleId,
        hrDeptId, hrRoleId,
        devRoleId,
        sfoOfficeId, prodDeptId, prodTeamId, desRoleId,
        facDeptId, csTeamId, profRoleId
      ]
    );

    const alexId = empRes.rows.find((r: any) => r.employee_code === 'EMP001')!.id;
    const sarahId = empRes.rows.find((r: any) => r.employee_code === 'EMP002')!.id;
    const davidId = empRes.rows.find((r: any) => r.employee_code === 'EMP003')!.id;
    const emilyId = empRes.rows.find((r: any) => r.employee_code === 'EMP004')!.id;
    const meeraId = empRes.rows.find((r: any) => r.employee_code === 'EMP005')!.id;

    // 6.6 Bank Details
    await query(
      `INSERT INTO bank_details (employee_id, account_holder_name, account_number, bank_name, routing_or_ifsc_code)
       VALUES 
         ($1, 'Alex Morgan', '987654321012', 'HDFC Bank', 'HDFC0001234'),
         ($2, 'Sarah Connor', '876543210987', 'ICICI Bank', 'ICIC0005678'),
         ($3, 'David Kim', '123456789012', 'Chase Bank', 'CHASUS33'),
         ($4, 'Emily Watson', '234567890123', 'Bank of America', 'BOFAUS3N'),
         ($5, 'Prof. Dr. Meera Deshmukh', '456789012345', 'State Bank of India', 'SBIN0001234')`,
      [alexId, sarahId, davidId, emilyId, meeraId]
    );

    // 6.7 Salary Structures with Allowances Breakdown
    await query(
      `INSERT INTO salary_structures (
         employee_id, currency, base_salary, hra, special_allowance, conveyance_allowance, medical_allowance, other_allowances, allowances, provident_fund_deduction, tax_deduction
       ) VALUES 
         ($1, 'INR', 150000.00, 40000.00, 30000.00, 5000.00, 3000.00, 2000.00, '[{"name":"Internet Stipend","amount":2000}]'::jsonb, 8000.00, 22000.00),
         ($2, 'INR', 110000.00, 30000.00, 20000.00, 3000.00, 2000.00, 0.00, '[]'::jsonb, 6000.00, 14000.00),
         ($3, 'INR', 85000.00, 25000.00, 15000.00, 2000.00, 1500.00, 0.00, '[]'::jsonb, 4500.00, 9500.00),
         ($4, 'INR', 95000.00, 20000.00, 15000.00, 2000.00, 1500.00, 0.00, '[]'::jsonb, 5000.00, 15000.00),
         ($5, 'INR', 140000.00, 35000.00, 25000.00, 4000.00, 2500.00, 0.00, '[{"name":"Academic Research Grant","amount":5000}]'::jsonb, 7000.00, 18000.00)`,
      [alexId, sarahId, davidId, emilyId, meeraId]
    );

    // 6.8 Projects
    const projRes = await query(
      `INSERT INTO projects (name, code, description, client_name, status, start_date, end_date, manager_id)
       VALUES 
         ('Cloud Infrastructure Modernization', 'PRJ-CLOUD', 'Architecture and deployment of multi-tenant microservices on AWS Aurora', 'Acme Global Corp', 'in_progress', '2026-01-01', '2026-12-31', $1),
         ('Enterprise HR & BOS Management Portal', 'PRJ-HRMS', 'Modern HRMS portal with GPS geofenced attendance and payroll processing', 'Internal Enterprise', 'in_progress', '2026-02-01', '2026-11-30', $2)
       RETURNING id, code`,
      [alexId, sarahId]
    );
    const cloudProjId = projRes.rows.find((r: any) => r.code === 'PRJ-CLOUD')!.id;
    const hrmsProjId = projRes.rows.find((r: any) => r.code === 'PRJ-HRMS')!.id;

    // 6.9 Project Tasks
    const taskRes = await query(
      `INSERT INTO project_tasks (project_id, title, description, assigned_to_employee_id, priority, status, due_date)
       VALUES 
         ($1, 'Implement Schema-per-Tenant Migration Runner', 'Build automated DDL migration pipeline with search path isolation', $2, 'urgent', 'in_progress', '2026-09-10'),
         ($1, 'Configure AWS KMS Encryption for S3 Buckets', 'Setup KMS customer managed keys for secure document uploads', $3, 'high', 'in_progress', '2026-09-15'),
         ($4, 'Configure Pay Groups and Allowances Breakdown', 'Enable custom allowances and statutory rules configuration', $5, 'high', 'in_progress', '2026-09-08'),
         ($4, 'Design Enterprise BOS Dashboard UI', 'Implement responsive layout with glassmorphic cards and telemetry', $6, 'medium', 'in_progress', '2026-09-12')
       RETURNING id`,
      [cloudProjId, alexId, davidId, hrmsProjId, sarahId, emilyId]
    );

    // 6.10 Timesheets
    await query(
      `INSERT INTO timesheets (employee_id, project_id, task_id, work_date, hours_spent, description, status)
       VALUES 
         ($1, $2, $3, CURRENT_DATE, 8.0, 'Engineered schema migration isolation runner', 'approved'),
         ($4, $2, $5, CURRENT_DATE, 7.5, 'Implemented KMS bucket encryption handlers', 'approved'),
         ($6, $7, $8, CURRENT_DATE, 8.0, 'Configured pay groups and statutory deduction logic', 'approved')`,
      [
        alexId, cloudProjId, taskRes.rows[0].id,
        davidId, taskRes.rows[1].id,
        sarahId, hrmsProjId, taskRes.rows[2].id,
      ]
    );

    // 6.11 Attendance Punches
    const today = new Date().toISOString().split('T')[0];
    await query(
      `INSERT INTO attendance_punches (
         employee_id, office_id, punch_type, punch_timestamp, latitude, longitude, distance_from_office_meters, is_within_geofence, device_info, ip_address
       ) VALUES 
         ($1, $2, 'check_in', ($3 || ' 09:02:15')::timestamptz, 12.9352, 77.6245, 12.5, true, 'Chrome on Windows', '106.51.72.18'),
         ($4, $2, 'check_in', ($3 || ' 09:14:30')::timestamptz, 12.9354, 77.6248, 25.0, true, 'macOS Safari', '106.51.72.22'),
         ($5, $2, 'check_in', ($3 || ' 08:58:10')::timestamptz, 12.9351, 77.6244, 8.0, true, 'Firefox Desktop', '106.51.72.18'),
         ($6, $7, 'check_in', ($3 || ' 09:05:00')::timestamptz, 37.7928, -122.3969, 15.0, true, 'Edge Browser', '64.104.22.10')`,
      [alexId, hqOfficeId, today, sarahId, davidId, emilyId, sfoOfficeId]
    );

    // 6.12 Leave Requests
    await query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status, approver_id)
       VALUES 
         ($1, 'casual', ($2::date + interval '5 days'), ($2::date + interval '6 days'), 2.0, 'Attending Cloud Architecture Summit', 'approved', $3),
         ($4, 'sick', ($2::date + interval '10 days'), ($2::date + interval '10 days'), 1.0, 'Doctor Appointment', 'pending', $3)`,
      [alexId, today, sarahId, davidId]
    );

    // 6.13 Payroll Runs & Payslips
    const runRes = await query(
      `INSERT INTO payroll_runs (month, year, total_payout, employee_count, status, executed_by_employee_id)
       VALUES (8, 2026, 440000.00, 4, 'completed', $1)
       RETURNING id`,
      [sarahId]
    );
    const runId = runRes.rows[0].id;

    await query(
      `INSERT INTO payslips (
         payroll_run_id, employee_id, month_year, base_salary, hra, special_allowance, conveyance_allowance, medical_allowance, other_allowances, allowances_breakdown, pf_deduction, tax_deduction, net_payable, status
       ) VALUES 
         ($1, $2, 'Aug 2026', 150000.00, 40000.00, 30000.00, 5000.00, 3000.00, 4000.00, '[{"name":"HRA","amount":40000},{"name":"Special Allowance","amount":30000},{"name":"Conveyance","amount":5000}]'::jsonb, 8000.00, 22000.00, 202000.00, 'Paid'),
         ($1, $3, 'Aug 2026', 110000.00, 30000.00, 20000.00, 3000.00, 2000.00, 0.00, '[{"name":"HRA","amount":30000},{"name":"Special Allowance","amount":20000}]'::jsonb, 6000.00, 14000.00, 145000.00, 'Paid'),
         ($1, $4, 'Aug 2026', 85000.00, 25000.00, 15000.00, 2000.00, 1500.00, 0.00, '[{"name":"HRA","amount":25000},{"name":"Special Allowance","amount":15000}]'::jsonb, 4500.00, 9500.00, 114500.00, 'Paid'),
         ($1, $5, 'Aug 2026', 95000.00, 20000.00, 15000.00, 2000.00, 1500.00, 0.00, '[{"name":"HRA","amount":20000},{"name":"Special Allowance","amount":15000}]'::jsonb, 5000.00, 15000.00, 113500.00, 'Paid')`,
      [runId, alexId, sarahId, davidId, emilyId]
    );

    // 6.14 Announcements
    await query(
      `INSERT INTO announcements (title, content, author_employee_id, priority, is_published)
       VALUES 
         ('Q3 All-Hands Townhall & Technical Roadmap', 'Join the executive and engineering leadership team this Friday at 4:00 PM for business updates and product roadmap announcements.', $1, 'important', true),
         ('Annual Health & Wellness Checkup Camp', 'Annual preventive health consultations and checkups will be available on Floor 3 next week.', $2, 'normal', true)`,
      [alexId, sarahId]
    );

    // 6.15 Notifications
    await query(
      `INSERT INTO notifications (recipient_employee_id, title, message, category, priority, is_read)
       VALUES 
         ($1, 'Leave Request Approved', 'Your leave request for Cloud Architecture Summit was approved.', 'Approvals', 'medium', false),
         ($2, 'Timesheets Submitted', 'David Kim submitted timesheets for Sprint 24.', 'Tasks', 'low', false)`,
      [alexId, sarahId]
    );

    // 6.16 Audit Logs
    await query(
      `INSERT INTO audit_trail (actor_name, actor_sub, actor_email, action, entity_type, entity_id, details, ip_address)
       VALUES 
         ('Alex Morgan', 'sub_demo_admin_001', 'admin@demo.com', 'INITIALIZE_WORKSPACE', 'Tenant', 'demo', '{"message":"Workspace initialized in PostgreSQL"}'::jsonb, '127.0.0.1'),
         ('Sarah Connor', 'sub_demo_hr_002', 'hr@demo.com', 'EXECUTE_PAYROLL_RUN', 'PayrollRun', $1, '{"month":8,"year":2026,"total_payout":440000}'::jsonb, '106.51.72.18')`,
      [runId]
    );
  });

  // 7. Multi-Tenant Isolation Verification Test
  console.log('🧪 Running Multi-Tenant Isolation Verification Test...');
  await provisionTenantSchema('tenant_acme_test');
  const client3 = await pool.connect();
  try {
    const acmeTenant = await client3.query(
      `INSERT INTO public.tenants (slug, name, schema_name, status, plan, admin_email)
       VALUES ('acme_test', 'Acme Test Corp', 'tenant_acme_test', 'active', 'professional', 'admin@acme.com')
       RETURNING id`
    );
    const acmeTenantId = acmeTenant.rows[0].id;

    // Seed one employee in tenant_acme_test
    await withTenantContext('tenant_acme_test', async (_c, query) => {
      await query(
        `INSERT INTO employees (employee_code, first_name, last_name, email, role)
         VALUES ('ACME001', 'John', 'Doe', 'john@acme.com', 'super_admin')`
      );
    });

    // Check that demo tenant has 5 employees and acme tenant has 1 employee
    const demoEmpCount = await withTenantContext('tenant_demo', async (_c, query) => {
      const res = await query('SELECT count(*) as c FROM employees');
      return Number(res.rows[0].c);
    });
    const acmeEmpCount = await withTenantContext('tenant_acme_test', async (_c, query) => {
      const res = await query('SELECT count(*) as c FROM employees');
      return Number(res.rows[0].c);
    });

    console.log(`  📊 Isolated Count Verification: tenant_demo = ${demoEmpCount} employees, tenant_acme_test = ${acmeEmpCount} employees.`);
    if (demoEmpCount === 5 && acmeEmpCount === 1) {
      console.log('  🔒 TENANT ISOLATION FULLY VERIFIED: ZERO DATA LEAKAGE DETECTED!');
    } else {
      throw new Error(`Tenant isolation test mismatch: demo=${demoEmpCount}, acme=${acmeEmpCount}`);
    }

    // Clean up test schema
    await client3.query('DROP SCHEMA IF EXISTS "tenant_acme_test" CASCADE');
    await client3.query('DELETE FROM public.tenants WHERE id = $1', [acmeTenantId]);
    console.log('  🧹 Cleaned up temporary test tenant.');
  } finally {
    client3.release();
  }

  console.log('=============================================================');
  console.log('🎉 DATABASE RESET & RE-PROVISIONING COMPLETE!');
  console.log('   Tenant:   Enterprise Demo Workspace (slug: demo)');
  console.log('   Schema:   tenant_demo');
  console.log('   Admin:    admin@demo.com (Password: admin123)');
  console.log('   HR Lead:  hr@demo.com    (Password: admin123)');
  console.log('=============================================================');
}

// CLI Execution
if (process.argv[1] && (process.argv[1].endsWith('resetDatabase.ts') || process.argv[1].endsWith('resetDatabase.js'))) {
  resetDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Reset failed:', err);
      process.exit(1);
    });
}
