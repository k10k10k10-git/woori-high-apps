"use strict";

(() => {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const fragmentToken = fragment.get("token") || "";
  const sessionToken = /^[A-Za-z0-9_-]{43}$/.test(fragmentToken) ? fragmentToken : "";
  window.history.replaceState(null, "", window.location.pathname + window.location.search);

  window.addEventListener("DOMContentLoaded", () => {
    const $ = (selector) => document.querySelector(selector);
    if (!sessionToken) {
      $("#report").textContent = "AgentOS.command로 다시 열어 실행 권한을 갱신해 주세요.";
      $("#skillList").textContent = "인증된 런처 세션에서만 스킬 목록을 불러옵니다.";
      return;
    }
    const apiFetch = (url, options = {}) => fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), "X-Agent-OS-Token": sessionToken },
    });
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
    const fmt = (timestamp) => new Date(timestamp).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const statusPill = (status) => status === "done"
      ? '<span class="pill ok">완료</span>'
      : status === "running"
        ? '<span class="pill run">실행 중</span>'
        : '<span class="pill err">오류</span>';
    const safeCount = (value) => {
      const number = Number(value);
      return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
    };

    // ── 탭 ──
    document.querySelectorAll("nav button").forEach((button) => {
      button.onclick = () => {
        document.querySelectorAll("nav button").forEach((item) => item.classList.toggle("on", item === button));
        document.querySelectorAll("section").forEach((section) => section.classList.toggle("on", section.id === button.dataset.tab));
        if (button.dataset.tab === "logs") loadLogs();
        if (button.dataset.tab === "home") loadReport();
      };
    });

    // ── 홈: 일일 보고서 ──
    async function loadReport() {
      const report = await (await apiFetch("/api/report")).json();
      if (report.dday) {
        const days = Number(report.dday.days);
        const dayLabel = Number.isFinite(days) ? (days > 0 ? `-${days}` : days === 0 ? "-DAY" : `+${-days}`) : "";
        $("#dday").textContent = `${String(report.dday.label ?? "")} D${dayLabel}`;
      }
      const deployments = report.deployments && typeof report.deployments === "object" ? report.deployments : {};
      const deployment = (name) => {
        const item = deployments[name];
        if (!item || typeof item !== "object") {
          return `<div class="row"><span>${esc(name)}</span><span class="pill err">확인 불가</span></div>`;
        }
        const state = String(item.state ?? "-");
        const stateClass = state === "READY" ? "ok" : state === "ERROR" ? "err" : "run";
        return `<div class="row"><span>${esc(name)} <span class="h">${esc(item.sha)}</span></span><span class="pill ${stateClass}">${esc(state)}</span></div>`;
      };
      const commitsToday = Array.isArray(report.commitsToday) ? report.commitsToday : [];
      const commitsYesterday = Array.isArray(report.commitsYesterday) ? report.commitsYesterday : [];
      const backlog = Array.isArray(report.backlog) ? report.backlog : [];
      const overnight = Array.isArray(report.overnight) ? report.overnight : [];
      const recentRuns = Array.isArray(report.recentRuns) ? report.recentRuns : [];
      const commits = (list) => list.length
        ? list.map((commit) => `<div class="row"><span>${esc(String(commit.msg ?? "").slice(0, 42))}</span><span class="h">${esc(commit.hash)}</span></div>`).join("")
        : '<div class="empty">커밋 없음</div>';
      const runRows = (list) => list.length
        ? list.map((run) => `<div class="row"><span>${esc(run.label)}</span>${statusPill(run.status)}</div>`).join("")
        : '<div class="empty">실행 이력 없음</div>';
      $("#report").innerHTML = `
        <div class="card"><h3>이번 주 커밋</h3><div class="big">${safeCount(report.commitsWeek)}</div><div class="sub">오늘 ${commitsToday.length} · 어제 ${commitsYesterday.length}</div></div>
        <div class="card"><h3>이번 주 Claude 세션</h3><div class="big">${safeCount(report.sessionsWeek)}</div><div class="sub">최근 7일</div></div>
        <div class="card"><h3>미해결 백로그</h3><div class="big">${backlog.length}</div><div class="sub">메모리 기준</div></div>
        <div class="card"><h3>배포 상태</h3>${deployment("highschool-app")}</div>
        <div class="card wide"><h3>오늘의 커밋</h3>${commits(commitsToday)}</div>
        <div class="card wide"><h3>어제의 커밋</h3>${commits(commitsYesterday)}</div>
        <div class="card"><h3>밤새 실행된 항목</h3>${runRows(overnight)}</div>
        <div class="card"><h3>최근 실행</h3>${runRows(recentRuns)}</div>
        <div class="card wide"><h3>열려 있는 작업 (백로그)</h3>${backlog.map((item) => `<div class="row"><span>${esc(item)}</span></div>`).join("") || '<div class="empty">없음</div>'}</div>`;
    }

    // ── 스킬 버튼 ──
    let running = false;
    async function loadSkills() {
      const config = await (await apiFetch("/api/skills")).json();
      const skills = Array.isArray(config.skills) ? config.skills : [];
      const byDomain = new Map();
      skills.forEach((skill) => {
        const domain = String(skill.domain ?? "기타");
        if (!byDomain.has(domain)) byDomain.set(domain, []);
        byDomain.get(domain).push(skill);
      });
      $("#skillList").innerHTML = [...byDomain.entries()].map(([domain, list]) => `
        <div class="domain"><h2>${esc(domain)}</h2><div class="skills">
          ${list.map((skill) => `<button class="skill" data-id="${esc(skill.id)}" data-danger="${Boolean(skill.danger)}">
            ${skill.danger ? '<span class="tag">권한 실행</span>' : ""}<b>${esc(skill.label)}</b><span>${esc(skill.desc)}</span></button>`).join("")}
        </div></div>`).join("");
      document.querySelectorAll(".skill").forEach((button) => { button.onclick = () => runSkill(button); });
    }

    async function runSkill(button) {
      if (running) return alert("이미 실행 중입니다 — 완료 후 다시 시도하세요.");
      if (!sessionToken) return alert("AgentOS.command로 다시 열어 실행 권한을 갱신해 주세요.");
      const isDangerous = button.dataset.danger === "true";
      running = true;
      document.querySelectorAll(".skill").forEach((item) => { item.disabled = true; });
      const consoleElement = $("#console");
      consoleElement.style.display = "block";
      consoleElement.innerHTML = `<div class="hdr">▶ ${esc(button.querySelector("b").textContent)} — 실행 시작 ${esc(new Date().toLocaleTimeString("ko-KR"))}</div>`;
      const add = (className, value) => {
        const line = document.createElement("div");
        line.className = className;
        line.textContent = value;
        consoleElement.appendChild(line);
        consoleElement.scrollTop = consoleElement.scrollHeight;
      };
      try {
        let dangerConfirmation;
        if (isDangerous) {
          const approvalResponse = await apiFetch("/api/danger-approval", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ skillId: button.dataset.id }),
          });
          const approvalPayload = await approvalResponse.json().catch(() => ({}));
          if (!approvalResponse.ok || !approvalPayload.approval) {
            throw new Error(approvalPayload.error || `승인 요청 HTTP ${approvalResponse.status}`);
          }
          dangerConfirmation = approvalPayload.approval;
        }
        const response = await apiFetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skillId: button.dataset.id,
            dangerConfirmation,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `HTTP ${response.status}`);
        }
        if (!response.body) throw new Error("응답 스트림이 없습니다.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let separator;
          while ((separator = buffer.indexOf("\n\n")) >= 0) {
            const chunk = buffer.slice(0, separator);
            buffer = buffer.slice(separator + 2);
            if (!chunk.startsWith("data: ")) continue;
            const event = JSON.parse(chunk.slice(6));
            if (event.type === "tool") add("tool", `🔧 ${event.data}`);
            else if (event.type === "text") add("txt", event.data);
            else if (event.type === "end") add("hdr", `■ ${event.data.status === "done" ? "완료" : "오류"} (${Math.round((event.data.ms || 0) / 1000)}초)`);
          }
        }
      } catch (error) {
        add("hdr", `■ 연결 오류: ${error}`);
      }
      running = false;
      document.querySelectorAll(".skill").forEach((item) => { item.disabled = false; });
      loadLogs();
      loadReport();
    }

    // ── 로그 ──
    async function loadLogs() {
      const payload = await (await apiFetch("/api/runs")).json();
      const runs = Array.isArray(payload) ? payload : [];
      $("#logList").innerHTML = runs.length ? runs.map((run) => `
        <div class="log" data-id="${esc(run.id)}">
          <div class="top"><b>${esc(run.label)}</b>${statusPill(run.status)}<span class="when">${esc(fmt(run.startedAt))}${run.endedAt ? ` · ${esc(Math.round((run.endedAt - run.startedAt) / 1000))}초` : ""}</span></div>
          <div class="detail"><div class="empty">불러오는 중…</div></div>
        </div>`).join("") : '<div class="empty">아직 실행 이력이 없습니다 — 스킬 탭에서 버튼을 눌러보세요.</div>';
      document.querySelectorAll(".log").forEach((element) => {
        element.onclick = async () => {
          element.classList.toggle("open");
          if (!element.classList.contains("open") || element.dataset.loaded) return;
          element.dataset.loaded = "1";
          const detail = await (await apiFetch(`/api/runs/${encodeURIComponent(element.dataset.id)}`)).json();
          element.querySelector(".detail").innerHTML =
            `<p style="margin-bottom:8px"><b>지시:</b> ${esc(detail.prompt)}</p>`
            + `<pre>${esc((Array.isArray(detail.transcript) ? detail.transcript : []).map((item) => `${item.kind === "tool" ? "🔧 " : ""}${String(item.text ?? "")}`).join("\n\n")) || "(기록 없음)"}</pre>`;
        };
      });
    }

    loadReport();
    loadSkills();
  });
})();
