import { expect, type Page, type Response } from '@playwright/test';

export const API = {
  authRegister: /\/api\/v1\/auth\/register(?:\?.*)?$/,
  setupOffice: /\/api\/v1\/setup\/office(?:\?.*)?$/,
  setupDepartments: /\/api\/v1\/setup\/departments(?:\?.*)?$/,
  setupRoles: /\/api\/v1\/setup\/roles(?:\?.*)?$/,
  setupTeam: /\/api\/v1\/setup\/team(?:\?.*)?$/,
  orgOffices: /\/api\/v1\/org\/offices(?:\?.*)?$/,
  orgDepartments: /\/api\/v1\/org\/departments(?:\?.*)?$/,
  orgJobRoles: /\/api\/v1\/org\/job-roles(?:\?.*)?$/,
  employees: /\/api\/v1\/identity\/employees(?:\?.*)?$/,
} as const;

export function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function waitForSuccessfulMutation(
  page: Page,
  endpoint: RegExp,
  action: () => Promise<void>,
): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) => {
      const method = response.request().method();
      return endpoint.test(response.url()) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    },
    { timeout: 60_000 },
  );

  await action();
  const response = await responsePromise;
  expect(response.status(), `${response.request().method()} ${response.url()} must persist successfully`).toBeGreaterThanOrEqual(200);
  expect(response.status(), `${response.request().method()} ${response.url()} must persist successfully`).toBeLessThan(300);
  return response;
}

/**
 * A hard reload alone can still mask a localStorage-only write. Remove the
 * app-state cache first, leaving auth cookies intact, then reload and assert
 * against freshly fetched UI data.
 */
export async function assertAfterDatabaseReload(page: Page, assertion: () => Promise<void>): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('PIXBE_BOS_STATE_V1'));
  await page.reload({ waitUntil: 'networkidle' });
  await assertion();
}

export async function openEmployeeSettings(page: Page): Promise<void> {
  await page.goto('/hr?tab=employee_settings');
  await expect(page.getByText('Employee Settings', { exact: true })).toBeVisible();
}

export async function selectEmployeeSettingsTab(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('button', { name }).click();
}
