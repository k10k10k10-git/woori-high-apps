import { createServer } from '../node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const source = fileURLToPath(new URL('../src', import.meta.url));
const server = await createServer({
  configFile: false, envDir: false, root: here,
  esbuild: { jsx: 'automatic' },
  // 이관 뒤 앱의 데이터·로그인 입구(Supabase 기반, Firebase 와 같은 이름)를 에뮬레이터용 시험 모듈로 바꾼다.
  // 정확히 그 이름만 잡는다(`@/lib/rtdb/…` 하위 모듈은 건드리지 않는다). 이름 누락은 aliasParity.ts 를 tsc 가 잡는다.
  resolve: { alias: [
    { find: '@/lib/firebase/client', replacement: `${here}firebase.ts` },
    { find: /^@\/lib\/rtdb$/, replacement: `${here}rtdb.ts` },
    { find: /^@\/lib\/rtdbRest$/, replacement: `${here}rtdbRest.ts` },
    { find: /^@\/lib\/supabaseAuth$/, replacement: `${here}supabaseAuth.ts` },
    { find: 'next/navigation', replacement: `${here}navigation.tsx` },
    { find: 'next/link', replacement: `${here}navigation.tsx` },
    { find: '@', replacement: source },
  ] },
  define: { 'process.env': JSON.stringify({ NODE_ENV: 'development', NEXT_PUBLIC_DEMO_MODE: '0' }) },
  server: { host: '127.0.0.1', port: 3199, strictPort: true },
});
await server.listen();
console.log('합성 출석부 http://127.0.0.1:3199/attendance');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
