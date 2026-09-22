export type Role =
  | 'platform_admin'
  | 'super_admin'
  | 'admin'
  | 'hr_manager'
  | 'manager'
  | 'finance_manager'
  | 'sales_manager'
  | 'project_manager'
  | 'team_lead'
  | 'faculty'
  | 'employee'
  | 'student'
  | 'customer'
  | 'vendor';

export type DepartmentName =
  | 'Management'
  | 'HR'
  | 'Marketing'
  | 'Sales'
  | 'Design'
  | 'Development'
  | 'Engineering'
  | 'Finance'
  | 'Faculty'
  | 'Academics'
  | 'Operations'
  | (string & {});

export interface UserPersona {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: Role;
  designation: string;
  department: DepartmentName;
  avatar: string;
}

export interface Organization {
  id: string;
  name: string;
  legalName: string;
  logo: string;
  currency: string;
  currencySymbol: string;
  country: string;
  timeZone: string;
  fiscalYear: string;
  gstin: string;
  pan: string;
  workingDays: string[];
  workingHours: { start: string; end: string };
  officeLocation: {
    address: string;
    latitude: number;
    longitude: number;
    allowedRadiusMeters: number;
  };
  subscriptionPlan: 'Starter' | 'Professional' | 'Business' | 'Enterprise';
  domain?: string;
  industry?: string;
  size?: string;
}

export interface JobTimelineItem {
  id: string;
  effectiveDate: string;
  jobTitle: string;
  positionType?: string;
  employmentType: string;
  lineManager: string;
}

export interface ContractTimelineItem {
  id: string;
  contractNumber: string;
  contractName: string;
  contractType: string;
  startDate: string;
  endDate: string;
}

export interface EmployeeDocument {
  id: string;
  name: string;
  size: string;
  uploadDate: string;
  type?: string;
  category?: string;
}

export interface EmployeePayslipDocument {
  id: string;
  name: string;
  period: string;
  date: string;
  amount: string;
  status: 'Paid' | 'Pending' | 'Processing';
}

export interface SalaryAllowanceItem {
  id: string;
  name: string;
  code?: string;
  amount: number;
  type?: 'fixed' | 'percentage_of_basic';
  percentage?: number;
  taxable?: boolean;
}

export interface SalaryDeductionItem {
  id: string;
  name: string;
  code?: string;
  amount: number;
  isStatutory?: boolean;
}

export type AccountStatus =
  | 'Not Activated'
  | 'Active'
  | 'In Probation'
  | 'On Leave'
  | 'Notice Period'
  | 'Suspended'
  | 'Deactivated'
  | 'Activated'
  | 'Terminated';

export interface Employee {
  id: string;
  employeeId: string;
  name: string;
  fullName?: string;
  email: string;
  password?: string;
  phone: string;
  avatar: string;
  department: DepartmentName;
  designation: string;
  gender?: 'Female' | 'Male' | 'Other' | 'None' | 'Non-Binary' | 'Prefer not to say' | string;
  dateOfBirth?: string;
  bloodGroup?: string;
  nationality?: string;
  maritalStatus?: string;
  personalTaxId?: string;
  socialInsurance?: string;
  healthInsurance?: string;
  timezone?: string;
  primaryAddress?: string;
  country?: string;
  stateProvince?: string;
  city?: string;
  postalCode?: string;
  serviceYear?: string;
  officeName?: string;
  /** Primary office UUID from backend */
  officeId?: string;
  /** All assigned office UUIDs */
  officeIds?: string[];
  /** Assigned offices with primary flag */
  offices?: Array<{ id: string; name: string; isPrimary: boolean }>;
  managerId?: string;
  managerName?: string;
  lineManager?: {
    name: string;
    username: string;
    avatar: string;
    designation?: string;
  };
  team: string;
  /** Backend teams.id when synced */
  teamId?: string;
  joiningDate: string;
  employmentType: 'Full-time' | 'Contract' | 'Contractor' | 'Part-time' | 'Intern';
  location: string;
  skills: string[];
  bankDetails: {
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    accountHolderName?: string;
  };
  salaryDetails?: {
    basic: number;
    hra: number;
    specialAllowance: number;
    conveyanceAllowance?: number;
    medicalAllowance?: number;
    otherAllowances?: number;
    performanceBonus?: number;
    allowanceItems?: SalaryAllowanceItem[];
    deductionItems?: SalaryDeductionItem[];
    pfDeduction: number;
    taxDeduction: number;
    professionalTax?: number;
    esicDeduction?: number;
    netPayable: number;
  };
  assignedAssets?: {
    id: string;
    name: string;
    serial: string;
    assignedDate: string;
    type: string;
  }[];
  emergencyContact: {
    name: string;
    relation: string;
    phone: string;
  };
  status?: AccountStatus | string;
  accountStatus?: AccountStatus;
  noticePeriodDays?: number;
  noticePeriodEndDate?: string;
  exitDate?: string;
  exitReason?: string;
  isActivated?: boolean;
  isDeactivated?: boolean;
  hasCompletedProfile?: boolean;
  hasResetPassword?: boolean;
  onboardingProgress?: number; // 0 - 100
  role?: string;
  salary?: number;
  joinDate?: string;
  jobTimeline?: JobTimelineItem[];
  contractTimeline?: ContractTimelineItem[];
  workSchedule?: {
    name: string;
    workingDays: string;
    workingHours: string;
    hoursPerWeek: number;
  };
  shiftTiming?: {
    shiftId?: string;
    shiftName?: string;
    startTime: string;
    endTime: string;
    graceMinutes?: number;
    isHourlyShift?: boolean;
    hourlyRate?: number;
  };
  payrollSummary?: {
    status: string;
    jobTitle: string;
    employmentType: string;
    jobDate: string;
    geofencing: string;
    lastWorkingDate: string;
    totalCompensation: number;
    salary: number;
    recurring: number;
    oneOff: number;
    offset1: number;
    offset2: number;
  };
  payrollGroupId?: string;
  salaryType?: SalaryType;
  hourlyRate?: number;
  standardHoursPerWeek?: number;
  panNumber?: string;
  pfUanNumber?: string;
  esiNumber?: string;
  personalDocuments?: EmployeeDocument[];
  payslipDocuments?: EmployeePayslipDocument[];
  customFieldValues?: Record<string, any>;
  probationStatus?: 'in_probation' | 'confirmed' | 'extended';
  probationPeriodMonths?: number;
  probationEndDate?: string;
  leaveBalances?: {
    casualLeave: number;
    sickLeave: number;
    earnedLeave: number;
    compOff?: number;
  };
  /** True when leaveBalances were hydrated from GET /attendance/leave-balances. */
  leaveBalancesFromServer?: boolean;
  carriedOverLeaves?: {
    casualLeave?: number;
    sickLeave?: number;
    earnedLeave?: number;
    total?: number;
  };
  hasCustomLeaveOverride?: boolean;
  uploadedDocuments?: {
    id: string;
    fieldId?: string;
    name: string;
    size?: string;
    type?: string;
    category?: string;
    uploadDate: string;
    url?: string;
  }[];
  shiftId?: string;
  rosterShiftId?: string;
  rosterSchedule?: Record<string, string>; // e.g. "Mon" -> "sh-1", or "YYYY-MM-DD" -> "sh-1"
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  avatar: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  status: 'Present' | 'Late' | 'Half Day' | 'Work From Home' | 'On Leave' | 'Absent';
  locationName: string;
  latitude: number;
  longitude: number;
  isWithinGeofence: boolean;
  ipAddress: string;
  device: string;
  workingHours: number;
  breakHours: number;
  isHourly?: boolean;
  shiftName?: string;
  hourlyRate?: number;
  regularHours?: number;
  overtimeHours?: number;
  earnedWages?: number;
  selfiePhoto?: string; // base64 data URL captured at punch time (check-in)
  checkInPhoto?: string; // base64 data URL for check-in punch
  checkOutPhoto?: string; // base64 data URL for check-out punch
}

export interface AttendanceRegularization {
  id: string;
  employeeId: string;
  employeeName: string;
  avatar: string;
  department?: string;
  date: string;
  requestedCheckIn: string;
  requestedCheckOut: string;
  reason: 'Client Visit' | 'Network / GPS Error' | 'Forgot Punch In' | 'Work From Home' | 'On Duty' | 'Biometric Scanner Glitch';
  remarks: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedOn: string;
  approvedBy?: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: DepartmentName;
  leaveType: 'Casual Leave' | 'Sick Leave' | 'Earned Leave' | 'Work From Home' | 'Unpaid Leave' | 'Loss of Pay' | 'Comp Off' | string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  appliedOn: string;
  approvedBy?: string;
  isPaid?: boolean;
  isProbationLeave?: boolean;
  rejectionReason?: string;
}

export interface TimesheetEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskTitle: string;
  date: string;
  startTime?: string;
  endTime?: string;
  hours: number;
  billable: boolean;
  category?: 'Development' | 'Testing' | 'Design' | 'Code Review' | 'Meeting' | 'Documentation' | 'Bug Fix';
  description: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Review' | 'Pending Regularization';
  approvedBy?: string;
  /** Distinguishes work logs from schedule/meeting activities */
  entryType?: 'task' | 'schedule';
  meetingLink?: string;
}

export interface ProjectNote {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  content: string;
  category: 'Tip' | 'Architecture' | 'Meeting Note' | 'Release Note' | 'Bug Guide' | 'Documentation';
  tags: string[];
  authorId: string;
  authorName: string;
  authorAvatar: string;
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  likesCount: number;
}

export type SalaryType = 'monthly' | 'hourly' | 'compliance';

export interface PayrollComplianceRules {
  enableEPF: boolean;
  epfEmployeeRate: number; // default 12%
  epfEmployerRate: number; // default 12%
  epfWageCeilingLimit: number; // e.g. 15000 (INR) or 0 for no cap
  enableESIC: boolean;
  esicEmployeeRate: number; // default 0.75%
  esicEmployerRate: number; // default 3.25%
  esicGrossWageLimit: number; // e.g. 21000 (INR)
  enableProfessionalTax: boolean;
  professionalTaxAmount: number; // default 200
  enableGratuity: boolean;
  gratuityRate: number; // default 4.81%
  enableTDS: boolean;
  tdsRegime: 'new_regime' | 'old_regime' | 'custom_slab';
  statutoryBonusPercent?: number; // e.g. 8.33%
}

export interface GroupAllowanceItem {
  id: string;
  name: string;
  type: 'fixed' | 'percentage_of_basic' | 'percentage_of_ctc';
  amount: number;
  taxable?: boolean;
  frequency?: 'Monthly' | 'Quarterly' | 'Annually' | 'One-Time';
  description?: string;
}

export interface GroupDeductionItem {
  id: string;
  name: string;
  type: 'fixed' | 'percentage_of_basic';
  amount: number;
  isStatutory?: boolean;
  description?: string;
}

export interface GroupCustomField {
  id: string;
  label: string;
  fieldType: 'text' | 'number' | 'select' | 'boolean';
  defaultValue?: string;
  required?: boolean;
  options?: string[]; // for select dropdown
  description?: string;
}

export interface PayrollGroup {
  id: string;
  name: string;
  code: string;
  description: string;
  salaryType: SalaryType;
  payFrequency: 'Monthly' | 'Bi-Weekly' | 'Weekly' | 'Semi-Monthly';
  payDay: number | string; // e.g. 30 for end of month, 1, 5, 25
  currency: string; // USD, INR, EUR, GBP
  standardHoursPerDay: number; // e.g. 8
  workingDaysPerMonth: number; // e.g. 22 or 26 or 30
  overtimeMultiplier: number; // e.g. 1.5
  complianceRules: PayrollComplianceRules;
  assignedEmployeeIds: string[];
  isDefault?: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  // Group-level Structure Defaults & Custom Allowances / Fields
  baseSalaryDefault?: number;
  hraDefault?: number;
  specialAllowanceDefault?: number;
  conveyanceAllowanceDefault?: number;
  medicalAllowanceDefault?: number;
  defaultAllowances?: GroupAllowanceItem[];
  defaultDeductions?: GroupDeductionItem[];
  customFields?: GroupCustomField[];
}

export interface SalaryComponentDefinition {
  id: string;
  name: string;
  code: string;
  type: 'earning' | 'deduction';
  calculationType: 'fixed' | 'percentage_of_basic' | 'percentage_of_gross' | 'statutory_formula';
  value: number; // percentage or fixed amount
  taxable: boolean;
  isStatutory?: boolean;
  isActive: boolean;
  description?: string;
}

export interface PayrollSettings {
  isConfigured: boolean;
  defaultSalaryType: SalaryType;
  defaultPayFrequency: 'Monthly' | 'Bi-Weekly' | 'Weekly' | 'Semi-Monthly';
  defaultCurrency: string;
  payCycleStartDay: number; // e.g. 1
  payCycleEndDay: number; // e.g. 30
  attendanceCutoffDay: number; // e.g. 25
  disbursementDay: number; // e.g. 1
  autoCalculateFromTimesheets: boolean; // For hourly groups
  autoCalculateFromAttendance: boolean; // For leave proration
  allowNegativeNetPay: boolean;
  enableDirectDepositExport: boolean;
  salaryComponentRules: {
    basicPercentOfCTC: number; // e.g. 50
    hraPercentOfBasic: number; // e.g. 40 (non-metro) or 50 (metro)
    pfEmployeePercent: number; // 12
    esiEmployeePercent: number; // 0.75
    defaultHourlyRate: number; // e.g. 60
    overtimeRateMultiplier: number; // 1.5
  };
  statutoryDefaults: {
    pfNumberPrefix?: string;
    esiNumberPrefix?: string;
    taxDeductionAccount?: string;
    panGstValidation?: boolean;
  };
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: DepartmentName;
  monthYear: string;
  salaryType?: SalaryType;
  payrollGroupId?: string;
  payrollGroupName?: string;
  hoursWorked?: number;
  hourlyRate?: number;
  overtimeHours?: number;
  basicSalary: number;
  allowances: number;
  overtimePay: number;
  deductions: number;
  tax: number;
  netPay: number;
  netSalary?: number;
  statutoryBreakdown?: {
    epfEmployee?: number;
    epfEmployer?: number;
    esicEmployee?: number;
    esicEmployer?: number;
    professionalTax?: number;
    tds?: number;
    gratuity?: number;
  };
  status: 'Draft' | 'Processed' | 'Paid';
  paymentDate?: string;
}

export interface ExpenseClaim {
  id: string;
  employeeId: string;
  employeeName: string;
  category: 'Travel' | 'Food' | 'Office Supply' | 'Accommodation' | 'Client Entertainment' | 'Software';
  amount: number;
  currency: string;
  date: string;
  description: string;
  receiptUrl?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Reimbursed';
  approvedBy?: string;
}

export interface PerformanceGoal {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  category: 'OKR' | 'KPI' | 'Personal Development';
  targetMetric: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  dueDate: string;
  progress: number; // 0 - 100
  status: 'On Track' | 'At Risk' | 'Completed' | 'Lagging';
}

export interface Project {
  id: string;
  name: string;
  code: string;
  clientName: string;
  description: string;
  managerId: string;
  managerName: string;
  teamMembers: string[]; // employee IDs
  startDate: string;
  endDate: string;
  dueDate?: string;
  budget?: number;
  spent?: number;
  currency: string;
  category?: string;
  totalWorkHours?: number; // Total allocated/budgeted work hours set by Admin/HR
  loggedWorkHours?: number; // Total hours logged so far across tasks
  approvalStatus?: 'Pending' | 'Approved' | 'Denied'; // Project approval state by Admin/HR
  approvedBy?: string; // Name of Admin/HR who approved or denied
  denialReason?: string; // Reason if project is denied
  status: 'Planning' | 'In Progress' | 'On Hold' | 'Completed' | 'Pending Approval' | 'Approved' | 'Denied';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  progress: number; // 0 - 100
}

export interface Task {
  id: string;
  taskKey?: string; // e.g. TSK-101, BUG-102, STR-103
  issueType?: 'Task' | 'Story' | 'Bug' | 'Improvement';
  projectId?: string; // Optional for standalone / personal tasks
  projectName?: string; // Optional for standalone / personal tasks
  title: string;
  description: string;
  colorClass?: string;
  assigneeId: string;
  assigneeName: string;
  assigneeAvatar?: string;
  reporterName?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  status: 'Backlog' | 'To Do' | 'In Progress' | 'Review' | 'Approved' | 'Completed';
  startDate?: string;
  dueDate?: string;
  estimatedHours?: number;
  actualHours: number;
  timeSpentSeconds?: number; // Total tracked time in seconds
  timerStartedAt?: number; // Epoch timestamp when current In Progress session started
  isTimerRunning?: boolean; // Whether live timer is actively counting
  isTrackingVerified?: boolean; // Verified with backend database
  tags: string[];
  subtasks?: { id: string; title: string; completed: boolean }[];
  commentsCount: number;
  dependencies?: string[]; // IDs of tasks this task depends on
  progress?: number; // 0 - 100 completion percentage
  isMilestone?: boolean; // Flag if this task represents a major project milestone
  attachedDocIds?: string[]; // IDs of DriveItems attached to this task/milestone
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: 'Website' | 'LinkedIn' | 'Google Ads' | 'Referral' | 'WhatsApp' | 'Manual';
  status: 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Converted' | 'Lost';
  score: number;
  value: number;
  assignedTo: string;
  createdDate: string;
}

export interface Customer {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  gstin?: string;
  totalDeals: number;
  totalRevenue: number;
  activeProjects: number;
  supportTicketsCount: number;
  status: 'Active' | 'Inactive' | 'VIP';
}

export interface Deal {
  id: string;
  title: string;
  customerId: string;
  customerName: string;
  amount: number;
  stage: 'Lead' | 'Qualified' | 'Opportunity' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost';
  probability: number; // 0 - 100
  expectedCloseDate: string;
  assignedSalesperson: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  gstAmount: number; // 18%
  totalAmount: number;
  paidAmount: number;
  status: 'Draft' | 'Sent' | 'Paid' | 'Partially Paid' | 'Overdue';
  items: { description: string; quantity: number; unitPrice: number; total: number }[];
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  warehouse?: string;
  unitPrice: number;
  quantityOnHand: number;
  reorderLevel: number;
  status?: 'In Stock' | 'Low Stock' | 'Out of Stock';
  vendorName?: string;
  lastRestocked?: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  customerId?: string;
  customerName: string;
  customerEmail?: string;
  description?: string;
  category: 'Billing' | 'Technical Bug' | 'Feature Request' | 'Onboarding' | string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent' | string;
  status: 'New' | 'Open' | 'In Progress' | 'Waiting' | 'Resolved' | 'Closed' | string;
  assignedAgent?: string;
  createdDate?: string;
  createdAt?: string;
  slaDueDate?: string;
  slaHoursRemaining?: number;
}

export interface ChatChannel {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
  memberCount: number;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  channelId: string; // or 'direct_userID'
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: string;
  attachments?: string[];
  reactions?: { emoji: string; count: number; users: string[] }[];
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorRole: string;
  category: 'General' | 'Announcements' | 'HR' | 'Kudos' | 'Events';
  title: string;
  content: string;
  pollOptions?: { id: string; label: string; votes: number }[];
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  userLiked?: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: 'Company' | 'HR & Policy' | 'Engineering' | 'Celebration' | 'Urgent';
  priority: 'Normal' | 'Important' | 'Critical';
  authorName: string;
  authorRole: string;
  authorAvatar: string;
  date: string;
  pinned: boolean;
  department?: string;
  tags: string[];
  readBy: string[];
  reactions: { emoji: string; count: number; users: string[] }[];
  comments: {
    id: string;
    authorName: string;
    authorAvatar: string;
    authorRole: string;
    text: string;
    createdAt: string;
  }[];
  attachments?: { name: string; size: string; type: string }[];
}

export interface Meeting {
  id: string;
  title: string;
  organizer: string;
  participants: string[];
  date: string;
  startTime: string;
  endTime: string;
  link: string;
  agenda: string;
  actionItems: string[];
}

export interface DriveItem {
  id: string;
  name: string;
  type: 'folder' | 'pdf' | 'doc' | 'sheet' | 'image' | 'zip';
  size?: string;
  modifiedDate?: string;
  uploadedAt?: string;
  owner: string;
  folderCategory: 'Personal' | 'Company' | 'Team' | 'Projects' | 'Customer';
  tags?: string[];
  sharedWith?: string[];
  projectId?: string;
  taskId?: string;
  taskTitle?: string;
  downloadUrl?: string;
}

export interface JobOpening {
  id: string;
  title: string;
  department: DepartmentName;
  location: string;
  type: 'Full-time' | 'Contract';
  applicantsCount: number;
  status: 'Active' | 'Draft' | 'Closed';
  createdDate: string;
}

export interface Candidate {
  id: string;
  jobId: string;
  jobTitle: string;
  name: string;
  email: string;
  phone: string;
  stage: 'Applied' | 'Screening' | 'Interview' | 'Selected' | 'Offer' | 'Hired' | 'Rejected';
  rating: number; // 1 to 5
  appliedDate: string;
  resumeUrl?: string;
}

export interface WorkflowRule {
  id: string;
  name?: string;
  title?: string;
  module?: 'HR' | 'CRM' | 'Projects' | 'Finance' | 'Support';
  triggerEvent: string;
  condition?: string;
  action?: string;
  actionType?: string;
  description?: string;
  enabled: boolean;
  executionsCount?: number;
  executionCount?: number;
  lastTriggered?: string;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  entity: string;
  entityId: string;
  ipAddress: string;
  details: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  category: 'Tasks' | 'Approvals' | 'HR' | 'CRM' | 'Finance' | 'Meetings' | 'System' | 'Attendance';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  read: boolean;
  linkModule?: string;
  linkTab?: string;
  actorName?: string;
  actorAvatar?: string;
  actionLabel?: string;
}

export interface RealtimeToast {
  id: string;
  type: 'message' | 'task' | 'meeting' | 'announcement' | 'attendance' | 'approval' | 'hr' | 'finance' | string;
  title: string;
  senderName?: string;
  senderAvatar?: string;
  message: string;
  timestamp: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  linkModule?: string;
  linkTab?: string;
  channelId?: string;
  taskId?: string;
  projectId?: string;
  unread?: boolean;
}

export interface FeaturePermissions {
  // HRMS & Attendance
  canViewAllEmployees: boolean;
  canApproveLeaves: boolean;
  canEditSalaries: boolean;
  canRegularizeAttendance: boolean;

  // Projects & Tasks
  canCreateProjects: boolean;
  canAssignTasks: boolean;
  canDeleteTasks: boolean;
  canViewBudgets: boolean;

  // Timesheets & Work Logs
  canApproveTimesheets: boolean;
  canViewTeamTimesheets: boolean;
  canEditBillingRates: boolean;
  canLogForOthers: boolean;

  // CRM & Sales
  canManageDeals: boolean;
  canViewAllDeals: boolean;
  canExportLeads: boolean;

  // Finance & Expenses
  canApproveExpenses: boolean;
  canCreateInvoices: boolean;
  canViewRevenueReports: boolean;

  // System & Settings
  canAccessSettings: boolean;
  canCustomizeDropdowns: boolean;
  canManageAccessControl: boolean;
}

export type OnboardingSectionKey = 'basic' | 'personal' | 'address' | 'banking' | 'documents';

export interface CustomProfileField {
  id: string;
  name: string;
  label: string;
  section: OnboardingSectionKey;
  type: 'text' | 'number' | 'date' | 'select' | 'file' | 'textarea' | 'email' | 'tel';
  required: boolean;
  enabled: boolean;
  options?: string[];
  placeholder?: string;
  description?: string;
  isSystemDefault?: boolean;
}

export interface OfficeLocationRecord {
  id: string;
  name: string;
  code?: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  timezone?: string;
  isActive?: boolean;
  geofencingStatus?: 'Active' | 'Inactive' | 'Optional';
}

export interface CustomizableOptions {
  leaveTypes: { id: string; name: string; paid: boolean; annualQuota: number; color: string; description: string }[];
  departments: string[];
  teams: string[];
  offices: string[];
  /** Full office rows with GPS — used by punch geofencing */
  officeRecords?: OfficeLocationRecord[];
  designations: string[];
  employmentTypes: string[];
  employmentTypeCategories?: { id: string; name: string; hasBenefits: boolean; isPermanent: boolean }[];
  defaultInitialPassword?: string;
  forcePasswordReset?: boolean;
  onboardingFields?: CustomProfileField[];
  shifts?: WorkShift[];
  academicBatches?: {
    id: string;
    grade: string;
    section: string;
    startTime: string;
    endTime: string;
    graceMinutes?: number;
    workingDays?: string[];
  }[];
  timetableSlots?: TimetableSlot[];
  attendancePolicies: {
    workDayStartTime: string;
    workDayEndTime: string;
    lateThresholdMinutes: number;
    geofenceRadiusMeters: number;
    autoApproveRegularizationDays: number;
    requireManagerSignoff: boolean;
  };
  attendanceSettings?: {
    isConfigured?: boolean;
    hoursCalculationMethod: 'every_punch' | 'first_last' | 'strict_shift';
    startDate: string;
    approvalCycle: 'Monthly' | 'Bi-Weekly' | 'Weekly';
    repeatOn: string;
    locationScope: string;
    workDayStartTime: string;
    workDayEndTime: string;
    gracePeriodMinutes: number;
    halfDayThresholdHours: number;
    fullDayMinimumHours: number;
    autoClockOutEnabled: boolean;
    autoClockOutHours: number;
    geofenceRadiusMeters: number;
    requireSelfieCheckIn: boolean;
    requireSelfieCheckOut: boolean;
    requireLocationGPS: boolean;
    /** When false, punch UI treats geofence as optional (mirrors requireLocationGPS). */
    geofenceEnabled?: boolean;
    allowQrCodeAttendance: boolean;
    qrRefreshIntervalSeconds: number;
    allowedIpAddresses: string;
    /** Per-office geofence Active/Inactive — persisted because org offices table has no status column. */
    officeGeofencePolicies?: Array<{
      id?: string;
      name: string;
      geofencingStatus: 'Active' | 'Inactive' | 'Optional';
      radiusMeters?: number;
      address?: string;
    }>;
    includeSaturdayInWorkHours?: boolean;
    workingDays?: string[];
    enableAlternateSaturdays?: boolean;
    alternateSaturdaysPolicy?: 'none' | '1st_3rd_off' | '2nd_4th_off' | 'alternate';
    enableAlternateSundays?: boolean;
    alternateSundaysPolicy?: 'none' | '1st_3rd_off' | '2nd_4th_off' | 'alternate';
    enableRosterShifts?: boolean;
    rosterRotationCycle?: 'weekly' | 'biweekly' | 'monthly' | 'custom';
    enableHourlyShiftPolicy?: boolean;
    attendanceCycle?: 'monthly' | 'yearly';
  };
  leaveSettings?: {
    paidLeaveQuota: number;
    casualLeaveQuota: number;
    sickLeaveQuota: number;
    maternityLeaveQuota: number;
    paternityLeaveQuota: number;
    enableCompOff: boolean;
    maxConsecutiveDaysWithoutDoc: number;
    maxCarryForwardDays: number;
    enableCarryOver?: boolean;
    accrualFrequency?: 'annual' | 'monthly';
    monthlyAccrualRates?: Record<string, { casualLeave: number; sickLeave: number; earnedLeave: number }>;
    allowNegativeBalance: boolean;
    restrictDuringNoticePeriod: boolean;
    approvalWorkflow: 'manager_then_hr' | 'manager_only' | 'hr_only';
    roleLeaveQuotas?: Record<string, {
      casualLeave: number;
      sickLeave: number;
      earnedLeave: number;
    }>;
  };
  projectCategories: string[];
  taskStatuses: { id: string; name: string; color: string; isDoneStage?: boolean }[];
  taskPriorities: { id: string; name: string; badgeColor: string; slaHours: number }[];
  timesheetCategories: { id: string; name: string; billableDefault: boolean; color: string }[];
  hourlyBillingRatesByRole: Record<string, number>;
  timesheetApprovalRules: {
    autoApproveUnderHours: number;
    requireProjectManagerApproval: boolean;
    requireHRManagerApproval: boolean;
    allowOvertimeWithoutPreApproval: boolean;
  };
  dealStages: { id: string; name: string; probabilityPct: number; color: string }[];
  leadSources: string[];
  leadStatuses: string[];
  expenseCategories: { id: string; name: string; requiresReceipt: boolean; maxLimitNoApproval: number }[];
  taxRates: { id: string; name: string; percentage: number; isDefault?: boolean }[];
  paymentTerms: string[];
  roleModulePermissions: Record<Role, string[]>;
  roleFeaturePermissions: Record<Role, FeaturePermissions>;
  featureToggles: {
    enableAIAssistant: boolean;
    enableGoogleCalendarTimesheets: boolean;
    enableAIMeetingSummarizer: boolean;
    enableGeofencing: boolean;
    enableOvertimeCalculation: boolean;
    enableClientPortal: boolean;
    themeMode?: 'light' | 'dark';
    highContrastMode?: boolean;
  };
  payrollSettings?: PayrollSettings;
  payrollGroups?: PayrollGroup[];
  salaryComponents?: SalaryComponentDefinition[];
  holidays?: Holiday[];
  activeHolidayTemplateId?: string;
  probationSettings?: ProbationSettings;
  employeeIdSettings?: {
    prefix: string;
    sequenceStart: string;
    defaultCurrency: string;
  };
  profileSelfServiceSettings?: {
    allowSelfEditAddress: boolean;
    allowSelfEditBank: boolean;
    allowCoworkerDirectoryAccess: boolean;
  };
  noticePeriodSettings?: {
    days: number;
    allowBuyout: boolean;
  };
  offboardingSettings?: {
    reqExitInterview: boolean;
    reqAssetClearance: boolean;
    reqManagerNOC: boolean;
    autoRevokeAccessOnLastDay: boolean;
    fnfSettlementDays: number;
  };
  employeeShiftAssignments?: Record<string, string>;
  employeeRosterMatrix?: Record<string, Record<string, string>>;
  reportSettings?: ReportCustomizationSettings;
  academicSettings?: {
    minimumAttendanceThreshold: number; // e.g. 75
    enableLowAttendanceWarning: boolean;
    autoAlertGuardiansBelowThreshold: boolean;
    warningMessage?: string;
    consecutiveAbsenceAlertDays?: number;
  };
}

export interface ReportCustomizationSettings {
  enabledReports?: string[];
  enabledOverviewWidgets?: string[];
  showCharts?: boolean;
  showKpiCards?: boolean;
  visibleFields?: Record<string, string[]>;
  defaultTab?: 'overview' | 'attendance';
  defaultReport?: string;
  rowsPerPage?: number;
  expectedHoursPerDay?: number;
  showDepartmentFilter?: boolean;
  showBranchFilter?: boolean;
  showShiftFilter?: boolean;
  allowCsvExport?: boolean;
  csvIncludeGeofence?: boolean;
  defaultMonthOffset?: 0 | -1;
}

export interface ProbationSettings {
  enabled: boolean;
  defaultDurationMonths: number;
  restrictLeaveDuringProbation?: boolean;
  autoConfirmAfterPeriod?: boolean;
}

export interface WorkShift {
  id: string;
  name: string;
  startTime: string; // e.g. "09:00 AM" or "08:30"
  endTime: string;   // e.g. "06:00 PM" or "15:30"
  gracePeriodMinutes?: number;
  halfDayThresholdHours?: number;
  workingDays?: string[];
  applicableTo?: string[]; // Departments, Grades, or Roles
  isRosterShift?: boolean;
  rosterCode?: string;
  rosterColor?: string;
  isHourlyShift?: boolean;
  hourlyRate?: number;
  hourlyTrackingThresholdHours?: number; // default standard 8 hours / day
}

export interface Student {
  id: string;
  studentId: string;
  name: string;
  email: string;
  rollNumber: string;
  grade: string;
  section?: string;
  batchId?: string;
  avatar: string;
  phone?: string;
  guardianName?: string;
  guardianPhone?: string;
  status: 'Active' | 'On Leave' | 'Suspended';
  password?: string;
  hasResetPassword?: boolean;
  isActivated?: boolean;
  shiftTiming?: {
    startTime: string;
    endTime: string;
    shiftName?: string;
    graceMinutes?: number;
  };
}

export interface ClientTenant {
  id: string;
  slug: string;
  name: string;
  domain?: string;
  industry: string;
  schemaName: string;
  plan: 'starter' | 'professional' | 'enterprise';
  maxSeats: number;
  activeUsersCount: number;
  adminName: string;
  adminEmail: string;
  status: 'active' | 'trial' | 'suspended';
  createdAt: string;
  lastActivityAt: string;
  dbSizeBytes: number;
  totalPunchesRecorded: number;
}

export interface SchemaInspectorItem {
  schemaName: string;
  tenantSlug: string;
  tenantName: string;
  migrationVersion: string;
  tablesCount: number;
  totalRows: number;
  sizeMB: number;
  status: 'healthy' | 'migration_pending' | 'syncing';
  lastModified: string;
}

export interface MasterAuditLogItem {
  id: string;
  timestamp: string;
  operator: string;
  action: string;
  targetTenant?: string;
  targetEntity: string;
  details: string;
  status: 'success' | 'warning' | 'failed';
}

export interface Holiday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  year: number; // 2025, 2026, 2027
  dayOfWeek: string;
  isApproved?: boolean;
}

export interface HolidayTemplate {
  id: string;
  name: string;
  holidaysByYear: Record<number, { name: string; date: string; dayOfWeek: string }[]>;
}

export interface TimetableSlot {
  id: string;
  batchId: string;
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  type: 'class' | 'break' | 'assembly' | 'lab';
  title: string;
  subjectCode?: string;
  facultyId?: string;
  facultyName?: string;
  room?: string;
  startTime: string; // e.g. "08:30" or "09:00"
  endTime: string;   // e.g. "09:15" or "10:00"
  color?: string;    // 'blue' | 'indigo' | 'emerald' | 'purple' | 'amber' | 'cyan' | 'rose' | 'slate'
  isRecurringDaily?: boolean;
  syncGroupId?: string;
}

