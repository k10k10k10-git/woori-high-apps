import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const output = dirname(fileURLToPath(import.meta.url));
const repository = resolve(output, '../..');
const app = join(repository, 'attendance-app');
const source = join(app, 'src');
const temporary = join(repository, 'tmp/attendance-admin-qa-20260906');
const { createServer } = await import(pathToFileURL(join(app, 'node_modules/vite/dist/node/index.js')));
await mkdir(temporary, { recursive: true });
await writeFile(join(temporary, 'package.json'), '{"private":true,"type":"module"}\n');
await writeFile(join(temporary, 'index.html'), `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ws://127.0.0.1:4178; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; form-action 'none'; object-src 'none'; base-uri 'self'"><title>출석부 관리자 · 합성 데이터 QA</title></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>`);
for (const file of ['fixture.tsx', 'mocks.tsx']) await writeFile(join(temporary, file), await readFile(join(output, file)));

const boundaries = new Set(['lib/db', 'lib/firebase/client']);
const intercepted = new Set();
const rejected = [];
const server = await createServer({
  root: temporary,
  configFile: false,
  envDir: false,
  cacheDir: join(temporary, '.vite'),
  publicDir: false,
  plugins: [{
    name: 'qa-deny-production-services', enforce: 'pre',
    resolveId(id, importer) {
      const absolute = id.startsWith('@/') ? join(source, id.slice(2)) : id.startsWith('.') && importer ? resolve(dirname(importer), id) : id.replace(/^\/@fs/, '');
      const relative = absolute.replace(`${source}/`, '').replace(/\.(?:tsx?|jsx?)$/, '');
      if (boundaries.has(relative)) { intercepted.add(relative); return join(temporary, 'mocks.tsx'); }
      if (/^(?:@firebase\/|firebase(?:\/|$))/.test(id) || /\/node_modules\/(?:@firebase|firebase)\//.test(id) || /\/src\/lib\/firebase\//.test(absolute) || /(?:GoogleAuth|LoginScreen|AppShell)(?:\.|$)/.test(absolute)) {
        rejected.push(id);
        throw new Error(`합성 QA가 운영 인증/SDK import를 차단했습니다: ${id}`);
      }
      if (id === 'next/link' || id === 'next/navigation') { intercepted.add(id); return join(temporary, 'mocks.tsx'); }
      if (id === 'next/dynamic') { intercepted.add(id); return '\0qa-next-dynamic'; }
      if (id.startsWith('@/')) return this.resolve(absolute, importer, { skipSelf: true });
      return null;
    },
    load(id) {
      if (id === '\0qa-next-dynamic') return `export { dynamic as default } from ${JSON.stringify(join(temporary, 'mocks.tsx'))};`;
    },
    configureServer(instance) {
      instance.middlewares.use('/__qa__/proof.json', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.setHeader('cache-control', 'no-store');
        res.end(JSON.stringify({
          source: '실제 attendance 컴포넌트 + 실제 AppProvider/구독/권한 함수 + 합성 DB/탐색',
          envLoaded: false, host: '127.0.0.1', port: 4178,
          intercepted: [...intercepted], rejected,
          firebaseRuntimeModules: [...instance.moduleGraph.idToModuleMap.keys()].filter(id => /node_modules\/(?:@firebase|firebase)\//.test(id)),
        }, null, 2));
      });
    },
  }],
  resolve: { alias: [
    { find: /^react-dom(?=\/|$)/, replacement: join(app, 'node_modules/react-dom') },
    { find: /^react(?=\/|$)/, replacement: join(app, 'node_modules/react') },
    { find: /^chart.js(?=\/|$)/, replacement: join(app, 'node_modules/chart.js') },
  ] },
  css: { postcss: { plugins: [] } },
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime'] },
  server: { host: '127.0.0.1', port: 4178, strictPort: true, fs: { allow: [app, temporary], deny: ['.env', '.env.*', '**/.auth/**', '**/.vercel/**', '**/.git/**'] } },
});
await server.listen();
console.log('출석부 관리자 합성 QA: http://127.0.0.1:4178/dashboard?role=admin&state=populated');
console.log('SDK 차단 증거: http://127.0.0.1:4178/__qa__/proof.json');
