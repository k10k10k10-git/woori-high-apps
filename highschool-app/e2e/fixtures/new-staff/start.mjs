// 생산 설정과 분리된 loopback 전용 합성 UI 검증 서버.
import { createServer } from "vite";
import tailwind from "@tailwindcss/postcss";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = dirname(fileURLToPath(import.meta.url));
const app = resolve(root, "../../..");
const source = resolve(app, "src");
const mock = resolve(root, "mocks.tsx");
const dynamicMock = resolve(root, "dynamic.tsx");
// 매 실행마다 테스트가 소유한 빈 캐시를 사용해 최초 dependency scan도 검증한다.
const cacheDir = mkdtempSync(resolve(tmpdir(), "woori-new-staff-qa-"));
const intercepted = new Set();
const rejected = new Set();
const boundaries = new Set([
  "context/AuthContext",
  "features/semester/db",
  "lib/db",
  "features/iguard/lib/db",
  "features/sundayMinistry/db",
  "features/suggestions/db",
  "features/portal/peopleSearchDb",
  "features/activityLog/db",
]);

const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  cacheDir,
  plugins: [{
    name: "new-staff-qa-deny-production-services",
    enforce: "pre",
    resolveId(id, importer) {
      if (/^(?:@firebase\/|firebase(?:\/|$)|firebase-admin(?:\/|$))/.test(id)
        || /\/src\/lib\/(?:firebase|firebaseAdmin)(?:\.|$)/.test(id)) {
        rejected.add(id);
        throw new Error(`합성 QA의 운영 SDK import 차단: ${id} ← ${importer ?? "entry"}`);
      }
      const absolute = id.startsWith("@/") ? resolve(source, id.slice(2))
        : id.startsWith(".") && importer ? resolve(dirname(importer), id) : id;
      const relative = absolute.replace(`${source}/`, "").replace(/\.(?:tsx?|jsx?)$/, "");
      if (boundaries.has(relative)) {
        intercepted.add(relative);
        return mock;
      }
      if (id === "next/link" || id === "next/navigation") return mock;
      if (id === "next/dynamic") return dynamicMock;
      if (id.startsWith("@/")) return this.resolve(absolute, importer, { skipSelf: true });
      return null;
    },
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        const host = request.headers.host?.split(":")[0];
        if (host !== "127.0.0.1") {
          response.statusCode = 403;
          response.end("loopback QA only");
          return;
        }
        response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; connect-src 'self' ws://127.0.0.1:4179; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'self'");
        if (request.url === "/__qa__/proof.json") {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({
            synthetic: true,
            boundaries: [...intercepted],
            rejected: [...rejected],
            firebaseRuntimeModules: [...vite.moduleGraph.idToModuleMap.keys()].filter((id) => /node_modules\/(?:@firebase|firebase|firebase-admin)\//.test(id)),
          }));
          return;
        }
        next();
      });
    },
  }],
  resolve: { alias: [
    { find: /^react-dom(?=\/|$)/, replacement: resolve(app, "node_modules/react-dom") },
    { find: /^react(?=\/|$)/, replacement: resolve(app, "node_modules/react") },
    { find: "@phosphor-icons/react", replacement: resolve(app, "node_modules/@phosphor-icons/react/dist/index.es.js") },
  ] },
  css: { postcss: { plugins: [tailwind({ base: app })] } },
  esbuild: { jsx: "automatic" },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: { host: "127.0.0.1", port: 4179, strictPort: true, fs: { allow: [app] } },
});

await server.listen();
console.log("합성 신규 스탭 QA · 실제 인증/DB 연결 없음 · http://127.0.0.1:4179");
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, async () => {
    await server.close();
    rmSync(cacheDir, { recursive: true, force: true });
    process.exit(0);
  });
}
