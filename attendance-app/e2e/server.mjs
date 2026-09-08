import { createServer } from '../node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const source = fileURLToPath(new URL('../src', import.meta.url));
const server = await createServer({
  configFile: false, envDir: false, root: here,
  esbuild: { jsx: 'automatic' },
  resolve: { alias: [
    { find: '@/lib/firebase/client', replacement: `${here}firebase.ts` },
    { find: 'next/navigation', replacement: `${here}navigation.tsx` },
    { find: 'next/link', replacement: `${here}navigation.tsx` },
    { find: '@', replacement: source },
  ] },
  define: { 'process.env': JSON.stringify({ NODE_ENV: 'development', NEXT_PUBLIC_DEMO_MODE: '0', NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'http://127.0.0.1:19017?ns=demo-attendance-recovery-default-rtdb' }) },
  server: { host: '127.0.0.1', port: 3199, strictPort: true },
});
await server.listen();
console.log('합성 출석부 http://127.0.0.1:3199/attendance');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
