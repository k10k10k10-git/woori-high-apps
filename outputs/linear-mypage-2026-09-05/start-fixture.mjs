import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const output = dirname(fileURLToPath(import.meta.url));
const repository = resolve(output, '../..');
const app = join(repository, 'highschool-app');
const source = join(app, 'src');
const temporary = join(repository, 'tmp/mypage-qa-20260905');
const { createServer, build } = await import(pathToFileURL(join(app, 'node_modules/vite/dist/node/index.js')));
const { default: tailwind } = await import(pathToFileURL(join(app, 'node_modules/@tailwindcss/postcss/dist/index.mjs')));
await mkdir(temporary, { recursive: true });
await writeFile(join(temporary, 'package.json'), '{"private":true,"type":"module"}\n');
await writeFile(join(temporary, 'index.html'), `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ws://127.0.0.1:4178; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:"><title>마이페이지 · 합성 데이터 QA</title></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>`);
await writeFile(join(temporary, 'fixture.tsx'), await readFile(join(output, 'fixture.tsx')));
await writeFile(join(temporary, 'mocks.tsx'), await readFile(join(output, 'mocks.tsx')));

const boundaries = new Set([
  'context/AuthContext', 'context/UIContext', 'lib/db', 'features/iguard/lib/db',
  'features/semester/db', 'features/sundayMinistry/db', 'features/suggestions/db',
]);
const intercepted = new Set();
const rejected = [];
const config = {
  root: temporary,
  configFile: false,
  envDir: false,
  cacheDir: join(temporary, '.vite'),
  plugins: [{
    name: 'qa-deny-production-services', enforce: 'pre',
    resolveId(id, importer) {
      if (/^(?:@firebase\/|firebase(?:\/|$))/.test(id) || /\/src\/lib\/firebase(?:\.|$)/.test(id)) {
        rejected.push(id);
        throw new Error(`QA가 운영 SDK import를 차단했습니다: ${id}`);
      }
      const absolute = id.startsWith('@/') ? join(source, id.slice(2)) : id.startsWith('.') && importer ? resolve(dirname(importer), id) : id;
      const relative = absolute.replace(`${source}/`, '').replace(/\.(?:tsx?|jsx?)$/, '');
      if (boundaries.has(relative)) { intercepted.add(relative); return join(temporary, 'mocks.tsx'); }
      if (id === 'next/link') return join(temporary, 'mocks.tsx');
      if (id.startsWith('@/')) return this.resolve(absolute, importer, { skipSelf: true });
      return null;
    },
    configureServer(server) {
      server.middlewares.use('/__qa__/proof.json', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ source: 'production components, synthetic service boundaries', boundaries: [...intercepted], rejected, firebaseRuntimeModules: [...server.moduleGraph.idToModuleMap.keys()].filter(id => /node_modules\/(?:@firebase|firebase)\//.test(id)) }, null, 2));
      });
    },
  }],
  resolve: { alias: [
    { find: /^react-dom(?=\/|$)/, replacement: join(app, 'node_modules/react-dom') },
    { find: /^react(?=\/|$)/, replacement: join(app, 'node_modules/react') },
    { find: '@phosphor-icons/react', replacement: join(app, 'node_modules/@phosphor-icons/react/dist/index.es.js') },
  ] },
  css: { postcss: { plugins: [tailwind({ base: app })] } },
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime'] },
  server: { host: '127.0.0.1', port: 4178, strictPort: true, fs: { allow: [app, temporary] } },
  build: { outDir: join(temporary, 'dist'), emptyOutDir: true },
};
if (process.argv.includes('--build')) {
  await build(config);
  console.log(JSON.stringify({ boundaries: [...intercepted], rejected }));
} else {
  const server = await createServer(config);
  await server.listen();
  console.log('마이페이지 합성 QA: http://127.0.0.1:4178/?role=admin&state=populated');
}
