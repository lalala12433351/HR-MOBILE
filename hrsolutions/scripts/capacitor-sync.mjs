import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const platform = args.find(value => value === 'android' || value === 'ios') || (process.platform === 'darwin' ? 'ios' : 'android');
const command = args.includes('--copy') ? 'copy' : 'sync';
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || (process.env.CI ? '' : platform === 'ios' ? 'http://localhost:3010' : 'http://10.0.2.2:3010');
if (!serverUrl) {
  console.error('Set CAPACITOR_SERVER_URL to the deployment of this repository’s mobile UI. CI no longer defaults to app.pixbe.in.');
  process.exit(1);
}
console.log(`Capacitor ${platform}: loading ${serverUrl}`);
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/@capacitor/cli/bin/capacitor', import.meta.url)), command, platform], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
  env: { ...process.env, CAPACITOR_SERVER_URL: serverUrl },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
