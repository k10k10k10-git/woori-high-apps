import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), 'woori-attendance-browser-'));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
try {
  await writeFile(join(temporary, 'rules.json'), await readFile(join(root, 'attendance-app/database.rules.json')));
  await writeFile(join(temporary, 'firebase.json'), JSON.stringify({ database: { rules: 'rules.json' }, emulators: {
    database: { host: '127.0.0.1', port: 19017 }, auth: { host: '127.0.0.1', port: 19099 }, ui: { enabled: false },
  } }));
  const result = spawnSync('firebase', ['emulators:exec', '--only', 'auth,database', '--project', 'demo-attendance-recovery', '--config', join(temporary, 'firebase.json'),
    `${quote(process.execPath)} ${quote(join(root, 'highschool-app/node_modules/@playwright/test/cli.js'))} test --config ${quote(join(root, 'attendance-app/e2e/playwright.config.mjs'))}`],
    { cwd: temporary, env: { ...process.env, ATTENDANCE_BROWSER_CONTRACTS: '1' }, stdio: 'inherit', shell: false });
  process.exitCode = result.status ?? 1;
} finally { await rm(temporary, { recursive: true, force: true }); }
