import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
require('@next/env').loadEnvConfig(root, false);
const stage = path.resolve(root, '.mobile-build');
const output = path.resolve(root, 'out');
// Only remove our own generated directories; never follow a computed outside path.
for (const target of [stage, output]) {
  if (path.dirname(target) !== path.resolve(root) || !['.mobile-build', 'out'].includes(path.basename(target))) {
    throw new Error('Refusing to clean a path outside the mobile build workspace.');
  }
}
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });
const excluded = new Set([
  path.resolve(root, 'src/app/api'),
  path.resolve(root, 'src/app/actions'),
  path.resolve(root, 'src/app/dev'),
  path.resolve(root, 'src/proxy.ts'),
]);
await fs.cp(path.join(root, 'src'), path.join(stage, 'src'), {
  recursive: true,
  filter: source => !excluded.has(path.resolve(source)),
});
for (const file of ['public', 'next.config.mjs', 'postcss.config.mjs', 'tsconfig.json', 'next-env.d.ts', 'package.json', 'package-lock.json', 'firebase-applet-config.json']) {
  try { await fs.cp(path.join(root, file), path.join(stage, file), { recursive: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
// Do not ship the local design-inspector script in native packages.
const layoutPath = path.join(stage, 'src/app/layout.tsx');
let layout = await fs.readFile(layoutPath, 'utf8');
layout = layout.replace(/\{\/\* impeccable-live-start \*\/\}[\s\S]*?\{\/\* impeccable-live-end \*\/\}/g, '');
await fs.writeFile(layoutPath, layout);
await fs.symlink(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.pixbe.in').replace(/\/+$/, '');
const apiUrl = new URL(backend);
if (!['https:', 'http:'].includes(apiUrl.protocol)) throw new Error('NEXT_PUBLIC_BACKEND_URL must be an HTTP(S) backend origin.');
if (process.env.CI && (apiUrl.protocol !== 'https:' || ['localhost','127.0.0.1','10.0.2.2'].includes(apiUrl.hostname))) {
  throw new Error('CI mobile builds require a public HTTPS backend, not a developer localhost URL.');
}
console.log('Building bundled mobile UI. Backend: ' + backend);
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build'], {
  cwd: stage, stdio: 'inherit',
  env: { ...process.env, MOBILE_BUILD: '1', NEXT_PUBLIC_MOBILE_BUILD: '1', NEXT_PUBLIC_BACKEND_URL: backend },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
await fs.access(path.join(stage, 'out', 'index.html'));
await fs.rm(output, { recursive: true, force: true });
await fs.cp(path.join(stage, 'out'), output, { recursive: true });
console.log('Bundled frontend is ready in hrsolutions/out. Run npm run cap:sync:android or cap:sync:ios.');
