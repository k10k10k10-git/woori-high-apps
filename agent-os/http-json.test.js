const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");
const { readJson } = require("./http-json");

async function stubServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}/`;
}

test("JSON 조회는 요청 헤더를 전달하고 UTF-8 응답을 복원한다", async (t) => {
  const url = await stubServer(t, (req, res) => {
    assert.equal(req.headers.authorization, "Bearer local-test");
    res.end(JSON.stringify({ state: "준비됨" }));
  });
  assert.deepEqual(await readJson(url, { headers: { Authorization: "Bearer local-test" } }), { state: "준비됨" });
});

test("상태 오류와 JSON 파싱 오류는 선택 정보 없음으로 반환한다", async (t) => {
  const url = await stubServer(t, (req, res) => {
    if (req.url === "/error") res.writeHead(503);
    res.end(req.url === "/error" ? '{"error":true}' : "invalid json");
  });
  assert.equal(await readJson(`${url}error`), null);
  assert.equal(await readJson(url), null);
});

test("응답 도중 연결이 끊겨도 조회가 종료된다", async (t) => {
  const url = await stubServer(t, (_req, res) => {
    res.writeHead(200);
    res.write('{"partial":');
    setImmediate(() => res.destroy());
  });
  assert.equal(await readJson(url), null);
});

test("응답이 없으면 전체 기한에 연결을 닫는다", { timeout: 2_000 }, async (t) => {
  let closed;
  const connectionClosed = new Promise((resolve) => { closed = resolve; });
  const url = await stubServer(t, (req) => req.on("close", closed));
  assert.equal(await readJson(url, { timeoutMs: 100 }), null);
  await connectionClosed;
});

test("조금씩 도착하는 응답도 전체 기한을 연장하지 않는다", { timeout: 2_000 }, async (t) => {
  let received = 0;
  const url = await stubServer(t, (_req, res) => {
    const interval = setInterval(() => { received += 1; res.write(" "); }, 10);
    res.on("close", () => clearInterval(interval));
  });
  assert.equal(await readJson(url, { timeoutMs: 100 }), null);
  assert.ok(received > 0);
});

test("바이트 제한을 넘는 응답은 연결을 닫고 버린다", { timeout: 2_000 }, async (t) => {
  let closed;
  const connectionClosed = new Promise((resolve) => { closed = resolve; });
  const url = await stubServer(t, (_req, res) => {
    res.on("close", closed);
    // 문자 수가 아닌 실제 UTF-8 바이트 수를 제한한다. 본문은 일부러 끝내지 않는다.
    res.write(JSON.stringify({ text: "가나다라마바사아자차카타파하" }));
  });
  assert.equal(await readJson(url, { maxBytes: 32 }), null);
  await connectionClosed;
});

test("잘못된 URL과 지원하지 않는 프로토콜은 즉시 종료한다", async () => {
  assert.equal(await readJson("invalid"), null);
  assert.equal(await readJson("file:///tmp/agent-os-stub.json"), null);
});
