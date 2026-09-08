import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
const root = fileURLToPath(new URL('../out/', import.meta.url));
const forbidden = ['demo-attendance-recovery', 'synthetic-password-123', 'synthetic-key', '127.0.0.1:19017', '127.0.0.1:19099'];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await inspect(path); continue; }
    if (!/\.(?:js|html|json|txt)$/.test(entry.name)) continue;
    const content = await readFile(path, 'utf8');
    if (forbidden.some(value => content.includes(value))) throw new Error(`운영 빌드에 합성 테스트 설정이 포함됐습니다: ${relative(root, path)}`);
  }
}
await inspect(root);
console.log('운영 산출물에 합성 인증·에뮬레이터 설정 없음');
