"use client";

// 팀별 커리큘럼 — 회차 × 계획. "00팀" Docs 템플릿의 웹 버전 (blur 시 저장).

import { useEffect, useState } from "react";
import { useUI } from "@/context/UIContext";
import { subscribeCurriculum, updateCurriculumEntry, updateTeam } from "@/features/semester/db";
import { sessionDisplayLabel } from "@/features/semester/sessionKind";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { CurriculumEntry, Session, Team, TrainingClass } from "@/features/semester/types";

interface Props {
  sid: string;
  teams: Team[];
  trainingClasses: TrainingClass[];
  sessions: Session[];
}

export default function CurriculumTab({ sid, teams, trainingClasses, sessions }: Props) {
  const { toast } = useUI();
  const canEdit = useSemesterCanEdit();
  // 사역팀과 훈련 반은 같은 curriculum/{id} 맵을 쓴다 (id가 서로 겹치지 않는다)
  const [scope, setScope] = useState<"team" | "training">("team");
  const [teamId, setTeamId] = useState<string>("");
  const [entries, setEntries] = useState<Record<string, CurriculumEntry>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [goalDraft, setGoalDraft] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const groups = scope === "team" ? teams : trainingClasses;
  const activeTeamId = groups.some((group) => group.id === teamId) ? teamId : groups[0]?.id ?? "";

  useEffect(() => {
    if (!activeTeamId) return;
    return subscribeCurriculum(sid, activeTeamId, setEntries, (e) => setLoadError(e.message));
  }, [sid, activeTeamId]);

  const activeTeam = groups.find((group) => group.id === activeTeamId);

  async function saveGoal() {
    if (goalDraft === null || !activeTeam || scope !== "team") return;
    const goal = goalDraft.trim();
    setGoalDraft(null);
    if (goal === (("goal" in activeTeam ? activeTeam.goal : "") ?? "")) return;
    try {
      await updateTeam(sid, activeTeam.id, { goal });
      toast("팀 목표를 저장했습니다", "success");
    } catch (e) {
      toast(`목표 저장 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function save(sessId: string) {
    const draft = drafts[sessId];
    if (draft === undefined || draft === (entries[sessId]?.plan ?? "")) return;
    try {
      await updateCurriculumEntry(sid, activeTeamId, sessId, { plan: draft });
      toast("저장됨", "success");
    } catch (e) {
      toast(`저장 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  if (sessions.length === 0) return <p className="text-sm text-slate-400">먼저 설정 탭에서 회차를 등록해주세요.</p>;

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-2">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="커리큘럼 구분">
          {([["team", `사역팀 ${teams.length}개`], ["training", `훈련 ${trainingClasses.length}개`]] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={scope === key}
              onClick={() => { setScope(key); setTeamId(""); setDrafts({}); setGoalDraft(null); }}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${scope === key ? "bg-white text-emerald-800 shadow-sm" : "text-emerald-700/70"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-slate-400">
          {scope === "team" ? "먼저 설정 탭에서 사역팀을 만들어주세요." : "먼저 설정 탭의 훈련 관리에서 반을 만들어주세요."}
        </p>
      ) : (
      <>
      <div role="tablist" aria-label={scope === "team" ? "사역팀 선택" : "훈련 반 선택"} className="flex gap-1 overflow-x-auto mb-4">
        {groups.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTeamId === t.id}
            onClick={() => {
              setDrafts({});
              setGoalDraft(null);
              setTeamId(t.id);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
              activeTeamId === t.id ? t.color + " font-medium" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {activeTeam && scope === "team" && (
        <section className="card card-body mb-4">
          <div>
            <h3 className="font-semibold text-slate-800">{activeTeam.name} · 이번 학기 목표</h3>
            <p className="mt-0.5 text-xs text-slate-400">한 학기 동안 이 팀이 무엇을 이루려는지 적어두면 회차 계획의 기준이 됩니다.</p>
          </div>
          <textarea
            aria-label={`${activeTeam.name} 이번 학기 목표`}
            disabled={!canEdit}
            value={goalDraft ?? ("goal" in activeTeam ? activeTeam.goal : "") ?? ""}
            onChange={(e) => setGoalDraft(e.target.value)}
            onBlur={() => void saveGoal()}
            rows={3}
            placeholder="예: 매주 예배 셋팅을 학생 스스로 준비할 수 있게 한다"
            className="input text-sm"
          />
        </section>
      )}

      <ul className="grid gap-3 lg:grid-cols-2">
        {sessions.map((s, i) => (
          <li key={s.id} className="card p-4">
            <div className="flex items-center gap-2 mb-1.5 text-sm">
              <span className="font-semibold">{i + 1}회차</span>
              <span className="text-slate-400">{s.date}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs ${s.type === "휴강" ? "bg-yellow-100 text-yellow-800" : "bg-slate-100 text-slate-600"}`}>
                {sessionDisplayLabel(s)}
              </span>
            </div>
            <textarea
              aria-label={`${s.date} 계획`}
              disabled={!canEdit}
              value={drafts[s.id] ?? entries[s.id]?.plan ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
              onBlur={() => void save(s.id)}
              rows={4}
              placeholder="모임 계획 (예: 아이스 브레이킹, 예배당 셋팅)"
              className="input text-sm"
            />
          </li>
        ))}
      </ul>
      </>
      )}
    </div>
  );
}
