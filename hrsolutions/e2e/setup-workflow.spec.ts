import { expect, test } from '@playwright/test';

test('company setup requires a real hybrid location and keeps invitations until launch', async ({ page }) => {
  const requests: Array<{ url: string; body: any }> = [];
  const offices: any[] = [];
  const departments: any[] = [];
  const roles: any[] = [];
  let savedMode: string | undefined;
  await page.context().addCookies([
    { name: 'BOS_AUTH_TOKEN', value: 'setup-ui-test', url: 'http://localhost:3000' },
    { name: 'BOS_TENANT_ID', value: 'setup-ui-test', url: 'http://localhost:3000' },
  ]);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const body = request.method() === 'GET' ? null : request.postDataJSON();
    if (request.method() !== 'GET') requests.push({ url, body });
    if (url.endsWith('/setup/office') && body) offices.push({ id: 'office-1', name: body.name, address: body.address, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone });
    if (url.endsWith('/setup/workplace-mode') && body) savedMode = body.mode;
    if (url.endsWith('/setup/departments') && body) departments.push(...body.departments.map((item: any) => ({ id: 'department-1', name: item.name })));
    if (url.endsWith('/setup/roles') && body) roles.push(...body.roles.map((item: any) => ({ id: 'role-1', title: item.title, department_name: 'Operations', level: item.level })));
    const data = url.endsWith('/auth/me')
      ? { user: { id: 'owner', email: 'owner@example.com', name: 'Workspace Owner', role: 'super_admin', onboardingStatus: 'NOT_STARTED' }, tenant: { name: 'Northstar', slug: 'northstar', industry: 'Office' } }
      : url.endsWith('/setup/settings') ? { general: savedMode ? { workplaceMode: savedMode } : {} }
      : url.endsWith('/org/offices') ? offices
      : url.endsWith('/org/departments') ? departments
      : url.endsWith('/org/job-roles') ? roles
      : url.endsWith('/identity/employees') ? [{ id: 'owner', first_name: 'Workspace', last_name: 'Owner', email: 'owner@example.com', role: 'super_admin' }]
      : request.method() === 'GET' ? []
      : url.endsWith('/setup/office') ? offices[0]
      : url.endsWith('/setup/departments') ? departments
      : url.endsWith('/setup/roles') ? roles
      : { mode: 'hybrid' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.addInitScript(() => {
    const latLng = (lat, lng) => ({
      lat: () => lat,
      lng: () => lng,
    });
    class FakeMap {
      _zoom: number;
      constructor(el, opts) {
        this._zoom = opts?.zoom ?? 16;
        el.style.background = '#e8eaed';
      }
      addListener() {
        return { remove() {} };
      }
      panTo() {}
      setCenter() {}
      setZoom(zoom) {
        this._zoom = zoom;
      }
      getZoom() {
        return this._zoom;
      }
      getCenter() {
        return latLng(51.51, -0.134);
      }
    }
    class Marker {
      setPosition() {}
      getPosition() {
        return latLng(51.51, -0.134);
      }
      setMap() {}
      addListener() {
        return { remove() {} };
      }
    }
    class Circle {
      setCenter() {}
      setRadius() {}
      setMap() {}
    }
    class Geocoder {
      geocode(_request, callback) {
        callback(
          [
            {
              formatted_address: '10 King Street, London, United Kingdom',
              geometry: { location: latLng(51.51, -0.134) },
            },
          ],
          'OK',
        );
      }
    }
    (window as any).google = {
      maps: {
        Map: FakeMap,
        Marker,
        Circle,
        Geocoder,
        SymbolPath: { CIRCLE: 0 },
        event: { trigger() {}, clearInstanceListeners() {} },
      },
    };
  });
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Where will your team work?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Workplace/ })).toHaveAttribute('aria-current', 'step');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/setup-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('radio', { name: /Hybrid/ }).click();
  await expect(page.getByRole('button', { name: /Continue to structure/ })).toBeDisabled();
  await expect(page.locator('.custom-office-pin')).toHaveCount(0);

  await page.getByPlaceholder('e.g. Main office').fill('a');
  const address = page.getByPlaceholder('Pick a point or search on the map');
  await expect(address).toHaveAttribute('readonly');
  const mapSearch = page.getByPlaceholder('Search address or landmark...');
  await mapSearch.fill('10 King Street');
  await mapSearch.press('Enter');
  await expect(address).toHaveValue('10 King Street, London, United Kingdom');
  await expect(page.locator('.custom-office-pin')).toHaveCount(1);
  await page.getByRole('button', { name: /Add workplace/ }).click();
  await expect(page.getByRole('alert').first()).toContainText('workplace name of at least two letters');
  await page.getByPlaceholder('e.g. Main office').fill('Main office');
  await page.getByRole('button', { name: /Add workplace/ }).click();
  await expect(page.getByText('Main office', { exact: true }).first()).toBeVisible();
  await page.locator('.pixbe-setup').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: 'test-results/setup-desktop.png', fullPage: true });

  await page.getByRole('button', { name: /Continue to structure/ }).click();
  await expect(page.getByRole('heading', { name: 'Shape your organisation.' })).toBeVisible();
  await page.locator('.pixbe-setup').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: 'test-results/setup-structure.png' });
  expect(requests.find((item) => item.url.endsWith('/setup/office'))?.body).toMatchObject({
    name: 'Main office', address: '10 King Street, London, United Kingdom', latitude: 51.51, longitude: -0.134,
  });
  expect(requests.find((item) => item.url.endsWith('/setup/workplace-mode'))?.body).toEqual({ mode: 'hybrid' });
  await expect(page.getByText('Management', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('CEO / Executive Owner')).toBeVisible();
  await expect(page.getByText('Management · Admin')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Management' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add team' })).toHaveCount(0);
  await expect(page.getByText('Team Lead', { exact: true })).toHaveCount(0);
  await page.getByPlaceholder('Add a department').fill('Operations');
  await page.getByRole('button', { name: 'Add department' }).click();
  await page.getByPlaceholder('e.g. Product Designer').fill('Operations Lead');
  await page.getByRole('combobox').first().selectOption('Operations');
  await page.getByRole('button', { name: 'Add role' }).click();
  await page.getByRole('button', { name: 'Save structure & continue' }).click();
  await expect(page.getByRole('heading', { name: 'How does your team work?' })).toBeVisible();
  await expect(page.getByText('Full-time', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('General Day Shift', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Save hours & continue/ }).click();
  await expect(page.getByRole('heading', { name: 'Invite your first people.' })).toBeVisible();
  await expect(page.getByText('owner@example.com')).toHaveCount(0);
  await page.locator('.pixbe-setup').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: 'test-results/setup-people.png' });
  await page.getByPlaceholder('First name').fill('Asha');
  await page.getByPlaceholder('Last name').fill('Patel');
  await page.getByPlaceholder('Work email').fill('asha@example.com');
  await page.getByRole('button', { name: 'Add person' }).click();
  await page.getByRole('button', { name: 'Review setup' }).click();
  await expect(page.getByRole('heading', { name: 'Review and launch.' })).toBeVisible();
  await expect(page.getByText('No manager').first()).toBeVisible();
  await page.locator('.pixbe-setup').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: 'test-results/setup-review.png' });
  expect(requests.filter((item) => item.url.endsWith('/setup/team'))).toHaveLength(0);
});
