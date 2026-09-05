#!/usr/bin/env node
/** 에이전트 OS — Claude Code 위의 로컬 웹앱 (의존성 0개, Node 내장 모듈만)
 *  - GET  /               : UI
 *  - GET  /api/report     : 일일 보고서 데이터 (git·Vercel·세션·백로그)
 *  - GET  /api/skills     : skills.json (버튼 정의)
 *  - POST /api/run        : { skillId, dangerConfirmation? } → claude 헤드리스 실행, SSE 스트리밍
 *  - GET  /api/runs       : 실행 이력 목록 / GET /api/runs/<id> : 상세
 */
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile, spawn } = require("child_process");
const { readJson } = require("./http-json");

const PORT = 5599;
const HOST = "127.0.0.1";
const PROCESS_UID = typeof process.getuid === "function" ? process.getuid() : os.userInfo().uid;
const RUNTIME_DIR = path.join("/tmp", `agent-os-${PROCESS_UID}`);
const TOKEN_FILE = path.join(RUNTIME_DIR, "session-token");
const ROOT = path.resolve(__dirname, "..");            // 모노레포 루트
const APP = __dirname;
const RUNS_DIR = path.join(APP, "runs");
const SESS_DIR = path.join(os.homedir(), ".claude/projects/-Users-sunghoon-Desktop-ai--");
const BACKLOG = path.join(SESS_DIR, "memory/project_pending_backlog.md");
const VERCEL_AUTH = path.join(os.homedir(), "Library/Application Support/com.vercel.cli/auth.json");
fs.mkdirSync(RUNS_DIR, { recursive: true });

// ── 유틸 ──────────────────────────────────────────────
function sh(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, timeout: 15000, ...opts }, (err, stdout) =>
      resolve(err ? "" : stdout.trim()));
  });
}
function vercelToken() {
  try { return JSON.parse(fs.readFileSync(VERCEL_AUTH, "utf8")).token; } catch { return null; }
}
async function vercelLatest(project, token, readJsonImpl = readJson) {
  if (!token) return null;
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const info = await readJsonImpl(`https://api.vercel.com/v9/projects/${project}`, { headers });
    if (typeof info?.id !== "string") return null;
    const result = await readJsonImpl(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(info.id)}&limit=1`, { headers });
    const d = result?.deployments?.[0];
    if (!d) return null;
    return {
      state: d.state || "-",
      sha: (d.meta?.githubCommitSha || "").slice(0, 7),
      msg: (d.meta?.githubCommitMessage || "").split("\n")[0].slice(0, 40),
      at: d.created || null,
    };
  } catch { return null; }
}

// ── 일일 보고서 ────────────────────────────────────────
async function buildReport() {
  const token = vercelToken();
  const [cy, ct, cw, highschool] = await Promise.all([
    sh("git", ["log", "--since=yesterday 00:00", "--until=today 00:00", "--format=%h│%s"]),
    sh("git", ["log", "--since=today 00:00", "--format=%h│%s"]),
    sh("git", ["rev-list", "--count", "--since=7 days ago", "HEAD"]),
    vercelLatest("highschool-app", token),
  ]);
  const parse = (s) => s ? s.split("\n").map((l) => { const [h, ...m] = l.split("│"); return { hash: h, msg: m.join("│") }; }) : [];

  // 이번 주 Claude 세션 (jsonl 파일 mtime 기준)
  let sessionsWeek = 0;
  try {
    const weekAgo = Date.now() - 7 * 86400e3;
    sessionsWeek = fs.readdirSync(SESS_DIR).filter((f) =>
      f.endsWith(".jsonl") && fs.statSync(path.join(SESS_DIR, f)).mtimeMs > weekAgo).length;
  } catch {}

  // 백로그 (메모리 파일의 목록 항목, 완료 취소선 제외)
  let backlog = [];
  try {
    backlog = fs.readFileSync(BACKLOG, "utf8").split("\n")
      .filter((l) => l.startsWith("- ") && !l.includes("~~"))
      .map((l) => l.replace(/^- /, "").replace(/\*\*/g, "").replace(/\[\[.*?\]\]/g, "").split(" — ")[0].trim())
      .filter(Boolean);
  } catch {}

  // 실행 이력 (밤새 = 어제 22시 이후)
  const runs = listRuns();
  const overnightCut = new Date(); overnightCut.setHours(-2, 0, 0, 0); // 어제 22:00
  const overnight = runs.filter((r) => r.startedAt > overnightCut.getTime());

  // D-day
  let dday = null;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(APP, "skills.json"), "utf8")).dday;
    if (cfg?.date) {
      const diff = Math.ceil((new Date(cfg.date + "T00:00:00") - new Date()) / 86400e3);
      dday = { label: cfg.label, date: cfg.date, days: diff };
    }
  } catch {}

  return {
    now: Date.now(), dday,
    commitsYesterday: parse(cy), commitsToday: parse(ct), commitsWeek: Number(cw) || 0,
    deployments: { "highschool-app": highschool },
    sessionsWeek, backlog, overnight: overnight.slice(0, 5), recentRuns: runs.slice(0, 5),
  };
}

// ── 실행 이력 ─────────────────────────────────────────
function listRuns() {
  try {
    return fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json"))
      .map((f) => { try { const j = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), "utf8")); return { ...j, transcript: undefined, id: f.replace(".json", "") }; } catch { return null; } })
      .filter(Boolean).sort((a, b) => b.startedAt - a.startedAt);
  } catch { return []; }
}

// ── 헤드리스 claude 실행 + SSE ─────────────────────────
function claudeArgsForSkill(skill) {
  const args = ["-p", skill.prompt, "--output-format", "stream-json", "--verbose"];
  if (skill.danger) {
    args.push("--dangerously-skip-permissions");
  } else {
    args.push(
      "--safe-mode",
      "--permission-mode", "plan",
      "--disable-slash-commands",
      "--no-session-persistence",
      "--tools", "Read,Glob,Grep",
    );
  }
  return args;
}

function confirmDangerSkill() {
  const script = 'display dialog "Agent OS가 외부 명령·파일 수정·커밋·푸시·배포 권한을 사용할 수 있습니다." with title "Agent OS 권한 실행" buttons {"취소", "실행"} default button "실행" cancel button "취소" with icon caution';
  return new Promise((resolve) => {
    execFile("/usr/bin/osascript", ["-e", script], { timeout: 60_000 }, (error) => resolve(!error));
  });
}

function runSkill(skill, res, options = {}) {
  const id = `${Date.now()}-${skill.id}`;
  const run = { id, skillId: skill.id, label: skill.label, prompt: skill.prompt,
    startedAt: Date.now(), endedAt: null, status: "running", summary: "", transcript: [] };
  const save = () => options.saveRunImpl
    ? options.saveRunImpl(run)
    : fs.writeFileSync(path.join(RUNS_DIR, id + ".json"), JSON.stringify(run));
  save();

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (type, data) => {
    if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };
  send("start", { id, label: skill.label });

  let completed = false;
  const finish = (code, error) => {
    if (completed) return;
    completed = true;
    run.endedAt = Date.now();
    if (error) {
      run.status = "error";
      run.summary = String(error);
    } else if (code !== 0) {
      run.status = "error";
    } else if (run.status === "running") {
      run.status = "done";
    }
    save();
    send("end", { status: run.status, summary: run.summary, ms: run.endedAt - run.startedAt });
    if (!res.writableEnded && !res.destroyed) res.end();
  };

  let child;
  try {
    child = (options.spawnImpl || spawn)("claude", claudeArgsForSkill(skill),
      { cwd: ROOT, env: process.env });
  } catch (error) { finish(null, error); return; }

  let buf = "";
  child.stdout.on("data", (chunk) => {
    if (completed) return;
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      // 사람이 읽을 이벤트로 변환
      if (ev.type === "assistant" && ev.message?.content) {
        for (const c of ev.message.content) {
          if (c.type === "text" && c.text?.trim()) {
            run.transcript.push({ t: Date.now(), kind: "text", text: c.text });
            run.summary = c.text.slice(0, 500);
            send("text", c.text);
          } else if (c.type === "tool_use") {
            const label = c.name === "Bash" ? `$ ${(c.input?.command || "").slice(0, 120)}` : c.name;
            run.transcript.push({ t: Date.now(), kind: "tool", text: label });
            send("tool", label);
          }
        }
      } else if (ev.type === "result") {
        run.status = ev.is_error ? "error" : "done";
        if (ev.result) { run.summary = String(ev.result).slice(0, 2000); }
      }
      save();
    }
  });
  child.stderr.on("data", (c) => {
    if (!completed) send("stderr", c.toString().slice(0, 300));
  });
  child.on("close", (code) => finish(code));
  child.on("error", (error) => finish(null, error));
}

// ── HTTP 서버 보안 ─────────────────────────────────────
const LOCAL_HOSTS = new Set([HOST, "localhost"]);

function setSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
}

function isAllowedLocalUrl(value, req) {
  if (!value) return false;
  try {
    const parsed = new URL(value.includes("://") ? value : `http://${value}`);
    return parsed.protocol === "http:"
      && LOCAL_HOSTS.has(parsed.hostname.toLowerCase())
      && parsed.port === String(req.socket.localPort)
      && parsed.pathname === "/"
      && !parsed.search
      && !parsed.hash
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

function isAuthorizedRunRequest(req, sessionToken) {
  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite && fetchSite !== "same-origin") return false;
  if (!isAllowedLocalUrl(req.headers.origin, req)) return false;

  const supplied = req.headers["x-agent-os-token"];
  if (typeof supplied !== "string") return false;
  return tokensEqual(sessionToken, supplied);
}

function hasValidSessionToken(req, sessionToken) {
  const supplied = req.headers["x-agent-os-token"];
  return typeof supplied === "string" && tokensEqual(sessionToken, supplied);
}

function tokensEqual(expectedToken, suppliedToken) {
  if (typeof expectedToken !== "string" || typeof suppliedToken !== "string") return false;
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function createHealthProof(sessionToken, challenge) {
  if (!/^[a-f0-9]{64}$/.test(challenge)) {
    throw new Error("잘못된 Agent OS health challenge입니다.");
  }
  return crypto.createHmac("sha256", sessionToken)
    .update(`agent-os-health-v1:${challenge}`)
    .digest("base64url");
}

function readSessionTokenFile(runtimeDir = RUNTIME_DIR) {
  const runtimeStat = fs.lstatSync(runtimeDir);
  if (!runtimeStat.isDirectory() || runtimeStat.isSymbolicLink()
    || runtimeStat.uid !== PROCESS_UID || (runtimeStat.mode & 0o777) !== 0o700) {
    throw new Error(`안전하지 않은 Agent OS 런타임 디렉터리입니다: ${runtimeDir}`);
  }

  const tokenFile = path.join(runtimeDir, "session-token");
  const tokenStat = fs.lstatSync(tokenFile);
  if (!tokenStat.isFile() || tokenStat.isSymbolicLink() || tokenStat.uid !== PROCESS_UID
    || (tokenStat.mode & 0o777) !== 0o600 || tokenStat.size > 128) {
    throw new Error(`안전하지 않은 Agent OS 토큰 파일입니다: ${tokenFile}`);
  }
  const sessionToken = fs.readFileSync(tokenFile, "utf8").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) {
    throw new Error("잘못된 Agent OS 세션 토큰입니다.");
  }
  return sessionToken;
}

function ensureRuntimeDirectory(runtimeDir) {
  try { fs.mkdirSync(runtimeDir, { mode: 0o700 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }

  const stat = fs.lstatSync(runtimeDir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== PROCESS_UID) {
    throw new Error(`안전하지 않은 Agent OS 런타임 디렉터리입니다: ${runtimeDir}`);
  }
  if ((stat.mode & 0o777) !== 0o700) fs.chmodSync(runtimeDir, 0o700);
}

function writeSessionTokenFile(sessionToken, runtimeDir = RUNTIME_DIR) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) {
    throw new Error("잘못된 Agent OS 세션 토큰입니다.");
  }
  ensureRuntimeDirectory(runtimeDir);

  const tokenFile = path.join(runtimeDir, "session-token");
  const tempFile = path.join(runtimeDir, `.session-token-${process.pid}-${crypto.randomBytes(8).toString("hex")}`);
  let fd;
  try {
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0);
    fd = fs.openSync(tempFile, flags, 0o600);
    fs.writeFileSync(fd, `${sessionToken}\n`, { encoding: "utf8" });
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempFile, tokenFile);

    const stat = fs.lstatSync(tokenFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== PROCESS_UID) {
      throw new Error(`안전하지 않은 Agent OS 토큰 파일입니다: ${tokenFile}`);
    }
    fs.chmodSync(tokenFile, 0o600);
    return tokenFile;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(tempFile); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

function removeSessionTokenFile(sessionToken, runtimeDir = RUNTIME_DIR) {
  const tokenFile = path.join(runtimeDir, "session-token");
  try {
    const stat = fs.lstatSync(tokenFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== PROCESS_UID || (stat.mode & 0o077) !== 0) return false;
    const storedToken = fs.readFileSync(tokenFile, "utf8").trim();
    if (!tokensEqual(sessionToken, storedToken)) return false;
    fs.unlinkSync(tokenFile);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function attachSessionTokenFile(server, sessionToken, runtimeDir = RUNTIME_DIR) {
  let written = false;
  const persist = () => {
    writeSessionTokenFile(sessionToken, runtimeDir);
    written = true;
  };
  const cleanup = () => {
    if (!written) return false;
    const removed = removeSessionTokenFile(sessionToken, runtimeDir);
    written = false;
    return removed;
  };
  server.once("close", () => { try { cleanup(); } catch {} });
  return { persist, cleanup };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > 16 * 1024) {
        tooLarge = true;
        body = "";
      }
    });
    req.on("end", () => {
      if (tooLarge) {
        const error = new Error("request body too large");
        error.statusCode = 413;
        return reject(error);
      }
      try { resolve(JSON.parse(body || "{}")); }
      catch {
        const error = new Error("invalid json");
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function createAgentOsServer(options = {}) {
  const sessionToken = options.sessionToken || crypto.randomBytes(32).toString("base64url");
  const runSkillImpl = options.runSkillImpl || runSkill;
  const confirmDangerImpl = options.confirmDangerImpl || confirmDangerSkill;
  const dangerApprovals = new Map();
  let dangerConfirmationPending = false;

  const findSkill = (skillId) => {
    const cfg = JSON.parse(fs.readFileSync(path.join(APP, "skills.json"), "utf8"));
    return cfg.skills.find((item) => item.id === skillId);
  };
  const pruneDangerApprovals = () => {
    const now = Date.now();
    for (const [approval, record] of dangerApprovals) {
      if (record.expiresAt <= now) dangerApprovals.delete(approval);
    }
    while (dangerApprovals.size >= 32) {
      dangerApprovals.delete(dangerApprovals.keys().next().value);
    }
  };

  return http.createServer(async (req, res) => {
    setSecurityHeaders(res);
    const json = (obj, code = 200) => {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(obj));
    };

    if (!isAllowedLocalUrl(req.headers.host, req)) {
      return json({ error: "허용되지 않은 Host입니다." }, 403);
    }

    let url;
    try { url = new URL(req.url, `http://${req.headers.host}`); }
    catch { return json({ error: "잘못된 요청 주소입니다." }, 400); }

    if (url.pathname.startsWith("/api/") && !hasValidSessionToken(req, sessionToken)) {
      return json({ error: "API 요청 인증에 실패했습니다." }, 403);
    }

    try {
      if (url.pathname === "/.well-known/agent-os-health" && req.method === "GET") {
        const challenge = url.searchParams.get("challenge") || "";
        let proof;
        try { proof = createHealthProof(sessionToken, challenge); }
        catch { return json({ error: "잘못된 health challenge입니다." }, 400); }
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(proof);
      }
      if (url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(fs.readFileSync(path.join(APP, "public/index.html")));
      }
      if (url.pathname === "/app.js") {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        return res.end(fs.readFileSync(path.join(APP, "public/app.js")));
      }
      if (url.pathname === "/api/report") return json(await buildReport());
      if (url.pathname === "/api/skills") return json(JSON.parse(fs.readFileSync(path.join(APP, "skills.json"), "utf8")));
      if (url.pathname === "/api/runs") return json(listRuns());
      if (url.pathname.startsWith("/api/runs/")) {
        const f = path.join(RUNS_DIR, path.basename(url.pathname) + ".json");
        if (!fs.existsSync(f)) return json({ error: "not found" }, 404);
        return json(JSON.parse(fs.readFileSync(f, "utf8")));
      }
      if (url.pathname === "/api/danger-approval" && req.method === "POST") {
        if (!isAuthorizedRunRequest(req, sessionToken)) {
          return json({ error: "위험 작업 승인 요청 인증에 실패했습니다." }, 403);
        }
        const { skillId } = await readJsonBody(req);
        const skill = findSkill(skillId);
        if (!skill?.danger) return json({ error: "위험 스킬만 별도 승인을 요청할 수 있습니다." }, 400);
        if (dangerConfirmationPending) return json({ error: "다른 위험 작업 승인을 확인 중입니다." }, 409);
        dangerConfirmationPending = true;
        let confirmed = false;
        try { confirmed = await confirmDangerImpl(skill); }
        finally { dangerConfirmationPending = false; }
        if (!confirmed) return json({ error: "위험 작업 승인이 취소되었습니다." }, 409);
        pruneDangerApprovals();
        const approval = crypto.randomBytes(32).toString("base64url");
        dangerApprovals.set(approval, {
          skillId: skill.id,
          prompt: skill.prompt,
          expiresAt: Date.now() + 30_000,
        });
        return json({ approval }, 201);
      }
      if (url.pathname === "/api/run" && req.method === "POST") {
        if (!isAuthorizedRunRequest(req, sessionToken)) {
          return json({ error: "실행 요청 인증에 실패했습니다." }, 403);
        }

        const { skillId, dangerConfirmation } = await readJsonBody(req);
        const skill = findSkill(skillId);
        if (!skill) return json({ error: "unknown skill" }, 400);
        if (skill.danger) {
          const approval = typeof dangerConfirmation === "string"
            ? dangerApprovals.get(dangerConfirmation)
            : null;
          if (typeof dangerConfirmation === "string") dangerApprovals.delete(dangerConfirmation);
          if (!approval || approval.skillId !== skill.id || approval.prompt !== skill.prompt
            || approval.expiresAt <= Date.now()) {
            return json({ error: "위험 작업은 유효한 일회용 서버 승인이 필요합니다." }, 409);
          }
        }
        return runSkillImpl(skill, res);
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, e.statusCode || 500);
    }
  });
}

if (require.main === module) {
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const server = createAgentOsServer({ sessionToken });
  const tokenFile = attachSessionTokenFile(server, sessionToken);
  const cleanupTokenFile = () => { try { tokenFile.cleanup(); } catch {} };

  process.once("exit", cleanupTokenFile);
  const shutdown = () => {
    cleanupTokenFile();
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  server.listen(PORT, HOST, () => {
    try {
      tokenFile.persist();
      console.log(`에이전트 OS → http://${HOST}:${PORT}`);
    } catch (error) {
      console.error(`에이전트 OS 토큰 파일 생성 실패: ${error.message}`);
      server.close(() => { process.exitCode = 1; });
    }
  });
}

module.exports = {
  createAgentOsServer,
  vercelLatest,
  runSkill,
  claudeArgsForSkill,
  confirmDangerSkill,
  writeSessionTokenFile,
  readSessionTokenFile,
  removeSessionTokenFile,
  attachSessionTokenFile,
  createHealthProof,
  HOST,
  PORT,
  RUNTIME_DIR,
  TOKEN_FILE,
};
