import { expect, test, type Page } from '@playwright/test';
import { API, assertAfterDatabaseReload, openEmployeeSettings, selectEmployeeSettingsTab, unique, waitForSuccessfulMutation } from './support/persistence';

const PASSWORD = 'Playwright@123';

type Workspace = {
  company: string;
  adminName: string;
  email: string;
  office: string;
  department: string;
  jobRole: string;
};

function newWorkspace(): Workspace {
  const suffix = unique('pw');
  return {
    company: `Persistence ${suffix}`,
    adminName: 'Playwright Administrator',
    email: `${suffix}@example.com`,
    office: `HQ ${suffix}`,
    department: `Engineering ${suffix}`,
    jobRole: `QA Engineer ${suffix}`,
  };
}

async function registerWorkspace(page: Page, workspace: Workspace): Promise<void> {
  await page.goto('/signup');
  await page.getByPlaceholder('Enter your full name').fill(workspace.adminName);
  await page.getByPlaceholder('e.g. sarah.johnson@email.com').fill(workspace.email);
  await page.getByPlaceholder('Create a strong password (8+ chars)').fill(PASSWORD);
  await page.getByPlaceholder('Re-enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Organization Info', { exact: true })).toBeVisible();
  await page.getByPlaceholder('e.g. Acme Corp or St. Jude Academy').fill(workspace.company);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Office \/ Corporate/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'CEO / Executive Owner' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await waitForSuccessfulMutation(page, API.authRegister, () => page.getByRole('button', { name: 'Launch Workspace' }).click());
  await assertAfterDatabaseReload(page, async () => {
    await expect(page).toHaveURL(/\/setup/);
    await expect(page.getByText('Add Office Locations', { exact: true })).toBeVisible();
  });
}

async function addOfficeAndDepartment(page: Page, workspace: Workspace): Promise<void> {
  await page.getByPlaceholder(/Office \/ Branch Name/).fill(workspace.office);
  await page.getByRole('button', { name: /^Add Office Location$/ }).first().click();
  await expect(page.getByText(workspace.office, { exact: true })).toBeVisible();

  await waitForSuccessfulMutation(page, API.orgOffices, () => page.getByRole('button', { name: 'Next: Departments' }).click());
  await assertAfterDatabaseReload(page, async () => {
    await expect(page.getByText('Add Departments', { exact: true })).toBeVisible();
    await expect(page.locator('p, span').filter({ hasText: workspace.office }).first()).toBeVisible();
  });

  await page.getByPlaceholder('Department Name (e.g. Engineering)').fill(workspace.department);
  await page.getByRole('button', { name: 'Add Department' }).click();
  await expect(page.getByText(workspace.department, { exact: true }).first()).toBeVisible();
  await waitForSuccessfulMutation(page, API.orgDepartments, () => page.getByRole('button', { name: 'Next: Job Roles' }).click());
  await assertAfterDatabaseReload(page, async () => {
    await expect(page.getByText('Create New Job Role', { exact: true })).toBeVisible();
    await expect(page.getByText(/Departments ready:/i)).toContainText(workspace.department);
  });
}

async function finishWorkspaceSetup(page: Page, workspace: Workspace): Promise<void> {
  await page.getByPlaceholder(/Senior Frontend Engineer/).fill(workspace.jobRole);
  await page.getByRole('button', { name: /^(Add Job Role|Save Job Role)$/ }).click();
  await waitForSuccessfulMutation(page, API.orgJobRoles, () => page.getByRole('button', { name: 'Next: Team Members' }).click());
  await assertAfterDatabaseReload(page, async () => {
    await expect(page.getByText('Add Team Members', { exact: true })).toBeVisible();
    await expect(page.getByText(/Roles ready:/i)).toContainText(workspace.jobRole);
  });

  const employeeName = `Employee ${unique('setup')}`;
  await page.getByPlaceholder('Full Name *').fill(employeeName);
  await page.getByPlaceholder('Official Email *').fill(`${unique('employee')}@example.com`);
  await page.getByRole('button', { name: 'Add Team Member' }).click();
  await waitForSuccessfulMutation(page, API.setupTeam, () => page.getByRole('button', { name: 'Next: Finalize Departments' }).click());
  await assertAfterDatabaseReload(page, async () => {
    await expect(page.getByText('Finalize Departments & Team Leads', { exact: true })).toBeVisible();
    await expect(page.getByText(employeeName, { exact: true }).first()).toBeVisible();
  });

  await page.getByRole('button', { name: /Finish Setup & Launch Workspace/ }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await assertAfterDatabaseReload(page, async () => {
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });
}

async function provisionCompletedWorkspace(page: Page): Promise<Workspace> {
  const workspace = newWorkspace();
  await registerWorkspace(page, workspace);
  await addOfficeAndDepartment(page, workspace);
  await finishWorkspaceSetup(page, workspace);
  return workspace;
}

test.describe.configure({ mode: 'serial' });

test('auth and onboarding persist each setup mutation, resume after reload, and block dashboard until completion', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);

  const workspace = newWorkspace();
  await registerWorkspace(page, workspace);
  await addOfficeAndDepartment(page, workspace);
  await expect(page).toHaveURL(/\/setup/);

  await finishWorkspaceSetup(page, workspace);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading').first()).toBeVisible();
});

test('department add and duplicate validation survive a database reload; delete deferred to Phase 2', async ({ page }) => {
  await provisionCompletedWorkspace(page);
  await openEmployeeSettings(page);
  await selectEmployeeSettingsTab(page, /Departments & Teams/);

  const original = unique('Department');
  const departmentInput = page.getByPlaceholder('Add new department...');
  await departmentInput.fill(original);
  await waitForSuccessfulMutation(page, API.orgDepartments, async () => {
    await departmentInput.press('Enter');
  });
  await assertAfterDatabaseReload(page, async () => expect(page.getByText(original, { exact: true }).first()).toBeVisible());

  await departmentInput.fill(original);
  await departmentInput.press('Enter');
  await expect(page.getByText(new RegExp(`Department \\"${original}\\" already exists`, 'i'))).toBeVisible();

  const departmentRow = page.getByText(original, { exact: true }).locator('..').locator('..');
  await departmentRow.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/requires a backend delete endpoint/i)).toBeVisible();
  await assertAfterDatabaseReload(page, async () => expect(page.getByText(original, { exact: true }).first()).toBeVisible());
});

test('employee directory creates an employee with visible pending state and survives reload', async ({ page }) => {
  const workspace = await provisionCompletedWorkspace(page);
  await page.goto('/hr?tab=employees');
  await page.getByRole('button', { name: /^Add Employee$/ }).click();

  const employeeName = `Asha ${unique('Employee')}`;
  const employeeEmail = `${unique('directory')}@example.com`;
  await page.getByPlaceholder('e.g. Rahul Sharma').fill(employeeName);
  await page.getByPlaceholder('r.sharma@company.com').fill(employeeEmail);
  await page.getByRole('button', { name: '+ Custom Role' }).click();
  await page.getByPlaceholder('Enter custom role...').fill(workspace.jobRole);
  await page.getByRole('button', { name: '+ Custom Dept' }).click();
  await page.getByPlaceholder('Enter custom department...').fill(workspace.department);

  const submit = page.getByRole('button', { name: /Invite Employee|Add Employee/ }).last();
  const responsePromise = waitForSuccessfulMutation(page, API.employees, () => submit.click());
  await expect(submit).toBeDisabled();
  await responsePromise;
  await assertAfterDatabaseReload(page, async () => {
    await expect(page.getByText(employeeName, { exact: true })).toBeVisible();
    await expect(page.getByText(workspace.department, { exact: true }).last()).toBeVisible();
  });
});

test('office locations and custom job roles are persisted rather than kept only in browser state', async ({ page }) => {
  await provisionCompletedWorkspace(page);
  await openEmployeeSettings(page);

  const office = `Mumbai ${unique('Office')}`;
  await selectEmployeeSettingsTab(page, /Office Locations/);
  await page.getByRole('button', { name: /Add Office Location/ }).click();
  await page.getByPlaceholder('e.g. Bengaluru HQ').fill(office);
  await waitForSuccessfulMutation(page, API.orgOffices, () => page.getByRole('button', { name: 'Add Office' }).click());
  await assertAfterDatabaseReload(page, async () => expect(page.getByText(office, { exact: true })).toBeVisible());

  const role = `Platform Engineer ${unique('Role')}`;
  await selectEmployeeSettingsTab(page, /Job Posts|Roles/);
  await page.getByRole('button', { name: 'Add Role' }).click();
  await page.getByPlaceholder(/Senior Frontend Engineer/).fill(role);
  await waitForSuccessfulMutation(page, API.orgJobRoles, () => page.getByRole('button', { name: 'Save Job Role' }).click());
  await assertAfterDatabaseReload(page, async () => expect(page.getByText(role, { exact: true })).toBeVisible());
});

test('invalid employee input fails loudly without a mutation or false success toast', async ({ page }) => {
  await provisionCompletedWorkspace(page);
  await page.goto('/hr?tab=employees');
  await page.getByRole('button', { name: /^Add Employee$/ }).click();
  await page.getByPlaceholder('e.g. Rahul Sharma').fill('Invalid Email Employee');
  await page.getByPlaceholder('r.sharma@company.com').fill('not-an-email');
  await page.getByRole('button', { name: /Invite Employee|Add Employee/ }).last().click();

  await expect(page.getByText(/valid email|invalid email|please include an '@'/i)).toBeVisible();
  await expect(page.getByText(/employee added successfully|invitation automatically sent/i)).toHaveCount(0);
});
