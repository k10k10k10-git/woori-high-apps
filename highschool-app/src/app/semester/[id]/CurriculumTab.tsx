"use client";

// 팀별 커리큘럼 — 회차 × 계획. "00팀" Docs 템플릿의 웹 버전 (blur 시 저장).

import { useEffect, useState } from "react";
import { useUI } from "@/context/UIContext";
import { subscribeCurriculum, updateCurriculumEntry } from "@/features/semester/db";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { CurriculumEntry, Session, Team } from "@/features/semester/types";

interface Props {
  sid: string;
  teams: Team[];
  sessions: Session[];
}

export default function CurriculumTab({ sid, teams, sessions }: Props) {
  const { toast } = useUI();
  const canEdit = useSemesterCanEdit();
  const [teamId, setTeamId] = useState<string>("");
  const [entries, setEntries] = useState<Record<string, CurriculumEntry>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const activeTeamId = teams.some((team) => team.id === teamId) ? teamId : teams[0]?.id ?? "";

  useEffect(() => {
    if (!activeTeamId) return;
    return subscribeCurriculum(sid, activeTeamId, setEntries, (e) => setLoadError(e.message));
  }, [sid, activeTeamId]);

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

  if (teams.length === 0) return <p className="text-sm text-slate-400">먼저 설정 탭에서 팀을 만들어주세요.</p>;
  if (sessions.length === 0) return <p className="text-sm text-slate-400">먼저 설정 탭에서 회차를 등록해주세요.</p>;

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      <div role="tablist" aria-label="팀 선택" className="flex gap-1 overflow-x-auto mb-4">
        {teams.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTeamId === t.id}
            onClick={() => {
              setDrafts({});
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

      <ul className="grid gap-3 lg:grid-cols-2">
        {sessions.map((s, i) => (
          <li key={s.id} className="card p-4">
            <div className="flex items-center gap-2 mb-1.5 text-sm">
              <span className="font-semibold">{i + 1}회차</span>
              <span className="text-slate-400">{s.date}</span>
              {s.label && <span className="text-xs rounded bg-slate-100 px-1.5 py-0.5">{s.label}</span>}
              {s.type !== "정규" && (
                <span className="text-xs bg-yellow-100 text-yellow-800 rounded px-1.5 py-0.5">{s.type}</span>
              )}
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
    </div>
  );
}
