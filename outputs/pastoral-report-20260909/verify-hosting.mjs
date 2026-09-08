import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../../attendance-app/out/', import.meta.url));
const pages = new Map([['/', 'index.html'], ['/pastoral', 'pastoral.html'], ['/sw.js', 'sw.js']]);
for (const file of ['index.html', 'pastoral.html']) {
  const html = await readFile(out + file, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css))(?:\?[^" ]*)?"/g)) pages.set(match[1], match[1].slice(1));
}
const sha = value => createHash('sha256').update(value).digest('hex');
const results = await Promise.all([...pages].map(async ([path, file]) => {
  const response = await fetch(`https://woori-high.web.app${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
  const hash = sha(Buffer.from(await response.arrayBuffer()));
  if (hash !== sha(await readFile(out + file))) throw new Error(`산출물 불일치: ${path}`);
  return { path, sha256: hash };
}));
console.log(JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), verifiedAt: new Date().toISOString(), matches: results.length, results }, null, 2));
