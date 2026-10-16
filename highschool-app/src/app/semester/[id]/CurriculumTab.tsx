"use client";

// 팀별 커리큘럼 — 회차 × 계획. "00팀" Docs 템플릿의 웹 버전 (blur 시 저장).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUI } from "@/context/UIContext";
import { subscribeCurriculum, updateCurriculumEntry, updateTeam } from "@/features/semester/db";
import { sessionDisplayLabel, sessionWeekLabel } from "@/features/semester/sessionKind";
import { sessionDateLabel } from "@/features/semester/sessionDate";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { CurriculumEntry, Session, Team, TrainingClass } from "@/features/semester/types";
import SaveFeedback from "@/components/SaveFeedback";
import { useSaveFeedback } from "@/features/semester/useSaveFeedback";
import LoadFailureNotice from "@/components/LoadFailureNotice";

interface Props {
  sid: string;
  teams: Team[];
  trainingClasses: TrainingClass[];
  sessions: Session[];
  lockedTeamId?: string;
  lockedScope?: "team" | "training";
  operationsBaseHref?: string;
}

export default function CurriculumTab({ sid, teams, trainingClasses, sessions, lockedTeamId, lockedScope, operationsBaseHref }: Props) {
  const { toast } = useUI();
  const canEdit = useSemesterCanEdit();
  // 사역팀과 훈련 반은 같은 curriculum/{id} 맵을 쓴다 (id가 서로 겹치지 않는다)
  const [scope, setScope] = useState<"team" | "training">(lockedScope ?? "team");
  const [scopeSource, setScopeSource] = useState(lockedScope);
  if (scopeSource !== lockedScope) {
    setScopeSource(lockedScope);
    if (lockedScope) setScope(lockedScope);
  }
  const [teamId, setTeamId] = useState<string>(lockedTeamId ?? "");
  const [teamSource, setTeamSource] = useState(lockedTeamId);
  if (teamSource !== lockedTeamId) {
    setTeamSource(lockedTeamId);
    setTeamId(lockedTeamId ?? "");
  }
  const [curriculum, setCurriculum] = useState<{ key: string; entries: Record<string, CurriculumEntry>; error: boolean } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const groups = scope === "team"
    ? (lockedTeamId ? teams.filter((team) => team.id === lockedTeamId) : teams)
    : trainingClasses;
  const activeTeamId = groups.some((group) => group.id === teamId) ? teamId : groups[0]?.id ?? "";
  const editorKey = `${sid}/${scope}/${activeTeamId}`;
  const saveFeedback = useSaveFeedback(editorKey);
  const activeGoalDraft = goalDrafts[editorKey] ?? null;
  const entries = curriculum?.key === editorKey ? curriculum.entries : {};
  const loadError = curriculum?.key === editorKey && curriculum.error;
  const loaded = curriculum?.key === editorKey && !curriculum.error;

  useEffect(() => {
    if (!activeTeamId) return;
    let active = true;
    const unsubscribe = subscribeCurriculum(sid, activeTeamId, (next) => {
      if (!active) return;
      setCurriculum({ key: editorKey, entries: next, error: false });
    }, () => {
      if (active) setCurriculum((current) => ({ key: editorKey, entries: current?.key === editorKey ? current.entries : {}, error: true }));
    });
    return () => { active = false; unsubscribe(); };
  }, [sid, activeTeamId, editorKey, retry]);

  const activeTeam = groups.find((group) => group.id === activeTeamId);

  async function saveGoal() {
    if (!loaded || !canEdit || saveFeedback.stateFor("goal") === "saving" || activeGoalDraft === null || !activeTeam || scope !== "team") return;
    const goal = activeGoalDraft.trim();
    if (goal === (("goal" in activeTeam ? activeTeam.goal : "") ?? "")) {
      setGoalDrafts((current) => { const next = { ...current }; delete next[editorKey]; return next; });
      saveFeedback.reset("goal");
      return;
    }
    try {
      await saveFeedback.run("goal", () => updateTeam(sid, activeTeam.id, { goal }));
      setGoalDrafts((current) => {
        if (current[editorKey] !== activeGoalDraft) return current;
        const next = { ...current }; delete next[editorKey]; return next;
      });
      toast("팀 목표를 저장했습니다", "success");
    } catch {
      toast("팀 목표를 저장하지 못했습니다. 입력은 유지되어 있으니 다시 저장해 주세요.", "error");
    }
  }

  async function save(sessId: string) {
    if (!loaded || !canEdit || saveFeedback.stateFor(sessId) === "saving") return;
    const draft = drafts[`${editorKey}/${sessId}`];
    if (draft === undefined || draft === (entries[sessId]?.plan ?? "")) {
      saveFeedback.reset(sessId);
      return;
    }
    try {
      await saveFeedback.run(sessId, () => updateCurriculumEntry(sid, activeTeamId, sessId, { plan: draft }));
      // 구독의 낙관적 응답은 서버 확정이 아니다. 저장 성공 뒤 같은 초안만 정리한다.
      setDrafts((current) => {
        const key = `${editorKey}/${sessId}`;
        if (current[key] !== draft) return current;
        const next = { ...current }; delete next[key]; return next;
      });
      toast("저장됨", "success");
    } catch {
      toast("계획을 저장하지 못했습니다. 입력은 유지되어 있으니 다시 저장해 주세요.", "error");
    }
  }

  if (sessions.length === 0) return <div className="team-first-empty is-compact"><p>등록된 회차(모임 날짜)가 없습니다. {operationsBaseHref ? "학기 운영 설정에서 회차를 등록해 주세요." : "담당 교역자 또는 행정팀에 이 학기의 회차 등록을 요청해 주세요."}</p>{operationsBaseHref && <Link className="btn-secondary mt-3" href={`${operationsBaseHref}/settings`}>학기 운영 설정 열기</Link>}</div>;

  return (
    <div>
      {loadError && (
        <LoadFailureNotice title="커리큘럼을 불러오지 못했습니다" description="작성 중인 입력은 유지됩니다. 다시 불러온 뒤 이어서 저장해 주세요." onRetry={() => setRetry((value) => value + 1)} />
      )}

      {!lockedTeamId && !lockedScope && <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-2">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="커리큘럼 구분">
          {([["team", `사역팀 ${teams.length}개`], ["training", `훈련 ${trainingClasses.length}개`]] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={scope === key}
              onClick={() => { setScope(key); setTeamId(""); }}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${scope === key ? "bg-white text-emerald-800 shadow-sm" : "text-emerald-700"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>}

      {groups.length === 0 ? (
        <div className="team-first-empty is-compact">
          <p>{scope === "team" ? "이 학기에 등록된 사역팀이 없습니다." : "이 학기에 등록된 훈련반이 없습니다."} {operationsBaseHref ? "학기 운영 설정에서 등록해 주세요." : "담당 교역자 또는 행정팀에 학기 설정을 확인해 달라고 요청하세요."}</p>
          {operationsBaseHref && <Link className="btn-secondary mt-3" href={`${operationsBaseHref}/settings`}>학기 운영 설정 열기</Link>}
        </div>
      ) : (
      <>
      {canEdit && <p className="save-feedback">입력 칸을 벗어나면 자동 저장</p>}
      {!lockedTeamId && <div role="tablist" aria-label={scope === "team" ? "사역팀 선택" : "훈련 반 선택"} className="flex gap-1 overflow-x-auto mb-4">
        {groups.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTeamId === t.id}
            onClick={() => {
              setTeamId(t.id);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
              activeTeamId === t.id ? t.color + " font-medium" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>}

      {!loaded && !loadError && <p role="status" className="save-feedback">커리큘럼을 불러오는 중입니다…</p>}

      {activeTeam && scope === "team" && (
        <section className="card card-body mb-4">
          <div>
            <h3 className="font-semibold text-slate-800">{activeTeam.name} · 이번 학기 목표</h3>
            <p className="mt-0.5 text-xs text-slate-400">한 학기 동안 이 팀이 무엇을 이루려는지 적어두면 회차 계획의 기준이 됩니다.</p>
          </div>
          <textarea
            aria-label={`${activeTeam.name} 이번 학기 목표`}
            disabled={!canEdit || !loaded || saveFeedback.stateFor("goal") === "saving"}
            value={activeGoalDraft ?? ("goal" in activeTeam ? activeTeam.goal : "") ?? ""}
            onChange={(e) => { setGoalDrafts((current) => ({ ...current, [editorKey]: e.target.value })); saveFeedback.markDirty("goal"); }}
            onBlur={() => void saveGoal()}
            rows={3}
            placeholder="예: 매주 예배 셋팅을 학생 스스로 준비할 수 있게 한다"
            className="input text-sm"
          />
          {canEdit && saveFeedback.stateFor("goal") !== "idle" && <SaveFeedback state={saveFeedback.stateFor("goal")} idleLabel="" />}
          {canEdit && saveFeedback.stateFor("goal") === "error" && <button type="button" disabled={!loaded} className="btn-secondary" onClick={() => void saveGoal()}>팀 목표 다시 저장</button>}
        </section>
      )}

      <ul className="grid gap-3 lg:grid-cols-2">
        {sessions.map((s, i) => (
          <li key={s.id} className="card p-4">
            <div className="flex items-center gap-2 mb-1.5 text-sm">
              <span className="font-semibold">{sessionWeekLabel(sessions, i)}</span>
              <span className="text-slate-400">{sessionDateLabel(s)}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs ${s.type === "휴강" ? "bg-yellow-100 text-yellow-800" : "bg-slate-100 text-slate-600"}`}>
                {sessionDisplayLabel(s)}
              </span>
            </div>
            <textarea
              aria-label={`${sessionDateLabel(s)} 계획`}
              disabled={!canEdit || !loaded || saveFeedback.stateFor(s.id) === "saving"}
              value={drafts[`${editorKey}/${s.id}`] ?? entries[s.id]?.plan ?? ""}
              onChange={(e) => { setDrafts((d) => ({ ...d, [`${editorKey}/${s.id}`]: e.target.value })); saveFeedback.markDirty(s.id); }}
              onBlur={() => void save(s.id)}
              rows={4}
              placeholder="모임 계획 (예: 아이스 브레이킹, 예배당 셋팅)"
              className="input text-sm"
            />
            {canEdit && saveFeedback.stateFor(s.id) !== "idle" && <SaveFeedback state={saveFeedback.stateFor(s.id)} idleLabel="" />}
            {canEdit && saveFeedback.stateFor(s.id) === "error" && <button type="button" disabled={!loaded} className="btn-secondary" onClick={() => void save(s.id)} aria-label={`${sessionDateLabel(s)} 계획 다시 저장`}>계획 다시 저장</button>}
          </li>
        ))}
      </ul>
      </>
      )}
    </div>
  );
}
