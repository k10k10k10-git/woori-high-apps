// 실제 production 서버를 운영 DB에 쓰지 않고 확인한다.
// Vercel의 CommonJS 로더처럼 require(ESM)이 없는 환경도 지원해야 한다.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));

const server = spawn(process.execPath, [
  "--no-experimental-require-module",
  fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
  "start", "--hostname", "127.0.0.1", "--port", String(port),
], { cwd: appDirectory, stdio: ["ignore", "pipe", "pipe"] });
let startupError;
let recentOutput = "";
server.on("error", (error) => { startupError = error; });
for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => {
  recentOutput = `${recentOutput}${chunk.toString()}`.slice(-6000);
});
const baseUrl = `http://127.0.0.1:${port}`;

try {
  let ready = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (startupError || server.exitCode !== null) throw startupError ?? new Error("production 서버가 시작되지 않았습니다.");
    try {
      const version = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(1000) });
      if (version.ok && typeof (await version.json()).buildId === "string") { ready = true; break; }
    } catch { /* 서버 준비 전 연결 거절은 짧게 재시도한다. */ }
    await delay(200);
  }
  assert.ok(ready, "production 서버의 버전 조회가 준비되지 않았습니다.");
  for (const path of ["/api/praise", "/api/semester-ids", "/api/finance/2026", "/api/finance/2026/receipts/entry_11111111-1111-4111-8111-111111111111/receipt_22222222-2222-4222-8222-222222222222"]) {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 401, `${path}는 비로그인 GET에 JSON 401을 반환해야 합니다.`);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const body = await response.json();
    assert.equal(body.code, "unauthorized");
  }
  console.log("찬양팀·학기 ID·회계·증빙 production API: require(ESM) 비활성 환경에서 비로그인 401 확인, 인증정보·DB 쓰기 없음.");
} catch (error) {
  console.error(recentOutput);
  throw error;
} finally {
  if (server.exitCode === null) {
    const closed = once(server, "close");
    server.kill("SIGTERM");
    const force = setTimeout(() => server.kill("SIGKILL"), 5000);
    force.unref();
    await closed;
    clearTimeout(force);
  }
}
