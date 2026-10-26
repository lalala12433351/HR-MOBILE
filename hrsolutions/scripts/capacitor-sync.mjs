import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const platform = args.find(value => value === 'android' || value === 'ios') || (process.platform === 'darwin' ? 'ios' : 'android');
const command = args.includes('--copy') ? 'copy' : 'sync';
const root = fileURLToPath(new URL('../', import.meta.url));
const liveUrl = process.env.CAPACITOR_SERVER_URL?.trim();
if (!liveUrl && !fs.existsSync(new URL('../out/index.html', import.meta.url))) {
  console.error('Build the bundled UI first: npm run build:mobile');
  process.exit(1);
}
console.log(`Capacitor ${platform}: ${liveUrl ? 'live reload from ' + liveUrl : 'bundled UI from out/'}`);
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/@capacitor/cli/bin/capacitor', import.meta.url)), command, platform], {
  cwd: root, stdio: 'inherit', env: process.env,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
