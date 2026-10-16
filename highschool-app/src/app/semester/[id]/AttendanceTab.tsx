"use client";

// 출석 체크 — 모바일 최우선(375px). 학생별 [출석/지각/결석] 3버튼.
// ⚠ 토글 아님: 멱등 명시 상태 기록 (같은 버튼 재탭 = 동일 상태 유지, 실수 규칙 11).
// 기록 취소는 별도 '지우기'로만.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Backspace } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import {
  clearAttendance,
  describeApplicant,
  setAttendance,
  subscribeAllAttendance,
  subscribeCompletion,
  subscribeSessionAttendance,
  updateCompletionEntry,
} from "@/features/semester/db";
import AttendanceGrid from "./AttendanceGrid";
import { applicantSortKey } from "@/features/semester/applicant";
import {
  EDITABLE_ATTENDANCE_STATUSES,
  normalizeAttendanceStatus,
  type EditableAttendanceStatus,
} from "@/features/semester/completion";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { completionRoster, semesterRoster, type SemesterRosterScope } from "@/features/semester/roster";
import { sessionDateLabel, sessionIncludesDate } from "@/features/semester/sessionDate";
import { sessionDisplayLabel } from "@/features/semester/sessionKind";
import {
  Application,
  AttendanceByScope,
  CompletionEntry,
  SemesterMeta,
  Session,
  SessionAttendance,
  Team,
  TrainingClass,
} from "@/features/semester/types";
import { useViewMode } from "@/context/ViewModeContext";
import SaveFeedback from "@/components/SaveFeedback";
import { useSaveFeedback } from "@/features/semester/useSaveFeedback";
import LoadFailureNotice from "@/components/LoadFailureNotice";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { createSubscriptionReadinessGate } from "@/lib/subscriptionReadiness";

interface Props {
  sid: string;
  teams: Team[];
  trainingClasses: TrainingClass[];
  sessions: Session[];
  applications: Application[];
  teamById: Map<string, Team>;
  meta: SemesterMeta | null;
  lockedTeamId?: string;
  lockedScope?: SemesterRosterScope;
  operationsBaseHref?: string;
}

const STATUS_STYLE: Record<EditableAttendanceStatus, string> = {
  출석: "bg-green-100 text-green-900 border-green-300",
  지각: "bg-amber-100 text-amber-900 border-amber-300",
  결석: "bg-red-100 text-red-900 border-red-300",
};

const STATUS_BTN = EDITABLE_ATTENDANCE_STATUSES.map((s) => ({ s, on: STATUS_STYLE[s] }));

const EMPTY_ATTENDANCE_BY_SCOPE: AttendanceByScope = { team: {}, training: {} };

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AttendanceTab({ sid, teams, trainingClasses, sessions, applications, teamById, meta, lockedTeamId, lockedScope, operationsBaseHref }: Props) {
  const { user } = useAuth();
  const { toast } = useUI();
  const { isMobileView } = useViewMode();
  const canEdit = useSemesterCanEdit();
  const [sessId, setSessId] = useState<string>("");
  const [teamFilter, setTeamFilter] = useState<string>(lockedTeamId ?? "");
  const [teamFilterSource, setTeamFilterSource] = useState(lockedTeamId);
  if (teamFilterSource !== lockedTeamId) {
    setTeamFilterSource(lockedTeamId);
    setTeamFilter(lockedTeamId ?? "");
  }
  const [classFilter, setClassFilter] = useState<string>("");
  const [scope, setScope] = useState<SemesterRosterScope>(lockedScope ?? "team");
  const [scopeSource, setScopeSource] = useState(lockedScope);
  if (scopeSource !== lockedScope) {
    setScopeSource(lockedScope);
    if (lockedScope) setScope(lockedScope);
  }
  const [sessionAttendance, setSessionAttendance] = useState<{ key: string; values: SessionAttendance }>({
    key: "",
    values: {},
  });
  const [attAllByScope, setAttAllByScope] = useState<AttendanceByScope>(EMPTY_ATTENDANCE_BY_SCOPE);
  const [completion, setCompletion] = useState<Record<string, CompletionEntry>>({});
  const [pickedView, setPickedView] = useState<"grid" | "session" | null>(null);
  const [retry, setRetry] = useState(0);
  const [readySession, setReadySession] = useState("");
  const [readyGrid, setReadyGrid] = useState("");
  const view = pickedView ?? (isMobileView ? "session" : "grid");
  const defaultSessId = useMemo(() => {
    if (sessions.length === 0) return "";
    const today = todayYMD();
    const candidate =
      sessions.find((s) => sessionIncludesDate(s, today)) ??
      sessions.find((s) => s.date >= today) ??
      sessions[sessions.length - 1];
    return candidate.id;
  }, [sessions]);
  const activeSessId = sessions.some((session) => session.id === sessId) ? sessId : defaultSessId;
  const saveFeedback = useSaveFeedback(`${sid}/${scope}/${view === "session" ? activeSessId : "all"}`);
  const activeAttendanceKey = `${sid}/${scope}/${activeSessId}`;
  const att = sessionAttendance.key === activeAttendanceKey ? sessionAttendance.values : {};
  const selectionScope = `${sid}/${scope}/${activeSessId}/${view}/${retry}`;
  const [readVersion, setReadVersion] = useState({ scope: selectionScope, value: 0 });
  if (readVersion.scope !== selectionScope) setReadVersion({ scope: selectionScope, value: readVersion.value + 1 });
  // 같은 주차로 돌아와도 해제 전의 준비 상태를 새 구독에 재사용하지 않는다.
  const readScope = `${selectionScope}/${readVersion.value}`;
  const { errors, fail, ok } = useLoadErrors(readScope);
  const loadError = Object.keys(errors).length > 0;
  const loading = !loadError && (view === "session" ? readySession !== readScope : readyGrid !== readScope);
  const writable = canEdit && !loadError && !loading;

  useEffect(() => {
    if (view !== "session" || !activeSessId) return;
    let active = true;
    const key = `${sid}/${scope}/${activeSessId}`;
    const unsubscribe = subscribeSessionAttendance(sid, scope, activeSessId, (values) => {
      if (active) { setSessionAttendance({ key, values }); setReadySession(readScope); ok("session"); }
    }, (error) => { if (active) fail("session")(error); });
    return () => { active = false; unsubscribe(); };
  }, [sid, scope, activeSessId, view, retry, readScope, fail, ok]);

  // 표 보기는 전 회차를 한 번에 본다 (수료 탭과 같은 경로를 재사용)
  useEffect(() => {
    if (view !== "grid") return;
    let active = true;
    const gate = createSubscriptionReadinessGate(["team", "training", "completion"], () => { if (active) setReadyGrid(readScope); });
    const failed = (key: string) => (error: Error) => { if (active) { fail(key)(error); gate.markReady(key); } };
    const unsubs = [
      subscribeAllAttendance(sid, "team", (values) => {
        if (active) { setAttAllByScope((current) => ({ ...current, team: values })); ok("team"); gate.markReady("team"); }
      }, failed("team")),
      subscribeAllAttendance(sid, "training", (values) => {
        if (active) { setAttAllByScope((current) => ({ ...current, training: values })); ok("training"); gate.markReady("training"); }
      }, failed("training")),
      subscribeCompletion(sid, (values) => { if (active) { setCompletion(values); ok("completion"); gate.markReady("completion"); } }, failed("completion")),
    ];
    return () => { active = false; unsubs.forEach((unsubscribe) => unsubscribe()); };
  }, [sid, view, retry, readScope, fail, ok]);

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
  const completionEligibleByScope = useMemo(() => ({
    team: new Set(completionRoster(applications, "team").map((application) => application.id)),
    training: new Set(completionRoster(applications, "training").map((application) => application.id)),
  }), [applications]);

  async function markAt(appKey: string, sessionId: string, status: EditableAttendanceStatus) {
    if (!writable) return;
    try {
      await saveFeedback.run(`${sessionId}/${appKey}`, () => setAttendance(sid, scope, sessionId, appKey, status, user?.uid, {
        subjectName: applications.find((application) => application.id === appKey)?.name,
        date: sessions.find((item) => item.id === sessionId)?.date,
      }));
    } catch {
      toast("출석을 저장하지 못했습니다. 원하는 상태를 다시 선택해 주세요.", "error");
    }
  }

  async function clearAt(appKey: string, sessionId: string) {
    if (!writable) return;
    try {
      await saveFeedback.run(`${sessionId}/${appKey}`, () => clearAttendance(sid, scope, sessionId, appKey, {
        subjectName: applications.find((application) => application.id === appKey)?.name,
        date: sessions.find((item) => item.id === sessionId)?.date,
      }));
    } catch {
      toast("출석 기록을 지우지 못했습니다. 기록을 확인한 뒤 지우기를 다시 눌러 주세요.", "error");
    }
  }

  const mark = (appKey: string, status: EditableAttendanceStatus) => markAt(appKey, activeSessId, status);

  async function toggleCompletion(appKey: string, field: "certPrinted" | "photoChecked", value: boolean) {
    if (!writable) return;
    try {
      await updateCompletionEntry(sid, appKey, { [field]: value });
    } catch {
      toast("수료 확인을 저장하지 못했습니다. 해당 항목을 다시 선택해 주세요.", "error");
    }
  }

  if (sessions.length === 0) {
    return <div className="team-first-empty is-compact"><p>등록된 회차(모임 날짜)가 없습니다. {operationsBaseHref ? "학기 운영 설정에서 회차를 등록해 주세요." : "담당 교역자 또는 행정팀에 이 학기의 회차 등록을 요청해 주세요."}</p>{operationsBaseHref && <Link className="btn-secondary mt-3" href={`${operationsBaseHref}/settings`}>학기 운영 설정 열기</Link>}</div>;
  }

  const counts = { 출석: 0, 지각: 0, 결석: 0, 미기록: 0 };
  for (const m of members) {
    const e = att[m.id];
    if (e) counts[normalizeAttendanceStatus(e.s)]++;
    else counts.미기록++;
  }

  return (
    <div>
      {loadError && (
        <LoadFailureNotice title="출석 기록을 불러오지 못했습니다" description="표시된 기록은 유지됩니다. 다시 불러온 뒤 출석을 입력해 주세요." onRetry={() => setRetry((value) => value + 1)} />
      )}
      {loading && <p className="save-feedback" aria-live="polite">출석 기록을 불러오는 중입니다…</p>}

      {!lockedTeamId && !lockedScope && <div className="mobile-sticky-controls mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-2">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="출석 명단 구분">
          <button
            role="tab"
            aria-selected={scope === "team"}
            onClick={() => setScope("team")}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${scope === "team" ? "bg-white text-emerald-800 shadow-sm" : "text-emerald-700"}`}
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
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${scope === "training" ? "bg-white text-emerald-800 shadow-sm" : "text-emerald-700"}`}
          >
            훈련 출석부 <span className="ml-1 text-xs">{semesterRoster(applications, "training").length}명</span>
          </button>
        </div>
      </div>}

      {/* .input은 레이어 밖 규칙(width:100%)이라 유틸리티 w-*를 이긴다 → 폭은 감싼 div로 준다.
          높이도 h-*로 고정하지 않는다(모바일 16px 글꼴에서 글자 아랫부분이 잘렸다). */}
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:max-w-2xl">
        {view === "session" && <div>
          <select
            aria-label="주차 선택"
            value={activeSessId}
            onChange={(e) => {
              setSessId(e.target.value);
            }}
            className="input text-sm"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {sessionDateLabel(s)} · {sessionDisplayLabel(s)}
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
        {scope === "team" && !lockedTeamId && (
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
          이 날은 휴강입니다. 주차 번호와 출석 집계(만점)에서 제외됩니다.
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="출석 보기 방식">
          {([["grid", "표로 보기"], ["session", "주차별 체크"]] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => setPickedView(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
              {label}
            </button>
          ))}
        </div>
        {canEdit && <SaveFeedback state={saveFeedback.state} idleLabel="선택하면 자동 저장" errorLabel="저장 실패 · 원하는 출석 상태나 지우기를 다시 선택해 주세요" />}
      </div>

      {view === "grid" ? (
        <AttendanceGrid
          members={members}
          sessions={sessions}
          scope={scope}
          attendanceByScope={attAllByScope}
          completionEligibleByScope={completionEligibleByScope}
          canEdit={writable}
          completion={completion}
          completionMinRate={meta?.completionRule?.minRate ?? 0.7}
          onMark={(appKey, sessionId, status) => void markAt(appKey, sessionId, status)}
          onClear={(appKey, sessionId) => void clearAt(appKey, sessionId)}
          onToggleCompletion={(appKey, field, value) => void toggleCompletion(appKey, field, value)}
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
                    disabled={!writable}
                    aria-label={`${m.name} ${s}`}
                    aria-pressed={entry ? normalizeAttendanceStatus(entry.s) === s : false}
                    className={`px-2.5 py-1.5 rounded-md text-xs border font-medium ${
                      entry && normalizeAttendanceStatus(entry.s) === s ? on : "attendance-status-choice"
                    }`}
                  >
                    {s}
                  </button>
                ))}
                {entry && canEdit && (
                  <button
                    onClick={() => void clearAt(m.id, activeSessId)}
                    disabled={!writable}
                    aria-label={`${m.name} 기록 지우기`}
                    className="compact-icon-control text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Backspace aria-hidden="true" size={17} weight="bold" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {members.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-600">
            <p>{scope === "training" ? "선택한 조건에 맞는 훈련 명단이 없습니다." : "선택한 조건에 맞는 사역팀 명단이 없습니다."} {operationsBaseHref ? "검색 조건과 학기 배치를 확인해 주세요." : "필터를 확인하고, 명단이 계속 보이지 않으면 담당 교역자 또는 행정팀에 학기 배치를 확인해 달라고 요청하세요."}</p>
            {operationsBaseHref && <Link className="btn-secondary mt-3" href={`${operationsBaseHref}/placements`}>학기 배치 확인하기</Link>}
          </li>
        )}
      </ul>
      </>
      )}
    </div>
  );
}
