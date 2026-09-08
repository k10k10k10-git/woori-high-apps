import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), 'woori-attendance-contracts-'));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
try {
  await writeFile(join(temporary, 'rules.json'), await readFile(join(root, 'attendance-app/database.rules.json')));
  await writeFile(join(temporary, 'firebase.json'), JSON.stringify({ database: { rules: 'rules.json' }, emulators: { database: { host: '127.0.0.1', port: 19017 }, ui: { enabled: false } } }));
  const result = spawnSync('firebase', ['emulators:exec', '--only', 'database', '--project', 'demo-attendance-recovery', '--config', join(temporary, 'firebase.json'),
    `${quote(process.execPath)} ${quote(join(root, 'attendance-app/node_modules/vitest/vitest.mjs'))} run --root ${quote(join(root, 'attendance-app'))} __tests__/rosterRecovery.integration.test.ts`],
  { cwd: temporary, env: { ...process.env, ATTENDANCE_CONTRACTS: '1' }, stdio: 'inherit', shell: false });
  process.exitCode = result.status ?? 1;
} finally { await rm(temporary, { recursive: true, force: true }); }
