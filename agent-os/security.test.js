const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const vm = require("node:vm");
const {
  createAgentOsServer,
  createHealthProof,
  claudeArgsForSkill,
  writeSessionTokenFile,
  readSessionTokenFile,
  removeSessionTokenFile,
  attachSessionTokenFile,
  HOST,
} = require("./server");
const { verifyAgentOsServer } = require("./probe");

let server;
let port;
let sessionToken;
let runAttempts = 0;
let dangerConfirmAttempts = 0;
let allowDangerConfirmation = true;

function request({ method = "GET", path = "/", headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port, method, path, headers }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: responseBody, headers: res.headers }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function runRequest(body, headers = {}) {
  return request({
    method: "POST",
    path: "/api/run",
    headers: {
      Host: `${HOST}:${port}`,
      Origin: `http://${HOST}:${port}`,
      "Content-Type": "application/json",
      "X-Agent-OS-Token": sessionToken,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function dangerApprovalRequest(skillId, headers = {}) {
  return request({
    method: "POST",
    path: "/api/danger-approval",
    headers: {
      Host: `${HOST}:${port}`,
      Origin: `http://${HOST}:${port}`,
      "Content-Type": "application/json",
      "X-Agent-OS-Token": sessionToken,
      ...headers,
    },
    body: JSON.stringify({ skillId }),
  });
}

before(async () => {
  sessionToken = crypto.randomBytes(32).toString("base64url");
  server = createAgentOsServer({
    sessionToken,
    async confirmDangerImpl() {
      dangerConfirmAttempts += 1;
      return allowDangerConfirmation;
    },
    runSkillImpl(_skill, response) {
      runAttempts += 1;
      response.writeHead(204);
      response.end();
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, resolve);
  });
  port = server.address().port;

  const home = await request({ headers: { Host: `${HOST}:${port}` } });
  assert.equal(home.status, 200);
  assert.equal(home.headers["x-frame-options"], "DENY");
  assert.match(home.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(home.headers["content-security-policy"], /script-src 'self'/);
  assert.doesNotMatch(home.headers["content-security-policy"], /script-src[^;]*unsafe-inline/);
  assert.doesNotMatch(home.body, new RegExp(sessionToken));
  assert.doesNotMatch(home.body, /AGENT_OS_SESSION_TOKEN/);
  assert.match(home.body, /<script src="\/app\.js"><\/script>/);
  const scriptTags = [...home.body.matchAll(/<script\b([^>]*)>/gi)];
  assert.ok(scriptTags.length > 0);
  assert.ok(scriptTags.every((match) => /\bsrc=/.test(match[1])));

  const browserScript = await request({ path: "/app.js", headers: { Host: `${HOST}:${port}` } });
  assert.equal(browserScript.status, 200);
  assert.doesNotMatch(browserScript.body, new RegExp(sessionToken));
  assert.doesNotMatch(browserScript.body, /AGENT_OS_SESSION_TOKEN/);
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("서버는 IPv4 loopback에만 바인딩된다", () => {
  assert.equal(server.address().address, HOST);
});

test("허용 목록 밖의 Host는 모든 요청에서 거부한다", async () => {
  const response = await request({ headers: { Host: `attacker.example:${port}` } });
  assert.equal(response.status, 403);
});

test("정적 셸 외 모든 API는 세션 토큰 없이 읽을 수 없다", async () => {
  for (const path of ["/api/report", "/api/skills", "/api/runs", "/api/runs/example", "/api/not-found"]) {
    const response = await request({ path, headers: { Host: `${HOST}:${port}` } });
    assert.equal(response.status, 403, path);
  }
  const authorized = await request({
    path: "/api/skills",
    headers: { Host: `${HOST}:${port}`, "X-Agent-OS-Token": sessionToken },
  });
  assert.equal(authorized.status, 200);
});

test("health endpoint는 토큰 대신 무작위 challenge의 HMAC 증명만 반환한다", async () => {
  const challenge = crypto.randomBytes(32).toString("hex");
  const response = await request({
    path: `/.well-known/agent-os-health?challenge=${challenge}`,
    headers: { Host: `${HOST}:${port}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body, createHealthProof(sessionToken, challenge));
  assert.doesNotMatch(response.body, new RegExp(sessionToken));

  const invalid = await request({
    path: "/.well-known/agent-os-health?challenge=too-short",
    headers: { Host: `${HOST}:${port}` },
  });
  assert.equal(invalid.status, 400);
});

test("실행 API는 Origin과 세션 토큰이 없으면 거부한다", async () => {
  const response = await request({
    method: "POST",
    path: "/api/run",
    headers: { Host: `${HOST}:${port}`, "Content-Type": "application/json" },
    body: JSON.stringify({ skillId: "tests" }),
  });
  assert.equal(response.status, 403);
  assert.equal(runAttempts, 0);
});

test("실행 API는 잘못된 세션 토큰을 거부한다", async () => {
  const response = await runRequest({ skillId: "tests" }, { "X-Agent-OS-Token": "invalid-token" });
  assert.equal(response.status, 403);
  assert.equal(runAttempts, 0);
});

test("다른 Origin은 올바른 세션 토큰이 있어도 거부한다", async () => {
  const response = await runRequest({ skillId: "tests" }, { Origin: `http://evil.example:${port}` });
  assert.equal(response.status, 403);
  assert.equal(runAttempts, 0);
});

test("실행 API는 올바른 토큰이어도 Origin 누락이나 cross-site 요청을 거부한다", async () => {
  const missingOrigin = await request({
    method: "POST",
    path: "/api/run",
    headers: {
      Host: `${HOST}:${port}`,
      "Content-Type": "application/json",
      "X-Agent-OS-Token": sessionToken,
    },
    body: JSON.stringify({ skillId: "tests" }),
  });
  const crossSite = await runRequest({ skillId: "tests" }, { "Sec-Fetch-Site": "cross-site" });
  assert.equal(missingOrigin.status, 403);
  assert.equal(crossSite.status, 403);
  assert.equal(runAttempts, 0);
});

test("인증된 요청이어도 등록되지 않은 스킬은 실행하지 않는다", async () => {
  const response = await runRequest({ skillId: "does-not-exist" });
  assert.equal(response.status, 400);
  assert.match(response.body, /unknown skill/);
  assert.equal(runAttempts, 0);
});

test("위험 스킬은 서버 확인값이 없거나 다르면 실행하지 않는다", async () => {
  const missing = await runRequest({ skillId: "ship-highschool" });
  const mismatched = await runRequest({ skillId: "ship-highschool", dangerConfirmation: "tests" });
  assert.equal(missing.status, 409);
  assert.equal(mismatched.status, 409);
  assert.equal(runAttempts, 0);
});

test("정상 인증 요청은 실제 스킬 대신 주입된 실행 스텁에 정확히 한 번 도달한다", async () => {
  const response = await runRequest({ skillId: "audit-all" });
  assert.equal(response.status, 204);
  assert.equal(runAttempts, 1);
});

test("위험 스킬은 짧게 유효한 일회용 서버 승인을 한 번만 소비한다", async () => {
  const safeApproval = await dangerApprovalRequest("audit-all");
  assert.equal(safeApproval.status, 400);
  assert.equal(dangerConfirmAttempts, 0);

  allowDangerConfirmation = false;
  const cancelled = await dangerApprovalRequest("ship-highschool");
  allowDangerConfirmation = true;
  assert.equal(cancelled.status, 409);
  assert.equal(dangerConfirmAttempts, 1);

  const wrongBindingIssued = await dangerApprovalRequest("ship-highschool");
  const wrongBindingApproval = JSON.parse(wrongBindingIssued.body).approval;
  const wrongSkill = await runRequest({ skillId: "deploy-status", dangerConfirmation: wrongBindingApproval });
  const consumedAfterMismatch = await runRequest({ skillId: "ship-highschool", dangerConfirmation: wrongBindingApproval });
  assert.equal(wrongSkill.status, 409);
  assert.equal(consumedAfterMismatch.status, 409);

  const issued = await dangerApprovalRequest("ship-highschool");
  assert.equal(issued.status, 201);
  const approval = JSON.parse(issued.body).approval;
  assert.match(approval, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(approval, "ship-highschool");

  const accepted = await runRequest({ skillId: "ship-highschool", dangerConfirmation: approval });
  const replayed = await runRequest({ skillId: "ship-highschool", dangerConfirmation: approval });
  assert.equal(accepted.status, 204);
  assert.equal(replayed.status, 409);
  assert.equal(runAttempts, 2);
  assert.equal(dangerConfirmAttempts, 3);
});

test("안전 스킬은 읽기 도구만 받고 위험 플래그는 danger 스킬에만 붙는다", () => {
  const safeArgs = claudeArgsForSkill({ prompt: "읽기", danger: false });
  assert.ok(safeArgs.includes("--safe-mode"));
  assert.ok(safeArgs.includes("plan"));
  assert.ok(safeArgs.includes("Read,Glob,Grep"));
  assert.ok(safeArgs.includes("--disable-slash-commands"));
  assert.ok(safeArgs.includes("--no-session-persistence"));
  assert.equal(safeArgs.includes("--dangerously-skip-permissions"), false);

  const dangerArgs = claudeArgsForSkill({ prompt: "권한 실행", danger: true });
  assert.ok(dangerArgs.includes("--dangerously-skip-permissions"));
  assert.equal(dangerArgs.includes("--safe-mode"), false);

  const skills = JSON.parse(fs.readFileSync(path.join(__dirname, "skills.json"), "utf8")).skills;
  const dangerById = new Map(skills.map((skill) => [skill.id, Boolean(skill.danger)]));
  for (const id of ["deploy-status", "ship-highschool", "tests", "qa-field", "db-audit", "daily-deep"]) {
    assert.equal(dangerById.get(id), true, id);
  }
  for (const id of ["audit-all", "backlog", "refactor-plan"]) {
    assert.equal(dangerById.get(id), false, id);
  }
});

test("런처는 HMAC probe 뒤 AppleScript로 열며 토큰과 고정 로그를 argv에 넣지 않는다", () => {
  const launcher = fs.readFileSync(path.join(__dirname, "AgentOS.command"), "utf8");
  const browserLauncher = fs.readFileSync(path.join(__dirname, "launch-browser.applescript"), "utf8");
  assert.match(launcher, /node probe\.js/);
  assert.match(launcher, /\/usr\/bin\/osascript/);
  assert.ok(launcher.lastIndexOf("node probe.js") < launcher.indexOf("/usr/bin/osascript"));
  assert.doesNotMatch(launcher, /agent_os_token|#token=|\?token=|\/tmp\/agent-os\.log/);
  assert.doesNotMatch(launcher, /\bopen\s+["']/);
  assert.match(browserLauncher, /read \(POSIX file tokenFilePath\)/);
  assert.match(browserLauncher, /open location/);
});

test("probe는 토큰을 전송하지 않고 올바른 HMAC 서버만 인정한다", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), `agent-os-${process.getuid()}-probe-test-`));
  const tokenFile = writeSessionTokenFile(sessionToken, runtimeDir);
  let receivedTokenHeader;
  const fakeServer = http.createServer((req, res) => {
    receivedTokenHeader = req.headers["x-agent-os-token"];
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(crypto.randomBytes(32).toString("base64url"));
  });
  try {
    assert.equal(await verifyAgentOsServer({ host: HOST, port, runtimeDir }), true);
    await new Promise((resolve, reject) => {
      fakeServer.once("error", reject);
      fakeServer.listen(0, HOST, resolve);
    });
    assert.equal(await verifyAgentOsServer({
      host: HOST,
      port: fakeServer.address().port,
      runtimeDir,
    }), false);
    assert.equal(receivedTokenHeader, undefined);
  } finally {
    if (fakeServer.listening) await new Promise((resolve) => fakeServer.close(resolve));
    if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile);
    fs.rmdirSync(runtimeDir);
  }
});

test("런타임 토큰은 소유자 전용 파일에 원자 기록되고 일치할 때만 정리된다", () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), `agent-os-${process.getuid()}-test-`));
  const token = crypto.randomBytes(32).toString("base64url");
  try {
    const tokenFile = writeSessionTokenFile(token, runtimeDir);
    assert.equal(fs.readFileSync(tokenFile, "utf8").trim(), token);
    assert.equal(fs.statSync(runtimeDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(tokenFile).mode & 0o777, 0o600);
    assert.equal(fs.lstatSync(tokenFile).isSymbolicLink(), false);
    assert.deepEqual(fs.readdirSync(runtimeDir), ["session-token"]);
    assert.equal(readSessionTokenFile(runtimeDir), token);
    assert.equal(removeSessionTokenFile(crypto.randomBytes(32).toString("base64url"), runtimeDir), false);
    assert.equal(fs.existsSync(tokenFile), true);
    assert.equal(removeSessionTokenFile(token, runtimeDir), true);
    assert.equal(fs.existsSync(tokenFile), false);
  } finally {
    const tokenFile = path.join(runtimeDir, "session-token");
    if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile);
    fs.rmdirSync(runtimeDir);
  }
});

test("기존 토큰 파일 심볼릭 링크를 따라가지 않고 원자적으로 교체한다", () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `agent-os-${process.getuid()}-file-link-test-`));
  const runtimeDir = path.join(baseDir, "runtime");
  const victimFile = path.join(baseDir, "victim");
  const tokenFile = path.join(runtimeDir, "session-token");
  const token = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(runtimeDir, { mode: 0o700 });
  fs.writeFileSync(victimFile, "보존", { mode: 0o600 });
  fs.symlinkSync(victimFile, tokenFile);
  try {
    writeSessionTokenFile(token, runtimeDir);
    assert.equal(fs.readFileSync(victimFile, "utf8"), "보존");
    assert.equal(fs.lstatSync(tokenFile).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(tokenFile, "utf8").trim(), token);
    assert.equal(removeSessionTokenFile(token, runtimeDir), true);
  } finally {
    if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile);
    if (fs.existsSync(victimFile)) fs.unlinkSync(victimFile);
    fs.rmdirSync(runtimeDir);
    fs.rmdirSync(baseDir);
  }
});

test("서버가 닫히면 그 서버가 기록한 런타임 토큰을 정리한다", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), `agent-os-${process.getuid()}-close-test-`));
  const token = crypto.randomBytes(32).toString("base64url");
  const lifecycleServer = createAgentOsServer({
    sessionToken: token,
    runSkillImpl() { throw new Error("테스트에서 실행 함수가 호출되면 안 됩니다."); },
  });
  const tokenFile = path.join(runtimeDir, "session-token");
  try {
    const lifecycle = attachSessionTokenFile(lifecycleServer, token, runtimeDir);
    await new Promise((resolve, reject) => {
      lifecycleServer.once("error", reject);
      lifecycleServer.listen(0, HOST, resolve);
    });
    lifecycle.persist();
    assert.equal(fs.existsSync(tokenFile), true);
    await new Promise((resolve) => lifecycleServer.close(resolve));
    assert.equal(fs.existsSync(tokenFile), false);
  } finally {
    if (lifecycleServer.listening) await new Promise((resolve) => lifecycleServer.close(resolve));
    if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile);
    fs.rmdirSync(runtimeDir);
  }
});

test("심볼릭 링크 런타임 디렉터리에는 토큰을 기록하지 않는다", () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `agent-os-${process.getuid()}-symlink-test-`));
  const realDir = path.join(baseDir, "real");
  const linkedDir = path.join(baseDir, "linked");
  fs.mkdirSync(realDir, { mode: 0o700 });
  fs.symlinkSync(realDir, linkedDir, "dir");
  try {
    assert.throws(
      () => writeSessionTokenFile(crypto.randomBytes(32).toString("base64url"), linkedDir),
      /안전하지 않은 Agent OS 런타임 디렉터리/,
    );
    assert.equal(fs.existsSync(path.join(realDir, "session-token")), false);
  } finally {
    fs.unlinkSync(linkedDir);
    fs.rmdirSync(realDir);
    fs.rmdirSync(baseDir);
  }
});

test("브라우저 스크립트는 fragment를 즉시 지우고 외부 문자열을 HTML로 실행하지 않는다", async () => {
  const elements = {
    "#dday": { textContent: "" },
    "#report": { innerHTML: "" },
    "#skillList": { innerHTML: "" },
    "#console": { innerHTML: "", style: {}, appendChild() {} },
    "#logList": { innerHTML: "" },
  };
  let domReady;
  let replacedUrl;
  const fetchCalls = [];
  const detailElement = { innerHTML: "" };
  const openClasses = new Set();
  const navButton = {
    dataset: { tab: "logs" },
    classList: { toggle() {} },
  };
  const logElement = {
    dataset: {},
    classList: {
      toggle(name) { openClasses.has(name) ? openClasses.delete(name) : openClasses.add(name); },
      contains(name) { return openClasses.has(name); },
    },
    querySelector(selector) { return selector === ".detail" ? detailElement : null; },
  };
  const malicious = '"><img src=x onerror="globalThis.pwned=true">';
  logElement.dataset.id = malicious;
  const responses = {
    "/api/report": {
      dday: { label: malicious, days: 1 },
      deployments: { "highschool-app": { state: malicious, sha: malicious } },
      commitsYesterday: [{ hash: malicious, msg: malicious }],
      commitsToday: [],
      commitsWeek: 1,
      sessionsWeek: 1,
      backlog: [malicious],
      overnight: [],
      recentRuns: [{ label: malicious, status: malicious }],
    },
    "/api/skills": { skills: [{ id: malicious, domain: malicious, label: malicious, desc: malicious, danger: false }] },
    "/api/runs": [{ id: malicious, label: malicious, status: malicious, startedAt: 0, endedAt: null }],
  };
  const context = {
    URLSearchParams,
    TextDecoder,
    Map,
    Date,
    Math,
    Number,
    String,
    Boolean,
    console,
    alert() {},
    confirm() { return false; },
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      const body = url.startsWith("/api/runs/")
        ? { prompt: malicious, transcript: [{ kind: "tool", text: malicious }] }
        : responses[url];
      return { json: async () => body };
    },
    document: {
      querySelector: (selector) => elements[selector],
      querySelectorAll(selector) {
        if (selector === "nav button") return [navButton];
        if (selector === ".log") return [logElement];
        return [];
      },
      createElement: () => ({ textContent: "", className: "" }),
    },
    window: {
      location: { hash: `#token=${sessionToken}`, pathname: "/", search: "" },
      history: { replaceState(_state, _title, url) { replacedUrl = url; } },
      addEventListener(event, callback) { if (event === "DOMContentLoaded") domReady = callback; },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "public/app.js"), "utf8"), context);
  assert.equal(replacedUrl, "/");
  assert.equal(typeof domReady, "function");
  domReady();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotMatch(elements["#report"].innerHTML, /<img/);
  assert.doesNotMatch(elements["#skillList"].innerHTML, /<img/);
  assert.match(elements["#report"].innerHTML, /&lt;img/);
  assert.match(elements["#skillList"].innerHTML, /&lt;img/);
  assert.equal(elements["#dday"].textContent, `${malicious} D-1`);
  assert.equal(context.pwned, undefined);

  navButton.onclick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotMatch(elements["#logList"].innerHTML, /<img/);
  assert.match(elements["#logList"].innerHTML, /&lt;img/);
  await logElement.onclick();
  assert.doesNotMatch(detailElement.innerHTML, /<img/);
  assert.match(detailElement.innerHTML, /&lt;img/);

  assert.ok(fetchCalls.length >= 2);
  for (const call of fetchCalls) {
    assert.equal(call.options.headers["X-Agent-OS-Token"], sessionToken, call.url);
  }
});
