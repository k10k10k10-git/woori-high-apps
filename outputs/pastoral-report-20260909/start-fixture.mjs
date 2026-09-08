import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
const app = resolve(root, '../../attendance-app');
const require = createRequire(join(app, 'package.json'));
const { createServer } = await import(require.resolve('vite'));
const server = await createServer({
  root, configFile: false, envDir: false, publicDir: false,
  define: { 'process.env.NEXT_PUBLIC_DEMO_MODE': '"0"', 'process.env.NEXT_PUBLIC_DEMO_EMAIL': '""', 'process.env.NEXT_PUBLIC_DEMO_PASSWORD': '""' },
  plugins: [{ name: '운영-SDK-차단', enforce: 'pre', resolveId(id, importer) {
    const absolute = id.startsWith('@/') ? join(app, 'src', id.slice(2)) : id.startsWith('.') && importer ? resolve(dirname(importer), id) : id;
    if (absolute === join(app, 'src/lib/db') || absolute === join(app, 'src/lib/firebase/client') || id === 'next/navigation' || id === 'next/link') return join(root, 'mocks.tsx');
    if (/^(firebase|@firebase)(\/|$)/.test(id)) throw new Error('운영 SDK 차단');
    if (id.startsWith('@/')) return this.resolve(absolute, importer, { skipSelf: true });
  } }],
  resolve: { alias: [{ find: /^react-dom(?=\/|$)/, replacement: join(app, 'node_modules/react-dom') }, { find: /^react(?=\/|$)/, replacement: join(app, 'node_modules/react') }] },
  css: { postcss: { plugins: [] } }, esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 4189, strictPort: true, fs: { allow: [root, app], deny: ['**/.env*', '**/.auth/**', '**/.git/**'] } },
});
await server.listen();
console.log('합성 자료 QA · 운영 SDK/환경값 차단: http://127.0.0.1:4189');
