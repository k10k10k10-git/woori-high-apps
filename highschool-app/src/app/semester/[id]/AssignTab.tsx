"use client";

// 팀 배치 — 미배정 신청자를 팀에 배정. 지망 칩 표시, 팀별 인원 집계.
// 저장은 신청 문서 단일 경로 update (전체 덮어쓰기 없음).

import { useMemo } from "react";
import { useUI } from "@/context/UIContext";
import { updateApplication } from "@/features/semester/db";
import { Application, Team } from "@/features/semester/types";

interface Props {
  sid: string;
  teams: Team[];
  applications: Application[];
  teamById: Map<string, Team>;
}

export default function AssignTab({ sid, teams, applications, teamById }: Props) {
  const { toast } = useUI();

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
    return <p className="text-sm text-gray-400">먼저 설정 탭에서 팀을 만들어주세요.</p>;
  }

  return (
    <div className="grid lg:grid-cols-[1fr_2fr] gap-4">
      {/* 미배정 풀 */}
      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold mb-3">
          미배정 <span className="text-sm text-gray-400">{unassigned.length}명</span>
        </h3>
        {unassigned.length === 0 && <p className="text-sm text-gray-400">모두 배치되었습니다 🎉</p>}
        <ul className="grid gap-1.5">
          {unassigned
            .sort((a, b) => a.bu.localeCompare(b.bu) || a.grade - b.grade || a.class - b.class)
            .map((a) => {
              const c1 = a.choice1 ? teamById.get(a.choice1) : undefined;
              const c2 = a.choice2 ? teamById.get(a.choice2) : undefined;
              return (
                <li key={a.id} className="border border-gray-200 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {a.name}
                      <span className="text-xs text-gray-400 ml-1.5">
                        {a.bu} {a.grade}-{a.class}
                      </span>
                    </span>
                    <select
                      aria-label={`${a.name} 팀 배치`}
                      value=""
                      onChange={(e) => e.target.value && void assign(a, e.target.value)}
                      className="text-xs border border-gray-300 rounded-md px-1.5 py-1"
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
                    <div className="flex gap-1 mt-1">
                      {c1 && <span className={`text-xs px-1.5 py-0.5 rounded ${c1.color}`}>1지망 {c1.name}</span>}
                      {c2 && <span className={`text-xs px-1.5 py-0.5 rounded ${c2.color}`}>2지망 {c2.name}</span>}
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
        {unassigned.length > 0 && (
          <button
            onClick={async () => {
              // 1지망 일괄 배치 — 지망이 있는 미배정 전원을 1지망 팀으로
              const withChoice = unassigned.filter((a) => a.choice1);
              for (const a of withChoice) await assign(a, a.choice1!);
              toast(`1지망 일괄 배치 완료 (${withChoice.length}명)`, "success");
            }}
            className="mt-3 w-full py-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-sm font-medium"
          >
            1지망대로 일괄 배치
          </button>
        )}
      </section>

      {/* 팀 칼럼 */}
      <section className="grid sm:grid-cols-2 gap-3">
        {teams.map((t) => {
          const members = (byTeam.get(t.id) ?? []).sort(
            (a, b) => a.bu.localeCompare(b.bu) || a.grade - b.grade || a.class - b.class,
          );
          return (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className={`px-4 py-2.5 font-semibold text-sm ${t.color}`}>
                {t.name} <span className="font-normal text-gray-600">{members.length}명</span>
              </div>
              <ul className="p-3 grid gap-1">
                {members.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-gray-50">
                    <span>
                      {a.name}
                      <span className="text-xs text-gray-400 ml-1.5">
                        {a.bu} {a.grade}-{a.class}
                      </span>
                      {a.choice1 === t.id && <span className="text-xs text-blue-500 ml-1">★</span>}
                    </span>
                    <button
                      aria-label={`${a.name} 배치 해제`}
                      onClick={() => void assign(a, "")}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </li>
                ))}
                {members.length === 0 && <li className="text-xs text-gray-300 px-2 py-1">아직 없음</li>}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
