import { Request, Response } from 'express';
import {
  applyEmployeeScopeFilter,
  canAccessEmployee,
  getAccessScope,
} from '../../utils/employeeScope.js';

export async function setSalaryStructure(req: Request, res: Response): Promise<void> {
  try {
    const {
      employeeId,
      currency = 'INR',
      baseSalary,
      hra = 0,
      specialAllowance = 0,
      conveyanceAllowance = 0,
      medicalAllowance = 0,
      otherAllowances = 0,
      allowances = [],
      providentFundDeduction = 0,
      taxDeduction = 0,
      effectiveFrom,
    } = req.body;

    let validEmpId = employeeId;
    const emp = await req.tenantQuery!('SELECT id FROM employees WHERE id::text = $1 OR employee_code = $1 LIMIT 1', [employeeId]);
    if (emp.rows[0]) validEmpId = emp.rows[0].id;

    const allowancesJson = typeof allowances === 'string' ? allowances : JSON.stringify(allowances || []);

    const numBase = Number(baseSalary) || 0;
    const numHra = Number(hra) || 0;
    const numSpecial = Number(specialAllowance) || 0;
    const numConv = Number(conveyanceAllowance) || 0;
    const numMed = Number(medicalAllowance) || 0;
    const numOther = Number(otherAllowances) || 0;
    const numPf = Number(providentFundDeduction) || 0;
    const numTax = Number(taxDeduction) || 0;

    const result = await req.tenantQuery!(
      `INSERT INTO salary_structures (
        employee_id, currency, base_salary, hra, special_allowance, conveyance_allowance, medical_allowance, other_allowances, allowances, provident_fund_deduction, tax_deduction, effective_from
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (employee_id) DO UPDATE SET
         currency = EXCLUDED.currency,
         base_salary = EXCLUDED.base_salary,
         hra = EXCLUDED.hra,
         special_allowance = EXCLUDED.special_allowance,
         conveyance_allowance = EXCLUDED.conveyance_allowance,
         medical_allowance = EXCLUDED.medical_allowance,
         other_allowances = EXCLUDED.other_allowances,
         allowances = EXCLUDED.allowances,
         provident_fund_deduction = EXCLUDED.provident_fund_deduction,
         tax_deduction = EXCLUDED.tax_deduction,
         effective_from = EXCLUDED.effective_from,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        validEmpId,
        currency,
        numBase,
        numHra,
        numSpecial,
        numConv,
        numMed,
        numOther,
        allowancesJson,
        numPf,
        numTax,
        effectiveFrom || new Date().toISOString().split('T')[0],
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function executePayrollRun(req: Request, res: Response): Promise<void> {
  try {
    const { month, year, executedByEmployeeId } = req.body;
    const parsedMonth = Math.max(1, Math.min(12, parseInt(month, 10) || (new Date().getMonth() + 1)));
    const parsedYear = Math.max(2020, parseInt(year, 10) || new Date().getFullYear());

    let validExecutorId = executedByEmployeeId;
    if (executedByEmployeeId) {
      const emp = await req.tenantQuery!('SELECT id FROM employees WHERE id::text = $1 OR employee_code = $1 LIMIT 1', [executedByEmployeeId]);
      if (emp.rows[0]) validExecutorId = emp.rows[0].id;
    } else {
      const firstAdmin = await req.tenantQuery!('SELECT id FROM employees WHERE role = $1 LIMIT 1', ['super_admin']);
      validExecutorId = firstAdmin.rows[0]?.id;
    }

    // 1. Create or get existing Payroll Run
    const runRes = await req.tenantQuery!(
      `INSERT INTO payroll_runs (month, year, status, executed_by_employee_id)
       VALUES ($1, $2, 'completed', $3)
       ON CONFLICT (month, year) DO UPDATE SET status = 'completed'
       RETURNING *`,
      [parsedMonth, parsedYear, validExecutorId]
    );
    const run = runRes.rows[0];

    // 2. Generate Payslips for all employees with salary structures
    const employeesWithSalary = await req.tenantQuery!(
      `SELECT e.id, e.first_name, e.last_name, s.*
       FROM employees e
       JOIN salary_structures s ON e.id = s.employee_id
       WHERE e.employment_status = 'active'`
    );

    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthYear = `${monthNames[parsedMonth]} ${parsedYear}`;

    for (const emp of employeesWithSalary.rows) {
      const base = Number(emp.base_salary) || 0;
      const hra = Number(emp.hra) || 0;
      const special = Number(emp.special_allowance) || 0;
      const conv = Number(emp.conveyance_allowance) || 0;
      const med = Number(emp.medical_allowance) || 0;
      const other = Number(emp.other_allowances) || 0;

      let customSum = 0;
      let customList: any[] = [];
      try {
        customList = typeof emp.allowances === 'string' ? JSON.parse(emp.allowances) : (emp.allowances || []);
        if (Array.isArray(customList)) {
          for (const item of customList) {
            customSum += Number(item.amount) || 0;
          }
        }
      } catch (_) {}

      const totalAllowances = hra + special + conv + med + other + customSum;
      const pf = Number(emp.provident_fund_deduction) || 0;
      const tax = Number(emp.tax_deduction) || 0;
      const net = base + totalAllowances - pf - tax;

      const allowancesBreakdown = JSON.stringify([
        { name: 'House Rent Allowance (HRA)', amount: hra },
        { name: 'Special Allowance', amount: special },
        ...(conv > 0 ? [{ name: 'Conveyance Allowance', amount: conv }] : []),
        ...(med > 0 ? [{ name: 'Medical Reimbursement', amount: med }] : []),
        ...(other > 0 ? [{ name: 'Other Allowances', amount: other }] : []),
        ...customList.map((c: any) => ({ name: c.name || 'Custom Allowance', amount: Number(c.amount) || 0 })),
      ]);

      await req.tenantQuery!(
        `INSERT INTO payslips (
          payroll_run_id, employee_id, month_year, base_salary, hra, special_allowance, conveyance_allowance, medical_allowance, other_allowances, allowances_breakdown, pf_deduction, tax_deduction, net_payable, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Paid')
         ON CONFLICT (payroll_run_id, employee_id) DO NOTHING`,
        [run.id, emp.id, monthYear, base, hra, special, conv, med, other, allowancesBreakdown, pf, tax, net]
      );
    }

    res.status(201).json({
      success: true,
      message: `Payroll run for ${monthYear} executed. Generated ${employeesWithSalary.rows.length} payslips.`,
      data: run,
    });
  } catch (err: any) {
    console.error('Error executing payroll run:', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getPayslips(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId, payrollRunId } = req.query;
    const scope = await getAccessScope(req);
    let sql = `
      SELECT 
        ps.*,
        e.first_name || ' ' || e.last_name as employee_name,
        e.employee_code,
        d.name as department_name
      FROM payslips ps
      JOIN employees e ON ps.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];
    sql = applyEmployeeScopeFilter(scope, sql, params, 'ps.employee_id');

    if (employeeId) {
      const access = await canAccessEmployee(req, String(employeeId));
      if (!access.ok || !access.target) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have access to payslips for this employee' },
        });
        return;
      }
      params.push(access.target.id);
      sql += ` AND ps.employee_id = $${params.length}`;
    }
    if (payrollRunId) {
      params.push(payrollRunId);
      sql += ` AND ps.payroll_run_id::text = $${params.length}`;
    }
    sql += ` ORDER BY ps.created_at DESC LIMIT 100`;

    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
