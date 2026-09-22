export type UserRole =
  | 'platform_admin'
  | 'super_admin'
  | 'hr_manager'
  | 'manager'
  | 'employee'
  | 'faculty'
  | 'student';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: UserRole;
  tenant_id: string;
  db_schema: string;
  name?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  schema_name: string;
  status: 'active' | 'suspended' | 'provisioning' | 'decommissioned';
  plan: 'starter' | 'professional' | 'enterprise';
  admin_email: string;
  contact_phone?: string;
  created_at: string;
  updated_at: string;
}

export type AccountStatus =
  | 'Not Activated'
  | 'Active'
  | 'In Probation'
  | 'On Leave'
  | 'Notice Period'
  | 'Suspended'
  | 'Deactivated';

export interface EmployeeRecord {
  id: string;
  cognito_sub?: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  office_id: string;
  department_id: string;
  team_id?: string;
  job_role_id: string;
  reporting_manager_id?: string;
  role: UserRole;
  employment_status?: string;
  account_status: AccountStatus;
  date_of_joining: string;
  created_at: string;
}

export interface OfficeRecord {
  id: string;
  name: string;
  code: string;
  address: string;
  latitude: number;
  longitude: number;
  geofence_radius_meters: number;
  timezone: string;
  is_active: boolean;
}
