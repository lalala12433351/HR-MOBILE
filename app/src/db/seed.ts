import { pool } from '../config/database.js';
import { runPublicMigrations, provisionTenantSchema } from './migrator.js';
import { withTenantContext } from './queryRunner.js';

export async function seedDemoDatabase(): Promise<void> {
  console.log('🌱 Starting database seeding for tenant "demo_corp"...');

  // 1. Ensure migrations are applied
  await runPublicMigrations();
  await provisionTenantSchema('tenant_demo_corp');

  const client = await pool.connect();

  try {
    // 2. Seed Public Tenant Registry
    const tenantRes = await client.query(
      `INSERT INTO public.tenants (slug, name, schema_name, status, plan, admin_email)
       VALUES ('demo_corp', 'Acme Corporation Inc.', 'tenant_demo_corp', 'active', 'enterprise', 'admin@demo_corp.com')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );

    const tenantId = tenantRes.rows[0].id;

    // Seed Subscription
    await client.query(
      `INSERT INTO public.tenant_subscriptions (tenant_id, tier, max_employees, status, billing_cycle)
       VALUES ($1, 'enterprise', 200, 'active', 'annual')
       ON CONFLICT DO NOTHING`,
      [tenantId]
    );

    console.log(`✅ Seeded public tenant "demo_corp" (ID: ${tenantId})`);
  } finally {
    client.release();
  }

  // 3. Seed Tenant Schema Data
  await withTenantContext('tenant_demo_corp', async (_client, query) => {
    // Seed Offices
    const officeRes = await query(
      `INSERT INTO offices (name, code, address, latitude, longitude, geofence_radius_meters, timezone)
       VALUES 
         ('Corporate Headquarters', 'HQ-BLR', 'Koramangala 5th Block, Bengaluru, Karnataka 560095', 12.9352, 77.6245, 250, 'Asia/Kolkata'),
         ('Innovation Hub', 'HUB-SFO', '100 Market St, Suite 300, San Francisco, CA 94105', 37.7928, -122.3969, 300, 'America/Los_Angeles')
       ON CONFLICT (code) DO UPDATE SET address = EXCLUDED.address
       RETURNING id, code`
    );
    const hqOfficeId = officeRes.rows[0].id;

    // Seed Departments
    const deptRes = await query(
      `INSERT INTO departments (name, code)
       VALUES 
         ('Engineering', 'ENG'),
         ('Human Resources', 'HR'),
         ('Product & Design', 'PROD'),
         ('Sales & Marketing', 'SALES')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, code`
    );
    const engDeptId = deptRes.rows.find(r => r.code === 'ENG')?.id || deptRes.rows[0].id;
    const hrDeptId = deptRes.rows.find(r => r.code === 'HR')?.id || deptRes.rows[1].id;

    // Seed Teams
    const teamRes = await query(
      `INSERT INTO teams (department_id, name)
       VALUES 
         ($1, 'Core Platform Team'),
         ($1, 'Frontend Architecture'),
         ($2, 'Talent Acquisition')
       RETURNING id, name`,
      [engDeptId, hrDeptId]
    );
    const coreTeamId = teamRes.rows[0].id;

    // Seed Job Roles
    const roleRes = await query(
      `INSERT INTO job_roles (title, code, department_id, level)
       VALUES 
         ('Principal Cloud Architect', 'ENG-ARCH', $1, 'L5'),
         ('Senior Full Stack Engineer', 'ENG-SDE3', $1, 'L3'),
         ('VP of People & Culture', 'HR-VP', $2, 'L5'),
         ('HR Operations Lead', 'HR-LEAD', $2, 'L3')
       ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title
       RETURNING id, code`,
      [engDeptId, hrDeptId]
    );
    const archRoleId = roleRes.rows.find(r => r.code === 'ENG-ARCH')?.id || roleRes.rows[0].id;
    const hrLeadRoleId = roleRes.rows.find(r => r.code === 'HR-LEAD')?.id || roleRes.rows[1].id;

    // Seed Employees
    const empRes = await query(
      `INSERT INTO employees (employee_code, first_name, last_name, email, phone, office_id, department_id, team_id, job_role_id, role, employment_status)
       VALUES 
         ('EMP-1001', 'Alex', 'Morgan', 'alex.morgan@demo_corp.com', '+1 (555) 234-5678', $1, $2, $3, $4, 'super_admin', 'active'),
         ('EMP-1002', 'Sarah', 'Connor', 'sarah.connor@demo_corp.com', '+1 (555) 876-5432', $1, $5, NULL, $6, 'hr_manager', 'active'),
         ('EMP-1003', 'David', 'Kim', 'david.kim@demo_corp.com', '+1 (555) 345-6789', $1, $2, $3, $4, 'employee', 'active')
       ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name
       RETURNING id, employee_code, email`,
      [hqOfficeId, engDeptId, coreTeamId, archRoleId, hrDeptId, hrLeadRoleId]
    );
    const adminEmpId = empRes.rows[0].id;
    const employeeEmpId = empRes.rows[2]?.id || empRes.rows[0].id;

    // Seed Bank Details
    await query(
      `INSERT INTO bank_details (employee_id, account_holder_name, account_number, bank_name, routing_or_ifsc_code)
       VALUES 
         ($1, 'Alex Morgan', '987654321012', 'Silicon Valley Bank', 'SVBLUS33'),
         ($2, 'David Kim', '123456789012', 'Chase Bank', 'CHASUS33')
       ON CONFLICT (employee_id) DO NOTHING`,
      [adminEmpId, employeeEmpId]
    );

    // Seed Salary Structures
    await query(
      `INSERT INTO salary_structures (employee_id, currency, base_salary, hra, special_allowance, provident_fund_deduction, tax_deduction)
       VALUES 
         ($1, 'INR', 120000, 30000, 20000, 6000, 14000),
         ($2, 'INR', 75000, 20000, 15000, 4000, 8000)
       ON CONFLICT (employee_id) DO NOTHING`,
      [adminEmpId, employeeEmpId]
    );

    // Seed Projects
    const projectRes = await query(
      `INSERT INTO projects (name, code, description, client_name, manager_id, status)
       VALUES 
         ('NextGen Enterprise BOS Platform', 'PRJ-BOS', 'Unified multi-tenant cloud enterprise operating system', 'Internal Core', $1, 'in_progress'),
         ('AI Automation Agent Service', 'PRJ-AIA', 'Operational intelligence and automated secretarial service', 'Global Enterprise', $1, 'in_progress')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, code`,
      [adminEmpId]
    );
    const bosProjectId = projectRes.rows[0].id;

    // Seed Tasks
    await query(
      `INSERT INTO project_tasks (project_id, title, description, assigned_to_employee_id, priority, status, due_date)
       VALUES 
         ($1, 'Deploy Multi-Tenant Aurora Serverless v2', 'Configure PostgreSQL schema-per-tenant cluster and connection pools', $2, 'urgent', 'in_progress', CURRENT_DATE + INTERVAL '5 days'),
         ($1, 'Validate AWS Cognito JWT Claims', 'Implement custom claims extraction in API Gateway and ECS Fargate', $2, 'high', 'done', CURRENT_DATE + INTERVAL '2 days')
       RETURNING id`,
      [bosProjectId, adminEmpId]
    );

    // Seed Announcements
    await query(
      `INSERT INTO announcements (title, content, author_employee_id, priority)
       VALUES 
         ('Welcome to Enterprise BOS Cloud Platform', 'Our multi-tenant business operating system is now live on AWS ECS Fargate & Aurora Serverless v2.', $1, 'urgent'),
         ('Q3 Performance Reviews & Appraisals', 'All team managers are requested to complete appraisal reviews in the HRMS module.', $1, 'important')`,
      [adminEmpId]
    );

    // Seed Attendance punches for today
    await query(
      `INSERT INTO attendance_punches (employee_id, office_id, punch_type, punch_timestamp, latitude, longitude, is_within_geofence)
       VALUES 
         ($1, $2, 'check_in', CURRENT_TIMESTAMP - INTERVAL '3 hours', 12.9352, 77.6245, true)`,
      [adminEmpId, hqOfficeId]
    );

    console.log('✅ Seeded demo tenant schema data successfully.');
  });
}

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  (async () => {
    try {
      await seedDemoDatabase();
      console.log('🎉 Seeding completed successfully.');
      process.exit(0);
    } catch (err) {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    }
  })();
}
