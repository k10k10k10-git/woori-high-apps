"use client";

// 수료 현황 — 출석 점수 자동 합산(출석2/지각1) → 수료 자동 판정 + 수료증 제작 체크리스트.
// 수료 여부는 항상 calcCompletion으로 계산 (DB에 판정 저장 안 함 — 이중 원장 방지).

import { useEffect, useMemo, useState } from "react";
import { useUI } from "@/context/UIContext";
import { describeApplicant, subscribeAllAttendance, subscribeCompletion, updateCompletionEntry } from "@/features/semester/db";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { calcCompletion } from "@/features/semester/completion";
import { Application, CompletionEntry, SemesterMeta, Session, SessionAttendance, Team } from "@/features/semester/types";

interface Props {
  sid: string;
  meta: SemesterMeta | null;
  sessions: Session[];
  applications: Application[];
  teamById: Map<string, Team>;
}

export default function CompletionTab({ sid, meta, sessions, applications, teamById }: Props) {
  const { toast } = useUI();
  const canEdit = useSemesterCanEdit();
  const [attBySession, setAttBySession] = useState<Record<string, SessionAttendance>>({});
  const [checklist, setChecklist] = useState<Record<string, CompletionEntry>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fail = (e: Error) => setLoadError(e.message);
    const u1 = subscribeAllAttendance(sid, setAttBySession, fail);
    const u2 = subscribeCompletion(sid, setChecklist, fail);
    return () => {
      u1();
      u2();
    };
  }, [sid]);

  const minRate = meta?.completionRule?.minRate ?? 0.7;

  const rows = useMemo(
    () =>
      applications
        .filter((a) => a.status !== "취소" && !a.trainingOnly && a.teamId)
        .map((a) => ({
          app: a,
          result: calcCompletion(a.id, sessions, attBySession, minRate),
          check: checklist[a.id] ?? {},
        }))
        .sort((x, y) => {
          const tx = teamById.get(x.app.teamId!)?.order ?? 99;
          const ty = teamById.get(y.app.teamId!)?.order ?? 99;
          return tx - ty || y.result.rate - x.result.rate;
        }),
    [applications, sessions, attBySession, checklist, minRate, teamById],
  );

  async function toggleCheck(appKey: string, field: "certPrinted" | "photoChecked", value: boolean) {
    try {
      await updateCompletionEntry(sid, appKey, { [field]: value });
    } catch (e) {
      toast(`저장 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  const completedCount = rows.filter((r) => r.result.completed).length;

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-emerald-900">
          수료 {completedCount} / {rows.length}명
        </span>
        <span className="text-slate-500">
          기준: 출석점수 {Math.round(minRate * 100)}% 이상 (출석2·지각1, 휴강 제외 — 설정에서 변경)
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th>이름</th>
              <th>팀</th>
              <th className="text-right">점수</th>
              <th className="text-right">출석률</th>
              <th className="text-center">판정</th>
              <th className="text-center">수료증</th>
              <th className="text-center">사진</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ app, result, check }) => {
              const team = teamById.get(app.teamId!);
              return (
                <tr key={app.id} className="border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
                  <td className="px-3 py-2">
                    {app.name}
                    <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(app)}</span>
                  </td>
                  <td className="px-3 py-2">
                    {team && <span className={`text-xs px-1.5 py-0.5 rounded ${team.color}`}>{team.name}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {result.score}/{result.maxScore}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(result.rate * 100)}%</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        result.completed ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {result.completed ? "수료" : "미수료"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${app.name} 수료증 제작`}
                      disabled={!canEdit}
                      checked={check.certPrinted ?? false}
                      onChange={(e) => void toggleCheck(app.id, "certPrinted", e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${app.name} 사진 확인`}
                      disabled={!canEdit}
                      checked={check.photoChecked ?? false}
                      onChange={(e) => void toggleCheck(app.id, "photoChecked", e.target.checked)}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  배치된 인원이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
