#!/usr/bin/env node
/** 에이전트 OS — Claude Code 위의 로컬 웹앱 (의존성 0개, Node 내장 모듈만)
 *  - GET  /               : UI
 *  - GET  /api/report     : 일일 보고서 데이터 (git·Vercel·세션·백로그)
 *  - GET  /api/skills     : skills.json (버튼 정의)
 *  - POST /api/run        : { skillId } → claude 헤드리스 실행, SSE 스트리밍
 *  - GET  /api/runs       : 실행 이력 목록 / GET /api/runs/<id> : 상세
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile, spawn } = require("child_process");

const PORT = 5599;
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
function vercelLatest(project, token) {
  return new Promise((resolve) => {
    if (!token) return resolve(null);
    https.get(`https://api.vercel.com/v9/projects/${project}`,
      { headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const id = JSON.parse(body).id;
            https.get(`https://api.vercel.com/v6/deployments?projectId=${id}&limit=1`,
              { headers: { Authorization: `Bearer ${token}` } }, (r2) => {
                let b2 = "";
                r2.on("data", (c) => (b2 += c));
                r2.on("end", () => {
                  try {
                    const d = (JSON.parse(b2).deployments || [])[0] || {};
                    resolve({
                      state: d.state || "-",
                      sha: (d.meta?.githubCommitSha || "").slice(0, 7),
                      msg: (d.meta?.githubCommitMessage || "").split("\n")[0].slice(0, 40),
                      at: d.created || null,
                    });
                  } catch { resolve(null); }
                });
              }).on("error", () => resolve(null));
          } catch { resolve(null); }
        });
      }).on("error", () => resolve(null));
  });
}

// ── 일일 보고서 ────────────────────────────────────────
async function buildReport() {
  const token = vercelToken();
  const [cy, ct, cw, highschool, semester] = await Promise.all([
    sh("git", ["log", "--since=yesterday 00:00", "--until=today 00:00", "--format=%h│%s"]),
    sh("git", ["log", "--since=today 00:00", "--format=%h│%s"]),
    sh("git", ["rev-list", "--count", "--since=7 days ago", "HEAD"]),
    vercelLatest("highschool-app", token),
    vercelLatest("semester-app", token),
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
    deployments: { "highschool-app": highschool, "semester-app": semester },
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
function runSkill(skill, res) {
  const id = `${Date.now()}-${skill.id}`;
  const run = { id, skillId: skill.id, label: skill.label, prompt: skill.prompt,
    startedAt: Date.now(), endedAt: null, status: "running", summary: "", transcript: [] };
  const save = () => fs.writeFileSync(path.join(RUNS_DIR, id + ".json"), JSON.stringify(run));
  save();

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  send("start", { id, label: skill.label });

  const child = spawn("claude", ["-p", skill.prompt, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"],
    { cwd: ROOT, env: process.env });

  let buf = "";
  child.stdout.on("data", (chunk) => {
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
  child.stderr.on("data", (c) => send("stderr", c.toString().slice(0, 300)));
  child.on("close", (code) => {
    run.endedAt = Date.now();
    if (run.status === "running") run.status = code === 0 ? "done" : "error";
    save();
    send("end", { status: run.status, summary: run.summary, ms: run.endedAt - run.startedAt });
    res.end();
  });
  child.on("error", (e) => {
    run.status = "error"; run.endedAt = Date.now(); run.summary = String(e); save();
    send("end", { status: "error", summary: String(e) }); res.end();
  });
}

// ── HTTP 서버 ─────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (obj, code = 200) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(APP, "public/index.html")));
    }
    if (url.pathname === "/api/report") return json(await buildReport());
    if (url.pathname === "/api/skills") return json(JSON.parse(fs.readFileSync(path.join(APP, "skills.json"), "utf8")));
    if (url.pathname === "/api/runs") return json(listRuns());
    if (url.pathname.startsWith("/api/runs/")) {
      const f = path.join(RUNS_DIR, path.basename(url.pathname) + ".json");
      if (!fs.existsSync(f)) return json({ error: "not found" }, 404);
      return json(JSON.parse(fs.readFileSync(f, "utf8")));
    }
    if (url.pathname === "/api/run" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const { skillId } = JSON.parse(body || "{}");
          const cfg = JSON.parse(fs.readFileSync(path.join(APP, "skills.json"), "utf8"));
          const skill = cfg.skills.find((s) => s.id === skillId);
          if (!skill) return json({ error: "unknown skill" }, 400);
          runSkill(skill, res);
        } catch (e) { json({ error: String(e) }, 500); }
      });
      return;
    }
    json({ error: "not found" }, 404);
  } catch (e) { json({ error: String(e) }, 500); }
});

server.listen(PORT, () => {
  console.log(`에이전트 OS → http://localhost:${PORT}`);
});
