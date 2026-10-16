import { pool } from '../config/database.js';
import { runPublicMigrations, provisionTenantSchema } from './migrator.js';
import { withTenantContext } from './queryRunner.js';
import { hashPassword } from '../utils/crypto.js';

export async function seedDemoTenant(): Promise<void> {
  console.log('🚀 Provisioning official Demo Tenant ("tenant_demo")...');

  // 1. Ensure public migrations are applied
  await runPublicMigrations();

  // 2. Drop existing demo schema if resetting
  const client = await pool.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS "tenant_demo" CASCADE');
    await client.query("DELETE FROM public.tenants WHERE slug = 'demo'");
    await client.query("DELETE FROM public.global_auth_mapping WHERE email IN ('admin@demo.com', 'hr@demo.com', 'david.kim@demo.com', 'emily.watson@demo.com')");
  } finally {
    client.release();
  }

  // 3. Provision tenant_demo schema
  await provisionTenantSchema('tenant_demo');

  const client2 = await pool.connect();
  let tenantId: string;
  try {
    // 4. Create Public Tenant Record
    const tenantRes = await client2.query(
      `INSERT INTO public.tenants (slug, name, schema_name, status, plan, admin_email, contact_phone)
       VALUES ('demo', 'Enterprise Demo Workspace', 'tenant_demo', 'active', 'enterprise', 'admin@demo.com', '+1-800-555-0199')
       RETURNING id`
    );
    tenantId = tenantRes.rows[0].id;

    // 5. Subscription
    await client2.query(
      `INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, tier, max_employees, status, billing_cycle)
       SELECT $1, p.id, p.key, 250, 'active', 'annual'
         FROM public.license_plans p WHERE p.key = 'enterprise'`,
      [tenantId]
    );

    // 6. Global Auth Mappings with password 'admin123'
    const adminPassHash = hashPassword('admin123');

    const usersToMap = [
      { email: 'admin@demo.com', role: 'super_admin', sub: 'sub_demo_admin_001' },
      { email: 'hr@demo.com', role: 'hr_manager', sub: 'sub_demo_hr_002' },
      { email: 'david.kim@demo.com', role: 'employee', sub: 'sub_demo_emp_003' },
      { email: 'emily.watson@demo.com', role: 'employee', sub: 'sub_demo_emp_004' },
    ];

    for (const u of usersToMap) {
      await client2.query(
        `INSERT INTO public.global_auth_mapping (cognito_sub, email, password_hash, tenant_id, role, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (cognito_sub, tenant_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [u.sub, u.email, adminPassHash, tenantId, u.role]
      );
    }

    console.log('✅ Configured public.tenants and public.global_auth_mapping for demo tenant.');
  } finally {
    client2.release();
  }

  // 7. Seed Domain Data in "tenant_demo" schema
  await withTenantContext('tenant_demo', async (_c, query) => {
    // Offices
    const offRes = await query(
      `INSERT INTO offices (name, code, address, latitude, longitude, geofence_radius_meters, timezone)
       VALUES 
         ('Corporate Headquarters', 'HQ-BLR', 'Koramangala 5th Block, Bengaluru, Karnataka 560095', 12.9352, 77.6245, 250, 'Asia/Kolkata'),
         ('Innovation Hub', 'HUB-SFO', '100 Market St, Suite 300, San Francisco, CA 94105', 37.7928, -122.3969, 300, 'America/Los_Angeles')
       RETURNING id, code`
    );
    const hqOfficeId = offRes.rows[0].id;
    const sfoOfficeId = offRes.rows[1].id;

    // Departments
    const deptRes = await query(
      `INSERT INTO departments (name, code)
       VALUES 
         ('Engineering', 'ENG'),
         ('Human Resources', 'HR'),
         ('Product & Design', 'PROD'),
         ('Sales & Marketing', 'SALES')
       RETURNING id, code`
    );
    const engDeptId = deptRes.rows.find(r => r.code === 'ENG')!.id;
    const hrDeptId = deptRes.rows.find(r => r.code === 'HR')!.id;
    const prodDeptId = deptRes.rows.find(r => r.code === 'PROD')!.id;
    const salesDeptId = deptRes.rows.find(r => r.code === 'SALES')!.id;

    // Teams
    const teamRes = await query(
      `INSERT INTO teams (department_id, name)
       VALUES 
         ($1, 'Core Platform Team'),
         ($1, 'Frontend Architecture'),
         ($2, 'Talent Acquisition & Ops'),
         ($3, 'UI/UX Design Systems'),
         ($4, 'Enterprise Growth Team')
       RETURNING id, name`,
      [engDeptId, hrDeptId, prodDeptId, salesDeptId]
    );
    const coreTeamId = teamRes.rows[0].id;
    const feTeamId = teamRes.rows[1].id;

    // Job Roles
    const roleRes = await query(
      `INSERT INTO job_roles (title, code, department_id, level)
       VALUES 
         ('Principal Cloud Architect', 'ENG-ARCH', $1, 'L5'),
         ('Senior Full Stack Engineer', 'ENG-SDE3', $1, 'L3'),
         ('VP of People & Culture', 'HR-VP', $2, 'L5'),
         ('Senior Product Designer', 'PROD-DES', $3, 'L3'),
         ('Enterprise Sales Lead', 'SALES-LEAD', $4, 'L4')
       RETURNING id, code`,
      [engDeptId, hrDeptId, prodDeptId, salesDeptId]
    );
    const archRoleId = roleRes.rows.find(r => r.code === 'ENG-ARCH')!.id;
    const sdeRoleId = roleRes.rows.find(r => r.code === 'ENG-SDE3')!.id;
    const hrLeadRoleId = roleRes.rows.find(r => r.code === 'HR-VP')!.id;
    const designRoleId = roleRes.rows.find(r => r.code === 'PROD-DES')!.id;

    // Employees
    const empRes = await query(
      `INSERT INTO employees (
         employee_code, first_name, last_name, email, phone,
         office_id, department_id, team_id, job_role_id, role, employment_status, date_of_joining
       ) VALUES 
         ('EMP001', 'Alex', 'Morgan', 'admin@demo.com', '+1 (555) 234-5678', $1, $2, $3, $4, 'super_admin', 'active', '2024-01-10'),
         ('EMP002', 'Sarah', 'Connor', 'hr@demo.com', '+1 (555) 876-5432', $1, $5, NULL, $6, 'hr_manager', 'active', '2024-03-15'),
         ('EMP003', 'David', 'Kim', 'david.kim@demo.com', '+1 (555) 345-6789', $1, $2, $3, $7, 'employee', 'active', '2024-06-01'),
         ('EMP004', 'Emily', 'Watson', 'emily.watson@demo.com', '+1 (555) 456-7890', $8, $9, NULL, $10, 'employee', 'active', '2024-08-20')
       RETURNING id, employee_code, email`,
      [
        hqOfficeId, engDeptId, coreTeamId, archRoleId,
        hrDeptId, hrLeadRoleId,
        sdeRoleId,
        sfoOfficeId, prodDeptId, designRoleId,
      ]
    );

    const adminEmpId = empRes.rows[0].id;
    const hrEmpId = empRes.rows[1].id;
    const davidEmpId = empRes.rows[2].id;
    const emilyEmpId = empRes.rows[3].id;

    // Bank Details
    await query(
      `INSERT INTO bank_details (employee_id, account_holder_name, account_number, bank_name, routing_or_ifsc_code)
       VALUES 
         ($1, 'Alex Morgan', '987654321012', 'HDFC Bank', 'HDFC0001234'),
         ($2, 'Sarah Connor', '876543210987', 'ICICI Bank', 'ICIC0005678'),
         ($3, 'David Kim', '123456789012', 'Chase Bank', 'CHASUS33'),
         ($4, 'Emily Watson', '234567890123', 'Bank of America', 'BOFAUS3N')`,
      [adminEmpId, hrEmpId, davidEmpId, emilyEmpId]
    );

    // Salary Structures
    await query(
      `INSERT INTO salary_structures (employee_id, currency, base_salary, hra, special_allowance, provident_fund_deduction, tax_deduction)
       VALUES 
         ($1, 'INR', 150000, 40000, 30000, 8000, 22000),
         ($2, 'INR', 110000, 30000, 20000, 6000, 14000),
         ($3, 'INR', 85000, 25000, 15000, 4500, 9500),
         ($4, 'USD', 9500, 2000, 1500, 500, 1500)`,
      [adminEmpId, hrEmpId, davidEmpId, emilyEmpId]
    );

    // Seed Attendance Punches (Last 14 days of rich records)
    for (let dayOffset = 14; dayOffset >= 0; dayOffset--) {
      // Check in punch (09:05 AM)
      await query(
        `INSERT INTO attendance_punches (employee_id, office_id, punch_type, punch_timestamp, latitude, longitude, is_within_geofence)
         VALUES 
           ($1, $3, 'check_in', CURRENT_DATE - ($4 || ' days')::INTERVAL + TIME '09:05:00', 12.9352, 77.6245, true),
           ($2, $3, 'check_in', CURRENT_DATE - ($4 || ' days')::INTERVAL + TIME '08:55:00', 12.9352, 77.6245, true)`,
        [adminEmpId, davidEmpId, hqOfficeId, dayOffset]
      );
      // Check out punch (18:15 PM)
      await query(
        `INSERT INTO attendance_punches (employee_id, office_id, punch_type, punch_timestamp, latitude, longitude, is_within_geofence)
         VALUES 
           ($1, $3, 'check_out', CURRENT_DATE - ($4 || ' days')::INTERVAL + TIME '18:20:00', 12.9352, 77.6245, true),
           ($2, $3, 'check_out', CURRENT_DATE - ($4 || ' days')::INTERVAL + TIME '18:10:00', 12.9352, 77.6245, true)`,
        [adminEmpId, davidEmpId, hqOfficeId, dayOffset]
      );
    }

    // Leave Requests
    await query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status, approver_id)
       VALUES 
         ($1, 'casual', CURRENT_DATE + INTERVAL '5 days', CURRENT_DATE + INTERVAL '6 days', 2.0, 'Family wedding ceremony', 'pending', NULL),
         ($2, 'sick', CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE - INTERVAL '9 days', 2.0, 'Seasonal viral flu', 'approved', $3),
         ($4, 'earned', CURRENT_DATE + INTERVAL '12 days', CURRENT_DATE + INTERVAL '16 days', 5.0, 'Annual family trip to Hawaii', 'approved', $3)`,
      [davidEmpId, emilyEmpId, adminEmpId, hrEmpId]
    );

    const leaveYear = new Date().getFullYear();
    await query(
      `INSERT INTO employee_leave_balances (employee_id, year, casual_leave, sick_leave, earned_leave, wfh)
       VALUES
         ($1, $5, 12, 10, 15, 24),
         ($2, $5, 12, 8, 15, 24),
         ($3, $5, 12, 10, 10, 24),
         ($4, $5, 12, 10, 15, 24)
       ON CONFLICT (employee_id, year) DO NOTHING`,
      [adminEmpId, emilyEmpId, hrEmpId, davidEmpId, leaveYear]
    );

    // Projects
    const projRes = await query(
      `INSERT INTO projects (name, code, description, client_name, manager_id, status)
       VALUES 
         ('NextGen Enterprise BOS Platform', 'PRJ-BOS', 'Unified multi-tenant cloud enterprise operating system with Aurora Serverless v2', 'Internal Core Platform', $1, 'in_progress'),
         ('AI Automation Agent & Copilot', 'PRJ-AIA', 'Operational intelligence and automated secretarial service with LangGraph', 'Global Enterprise Alpha', $1, 'in_progress'),
         ('Global Cloud HRMS Modernization', 'PRJ-HRM', 'Complete revamp of geofencing attendance, automated payroll, and audit trails', 'Fortune 500 Client', $2, 'completed')
       RETURNING id, code`,
      [adminEmpId, hrEmpId]
    );
    const bosProjId = projRes.rows[0].id;
    const aiaProjId = projRes.rows[1].id;

    // Project Tasks
    await query(
      `INSERT INTO project_tasks (project_id, title, description, assigned_to_employee_id, priority, status, due_date)
       VALUES 
         ($1, 'Configure Aurora Serverless v2 Auto-Scaling', 'Set minimum ACUs to 0.5 and maximum to 16 for high traffic resilience.', $2, 'urgent', 'in_progress', CURRENT_DATE + INTERVAL '4 days'),
         ($1, 'Implement AWS Cognito JWT Verification in Express', 'Support custom attributes (custom:role, custom:tenant_id, custom:db_schema).', $2, 'high', 'done', CURRENT_DATE - INTERVAL '1 day'),
         ($1, 'Geofencing Punch Validation with Haversine Formula', 'Ensure mobile clock-ins only succeed within 250m perimeter radius.', $3, 'high', 'done', CURRENT_DATE - INTERVAL '2 days'),
         ($4, 'LangGraph Agent Integration with S3 Presigned URLs', 'Upload exported documents directly to S3 without passing bytes through Express.', $3, 'medium', 'todo', CURRENT_DATE + INTERVAL '7 days')`,
      [bosProjId, adminEmpId, davidEmpId, aiaProjId]
    );

    // Timesheets
    await query(
      `INSERT INTO timesheets (employee_id, project_id, task_id, work_date, hours_spent, description, status)
       VALUES 
         ($1, $2, NULL, CURRENT_DATE - INTERVAL '1 day', 8.0, 'Configured PostgreSQL schema migration automation and connection pool resiliency', 'approved'),
         ($3, $2, NULL, CURRENT_DATE - INTERVAL '1 day', 7.5, 'Built responsive attendance reporting matrix and interactive charts', 'approved'),
         ($3, $4, NULL, CURRENT_DATE, 4.0, 'Constructed backend auth router with native PBKDF2 cryptography', 'submitted')`,
      [adminEmpId, bosProjId, davidEmpId, aiaProjId]
    );

    // Payroll Batch Run
    const payrollRunRes = await query(
      `INSERT INTO payroll_runs (month, year, total_payout, employee_count, status, executed_by_employee_id)
       VALUES (8, 2026, 345000, 3, 'completed', $1)
       RETURNING id`,
      [adminEmpId]
    );
    const payrollRunId = payrollRunRes.rows[0].id;

    // Payslips
    await query(
      `INSERT INTO payslips (payroll_run_id, employee_id, month_year, base_salary, hra, special_allowance, pf_deduction, tax_deduction, net_payable, status)
       VALUES 
         ($1, $2, '2026-08', 150000, 40000, 30000, 8000, 22000, 190000, 'Paid'),
         ($1, $3, '2026-08', 110000, 30000, 20000, 6000, 14000, 140000, 'Paid'),
         ($1, $4, '2026-08', 85000, 25000, 15000, 4500, 9500, 111000, 'Paid')`,
      [payrollRunId, adminEmpId, hrEmpId, davidEmpId]
    );

    // Announcements
    await query(
      `INSERT INTO announcements (title, content, author_employee_id, priority)
       VALUES 
         ('Official Enterprise BOS Workspace Live', 'Welcome to Enterprise BOS! Multi-tenant schema-per-tenant isolation is fully operational.', $1, 'urgent'),
         ('Q3 Performance Reviews & Appraisals', 'All managers are requested to complete appraisal reviews in the HRMS module before the end of the month.', $2, 'important'),
         ('New SFO Innovation Hub Office Opened', 'Our new location in San Francisco is now active with GPS geofenced mobile clocking enabled.', $1, 'normal')`,
      [adminEmpId, hrEmpId]
    );

    // Notifications
    await query(
      `INSERT INTO notifications (recipient_employee_id, title, message, category, priority, is_read)
       VALUES 
         ($1, 'Welcome to Enterprise BOS', 'Your workspace is provisioned with real PostgreSQL database isolation.', 'system', 'high', false),
         ($2, 'Leave Request Submitted', 'David Kim submitted a casual leave request for your review.', 'approval', 'medium', false)`,
      [adminEmpId, hrEmpId]
    );

    console.log('✅ Populated comprehensive domain records in schema "tenant_demo".');
  });

  // Ensure platform operator has a usable password hash (Migration 003 inserts placeholder)
  const platformPass = hashPassword('Platform@123');
  await pool.query(
    `UPDATE public.global_auth_mapping
     SET password_hash = $1, role = 'platform_admin', is_active = true, email = 'platform@pixbe.in'
     WHERE cognito_sub = 'sub_platform_admin_001'
        OR (LOWER(email) = 'platform@pixbe.in' AND role = 'platform_admin')`,
    [platformPass]
  );

  console.log('===============================================================');
  console.log('🎉 DEMO TENANT READY WITH LIVE POSTGRESQL DATA!');
  console.log('   Tenant:   Enterprise Demo Workspace (slug: demo)');
  console.log('   Schema:   tenant_demo');
  console.log('   Login:    admin@demo.com');
  console.log('   Password: admin123');
  console.log('   Role:     Super Administrator');
  console.log('---------------------------------------------------------------');
  console.log('   Platform: platform@pixbe.in / Platform@123 (platform_admin)');
  console.log('===============================================================');
}

// Allow direct execution
if (process.argv[1] && (process.argv[1].endsWith('seedDemoTenant.ts') || process.argv[1].endsWith('seedDemoTenant.js'))) {
  seedDemoTenant()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seeding demo tenant failed:', err);
      process.exit(1);
    });
}
