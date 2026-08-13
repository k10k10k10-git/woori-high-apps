"use client";

// 출석 체크 — 모바일 최우선(375px). 학생별 [출석/지각/결석] 3버튼.
// ⚠ 토글 아님: 멱등 명시 상태 기록 (같은 버튼 재탭 = 동일 상태 유지, 실수 규칙 11).
// 기록 취소는 별도 '지우기'로만.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { clearAttendance, describeApplicant, setAttendance, subscribeAllAttendance, subscribeSessionAttendance } from "@/features/semester/db";
import AttendanceGrid from "./AttendanceGrid";
import { applicantSortKey } from "@/features/semester/applicant";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { semesterRoster, type SemesterRosterScope } from "@/features/semester/roster";
import { sessionDisplayLabel } from "@/features/semester/sessionKind";
import { Application, AttendanceStatus, Session, SessionAttendance, Team, TrainingClass } from "@/features/semester/types";

interface Props {
  sid: string;
  teams: Team[];
  trainingClasses: TrainingClass[];
  sessions: Session[];
  applications: Application[];
  teamById: Map<string, Team>;
}

const STATUS_BTN: { s: AttendanceStatus; on: string }[] = [
  { s: "출석", on: "bg-green-100 text-green-900 border-green-300" },
  { s: "지각", on: "bg-yellow-100 text-yellow-900 border-yellow-300" },
  { s: "결석", on: "bg-red-100 text-red-900 border-red-300" },
];

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AttendanceTab({ sid, teams, trainingClasses, sessions, applications, teamById }: Props) {
  const { user } = useAuth();
  const { toast } = useUI();
  const canEdit = useSemesterCanEdit();
  const [sessId, setSessId] = useState<string>("");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("");
  const [scope, setScope] = useState<SemesterRosterScope>("team");
  const [att, setAtt] = useState<SessionAttendance>({});
  const [attAll, setAttAll] = useState<Record<string, SessionAttendance>>({});
  const [view, setView] = useState<"grid" | "session">("grid");
  const [loadError, setLoadError] = useState<string | null>(null);
  const defaultSessId = useMemo(() => {
    if (sessions.length === 0) return "";
    const today = todayYMD();
    const candidate =
      sessions.find((s) => s.date === today) ??
      sessions.find((s) => s.date >= today) ??
      sessions[sessions.length - 1];
    return candidate.id;
  }, [sessions]);
  const activeSessId = sessions.some((session) => session.id === sessId) ? sessId : defaultSessId;

  useEffect(() => {
    if (!activeSessId) return;
    return subscribeSessionAttendance(sid, activeSessId, setAtt, (e) => setLoadError(e.message));
  }, [sid, activeSessId]);

  // 표 보기는 전 회차를 한 번에 본다 (수료 탭과 같은 경로를 재사용)
  useEffect(() => {
    if (view !== "grid") return;
    return subscribeAllAttendance(sid, setAttAll, (e) => setLoadError(e.message));
  }, [sid, view]);

  const session = sessions.find((s) => s.id === activeSessId);
  const members = useMemo(
    () =>
      semesterRoster(applications, scope)
        .filter((a) => scope === "training"
          ? (!classFilter
              || (classFilter === "__none__" ? !a.trainingClassId : a.trainingClassId === classFilter))
          : (!teamFilter || a.teamId === teamFilter))
        .sort((a, b) => {
          const ta = a.teamId ? teamById.get(a.teamId)?.order ?? 99 : 99;
          const tb = b.teamId ? teamById.get(b.teamId)?.order ?? 99 : 99;
          return ta - tb || applicantSortKey(a).localeCompare(applicantSortKey(b), "ko");
        }),
    [applications, scope, teamFilter, classFilter, teamById],
  );

  async function markAt(appKey: string, sessionId: string, status: AttendanceStatus) {
    try {
      await setAttendance(sid, sessionId, appKey, status, user?.uid);
    } catch (e) {
      toast(`기록 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  const mark = (appKey: string, status: AttendanceStatus) => markAt(appKey, activeSessId, status);

  if (sessions.length === 0) {
    return <p className="text-sm text-slate-400">먼저 설정 탭에서 회차(모임 날짜)를 등록해주세요.</p>;
  }

  const counts = { 출석: 0, 지각: 0, 결석: 0, 미기록: 0 };
  for (const m of members) {
    const e = att[m.id];
    if (e) counts[e.s]++;
    else counts.미기록++;
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 출석 로드 오류: {loadError}
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-2">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="출석 명단 구분">
          <button
            role="tab"
            aria-selected={scope === "team"}
            onClick={() => setScope("team")}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${scope === "team" ? "bg-white text-emerald-800 shadow-sm" : "text-emerald-700/70"}`}
          >
            사역팀 출석부
          </button>
          <button
            role="tab"
            aria-selected={scope === "training"}
            onClick={() => {
              setScope("training");
              setTeamFilter("");
            }}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${scope === "training" ? "bg-white text-emerald-800 shadow-sm" : "text-emerald-700/70"}`}
          >
            훈련 출석부 <span className="ml-1 text-xs">{semesterRoster(applications, "training").length}명</span>
          </button>
        </div>
      </div>

      {/* .input은 레이어 밖 규칙(width:100%)이라 유틸리티 w-*를 이긴다 → 폭은 감싼 div로 준다.
          높이도 h-*로 고정하지 않는다(모바일 16px 글꼴에서 글자 아랫부분이 잘렸다). */}
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:max-w-2xl">
        {view === "session" && <div>
          <select
            aria-label="회차 선택"
            value={activeSessId}
            onChange={(e) => {
              setLoadError(null);
              setSessId(e.target.value);
            }}
            className="input text-sm"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} · {sessionDisplayLabel(s)}
              </option>
            ))}
          </select>
        </div>}
        {scope === "training" && (
          <div>
            <select
              aria-label="훈련 반 필터"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="">전체 훈련 반</option>
              {trainingClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="__none__">반 미정</option>
            </select>
          </div>
        )}
        {scope === "team" && (
          <div>
            <select
              aria-label="팀 필터"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="">전체 팀</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {session?.type === "휴강" && (
        <div className="mb-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          이 회차는 휴강입니다 - 출석 집계(만점)에서 제외됩니다.
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="출석 보기 방식">
          {([["grid", "표로 보기"], ["session", "회차별 체크"]] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
              {label}
            </button>
          ))}
        </div>
        {view === "grid" && <span className="text-xs text-slate-400">칸을 눌러 출석·지각·결석을 고릅니다.</span>}
      </div>

      {view === "grid" ? (
        <AttendanceGrid
          members={members}
          sessions={sessions}
          attBySession={attAll}
          canEdit={canEdit}
          onMark={(appKey, sessionId, status) => void markAt(appKey, sessionId, status)}
          onClear={(appKey, sessionId) => void clearAttendance(sid, sessionId, appKey)}
        />
      ) : (
      <>
      <div className="flex gap-3 text-xs text-slate-500 mb-3">
        <span>출석 {counts.출석}</span>
        <span>지각 {counts.지각}</span>
        <span>결석 {counts.결석}</span>
        <span>미기록 {counts.미기록}</span>
        <span className="ml-auto">{members.length}명</span>
      </div>

      <ul className="grid gap-1.5">
        {members.map((m) => {
          const entry = att[m.id];
          const team = m.teamId ? teamById.get(m.teamId) : undefined;
          return (
            <li key={m.id} className="card flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0 text-sm">
                <span className="font-medium">{m.name}</span>
                <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(m)}</span>
                {scope === "team" && team && !teamFilter && (
                  <span className={`ml-1.5 rounded px-1.5 py-0.5 text-xs ${team.color}`}>{team.name}</span>
                )}
                {scope === "training" && (() => {
                  const trainingClass = m.trainingClassId ? trainingClasses.find((c) => c.id === m.trainingClassId) : undefined;
                  return trainingClass
                    ? <span className={`ml-1.5 rounded px-1.5 py-0.5 text-xs ${trainingClass.color}`}>{trainingClass.name}</span>
                    : <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">반 미정</span>;
                })()}
              </div>
              <div className="flex gap-1">
                {STATUS_BTN.map(({ s, on }) => (
                  <button
                    key={s}
                    onClick={() => void mark(m.id, s)}
                    disabled={!canEdit}
                    aria-label={`${m.name} ${s}`}
                    aria-pressed={entry?.s === s}
                    className={`px-2.5 py-1.5 rounded-md text-xs border font-medium ${
                      entry?.s === s ? on : "border-slate-200 text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
                {entry && canEdit && (
                  <button
                    onClick={() => void clearAttendance(sid, activeSessId, m.id)}
                    aria-label={`${m.name} 기록 지우기`}
                    className="px-1.5 text-xs text-slate-300 hover:text-slate-600"
                  >
                    ⌫
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {members.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            {scope === "training" ? "훈련을 신청한 인원이 없습니다." : "배치된 인원이 없습니다. 배치 탭에서 먼저 배치해주세요."}
          </p>
        )}
      </ul>
      </>
      )}
    </div>
  );
}
