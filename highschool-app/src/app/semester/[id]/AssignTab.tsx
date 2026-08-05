"use client";

// 팀 배치 — 미배정 신청자를 팀에 배정. 지망 칩 표시, 팀별 인원 집계.
// 저장은 신청 문서 단일 경로 update (전체 덮어쓰기 없음).

import { useMemo } from "react";
import { useUI } from "@/context/UIContext";
import { describeApplicant, updateApplication } from "@/features/semester/db";
import { applicantSortKey } from "@/features/semester/applicant";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { Application, Team } from "@/features/semester/types";

interface Props {
  sid: string;
  teams: Team[];
  applications: Application[];
  teamById: Map<string, Team>;
}

function byApplicant(a: Application, b: Application) {
  return applicantSortKey(a).localeCompare(applicantSortKey(b), "ko");
}

export default function AssignTab({ sid, teams, applications, teamById }: Props) {
  const { toast } = useUI();
  const canEdit = useSemesterCanEdit();

  const targets = useMemo(
    () => applications.filter((a) => a.status !== "취소" && !a.trainingOnly),
    [applications],
  );
  const unassigned = targets.filter((a) => !a.teamId);
  const byTeam = useMemo(() => {
    const m = new Map<string, Application[]>();
    for (const t of teams) m.set(t.id, []);
    for (const a of targets) if (a.teamId && m.has(a.teamId)) m.get(a.teamId)!.push(a);
    return m;
  }, [targets, teams]);

  async function assign(app: Application, teamId: string) {
    try {
      await updateApplication(sid, app.id, { teamId, status: teamId ? "배치" : "접수" });
      if (teamId) toast(`${app.name} → ${teamById.get(teamId)?.name ?? ""} 배치`, "success");
    } catch (e) {
      toast(`배치 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  if (teams.length === 0) {
    return <p className="text-sm text-slate-400">먼저 설정 탭에서 팀을 만들어주세요.</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      {/* 미배정 풀 */}
      <section className="card card-body">
        <h3 className="font-semibold text-slate-800">
          미배정 <span className="text-sm text-slate-400">{unassigned.length}명</span>
        </h3>
        {unassigned.length === 0 && <p className="text-sm text-slate-400">모두 배치되었습니다 🎉</p>}
        <ul className="grid gap-1.5">
          {[...unassigned].sort(byApplicant).map((a) => {
            const c1 = a.choice1 ? teamById.get(a.choice1) : undefined;
            const c2 = a.choice2 ? teamById.get(a.choice2) : undefined;
            return (
              <li key={a.id} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {a.name}
                    <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(a)}</span>
                  </span>
                  <select
                    aria-label={`${a.name} 팀 배치`}
                    value=""
                    disabled={!canEdit}
                    onChange={(e) => e.target.value && void assign(a, e.target.value)}
                    className="input h-8 w-28 px-1.5 py-1 text-xs"
                  >
                    <option value="">배치…</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.id === a.choice1 ? " ★1지망" : t.id === a.choice2 ? " ☆2지망" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {(c1 || c2) && (
                  <div className="mt-1 flex gap-1">
                    {c1 && <span className={`rounded px-1.5 py-0.5 text-xs ${c1.color}`}>1지망 {c1.name}</span>}
                    {c2 && <span className={`rounded px-1.5 py-0.5 text-xs ${c2.color}`}>2지망 {c2.name}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {unassigned.length > 0 && canEdit && (
          <button
            onClick={async () => {
              // 1지망 일괄 배치 — 지망이 있는 미배정 전원을 1지망 팀으로
              const withChoice = unassigned.filter((a) => a.choice1);
              for (const a of withChoice) await assign(a, a.choice1!);
              toast(`1지망 일괄 배치 완료 (${withChoice.length}명)`, "success");
            }}
            className="btn-primary w-full justify-center"
          >
            1지망대로 일괄 배치
          </button>
        )}
      </section>

      {/* 팀 칼럼 */}
      <section className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => {
          const members = [...(byTeam.get(t.id) ?? [])].sort(byApplicant);
          return (
            <div key={t.id} className="card overflow-hidden">
              <div className={`px-4 py-2.5 text-sm font-semibold ${t.color}`}>
                {t.name} <span className="font-normal text-slate-600">{members.length}명</span>
              </div>
              <ul className="grid gap-1 p-3">
                {members.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-slate-50">
                    <span>
                      {a.name}
                      <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(a)}</span>
                      {a.choice1 === t.id && <span className="ml-1 text-xs" style={{ color: "var(--color-primary)" }}>★</span>}
                    </span>
                    {canEdit && (
                      <button
                        aria-label={`${a.name} 배치 해제`}
                        onClick={() => void assign(a, "")}
                        className="text-xs text-slate-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
                {members.length === 0 && <li className="px-2 py-1 text-xs text-slate-300">아직 없음</li>}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
