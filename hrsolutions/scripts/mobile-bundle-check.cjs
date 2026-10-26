const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'out');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    var page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    var errors = [], failedAssets = [], apiCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'mobile-bundle.test') {
        if (url.pathname.startsWith('/api/v1/')) {
          apiCalls.push(url.toString());
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { email: 'bundle@example.test', firstName: 'Bundle', tenantName: 'Test workspace', role: 'employee', invitedBy: 'HR', mode: 'self', expiresAt: '2099-01-01' } }) });
        }
        return route.abort(); // No hosted frontend or remote fonts are needed for this test.
      }
      let file = path.resolve(output, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(output + path.sep) && file !== output) return route.abort();
      try {
        if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
        const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/x-component' }[path.extname(file)] || 'application/octet-stream';
        return route.fulfill({ contentType: mime, body: await fs.readFile(file) });
      } catch {
        failedAssets.push(url.pathname);
        return route.fulfill({ status: 404, body: 'Missing bundled asset' });
      }
    });
    await page.goto('http://mobile-bundle.test/login/', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
    const inputs = await page.locator('input').count();
    if (!inputs) throw Error('Bundled login form did not hydrate.');
    await page.goto('http://mobile-bundle.test/reset-password/?token=mobile-test-token', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Choose a new password', exact: true }).waitFor();
    await page.goto('http://mobile-bundle.test/accept-invite/?token=mobile-test-invite', { waitUntil: 'networkidle' });
    if (!apiCalls.some(url => url.includes('mobile-test-invite'))) throw Error('Invitation token was not read on the client.');
    await page.goto('http://mobile-bundle.test/change-email/?email=bundle%40example.test', { waitUntil: 'networkidle' });
    if (!apiCalls.some(url => url.includes('bundle%40example.test') || url.includes('bundle@example.test'))) throw Error('Email query was not read on the client.');
    const configSource = await fs.readFile(path.join(root, 'capacitor.config.ts'), 'utf8');
    if (!configSource.includes("webDir: 'out'")) throw Error('Capacitor does not use the export output.');
    if (errors.length || failedAssets.length) throw Error(JSON.stringify({ errors, failedAssets }));
    console.log('Bundled UI passed: hydrated login, local routes/assets, client query parameters, direct backend requests; no hosted frontend.');
  } catch (error) {
    if (page) { console.error(JSON.stringify({url:page.url(),errors,failedAssets,body:(await page.locator('body').innerText()).slice(0,1200)}));await page.screenshot({path:path.join(root,'test-results','mobile-bundle-failure.png')}); }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
