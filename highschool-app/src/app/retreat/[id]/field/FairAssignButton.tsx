"use client";
import { useState } from "react";
import { Group, IguardMeal, IguardSeating } from "@/features/iguard/lib/types";
import { computeFairAssignment, FairResult } from "@/features/iguard/lib/fairAssign";
import { groupDisplayName } from "@/features/iguard/lib/groupNumber";
import { updateIguardMeal, updateIguardSeating } from "@/features/iguard/lib/db";
import { useUI } from "@/context/UIContext";

const groupSort = (a: Group, b: Group) => a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko", { numeric: true });

export default function FairAssignButton({ retreatId, groups, meals, seatings }: {
  retreatId: string; groups: Group[]; meals: IguardMeal[]; seatings: IguardSeating[];
}) {
  const { toast, uiConfirm } = useUI();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FairResult | null>(null);

  async function run() {
    if (groups.length === 0) return toast("조편성 데이터가 없습니다.", "warning");
    if (meals.length === 0 && seatings.length === 0) return toast("식사 세션이나 집회 자리를 먼저 추가해주세요.", "warning");
    const ok = await uiConfirm(
      `식사 ${meals.length}개 + 집회 ${seatings.length}개의 순서·자리를 공정 알고리즘으로 다시 배정합니다.\n기존 순서/구역 배정은 덮어쓰여요. 진행할까요?`
    );
    if (!ok) return;
    setRunning(true);
    try {
      // 실행마다 다른 시작 회전 → 첫 세션부터 섞이고 재실행 시 다른(공정한) 배치
      const seed = Math.floor(Math.random() * Math.max(1, groups.length));
      const r = computeFairAssignment(groups, meals, seatings, seed);
      await Promise.all([
        ...r.meals.map(m => updateIguardMeal(retreatId, m.id, { entries: m.entries })),
        ...r.seatings.map(s => updateIguardSeating(retreatId, s.id, { zones: s.zones })),
      ]);
      setResult(r);
      toast(`공정 배정 완료 - 식사 ${r.counts.meals}개 · 집회 ${r.counts.seatings}개`, "success");
    } catch (e) {
      toast(`배정 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setRunning(false);
    }
  }

  const nameOf = (gid: string) => {
    const g = groups.find(x => x.id === gid);
    return g ? `${g.bu.replace("부", "")} ${groupDisplayName(g, groups)}` : gid;
  };
  const sortedSummary = result
    ? [...result.summary].sort((a, b) => {
        const ga = groups.find(g => g.id === a.groupId), gb = groups.find(g => g.id === b.groupId);
        return ga && gb ? groupSort(ga, gb) : 0;
      })
    : [];
  const fronts = result ? result.summary.map(s => s.mealFront) : [];
  const minF = fronts.length ? Math.min(...fronts) : 0;
  const maxF = fronts.length ? Math.max(...fronts) : 0;

  return (
    <>
      <button onClick={run} disabled={running} className="btn-primary btn-sm">
        {running ? "배정 중…" : "⚖️ 공정 자동배정"}
      </button>

      {result && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 modal-backdrop" onClick={() => setResult(null)}>
          <div className="card p-6 w-full max-w-lg modal-card max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">⚖️ 공정 배정 결과</h3>
              <button onClick={() => setResult(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="mb-4 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-700">
              식사 <strong>{result.counts.meals}</strong>개 · 집회 <strong>{result.counts.seatings}</strong>개 재배정 완료.
              조별 <strong>앞순서 식사 횟수</strong>가 <strong>{minF}~{maxF}회</strong>로 균등하고, <strong>평균 순위</strong>도 조마다 비슷합니다.
              (식사는 평균 순위가 고르도록 모든 끼니를 동등하게 배분하고, 집회 앞자리를 받은 조는 밥에서 뒤로 밀려 연계됩니다)
            </div>
            <table className="w-full text-sm">
              <thead><tr className="table-header">
                <th className="px-2 py-2 text-left">조</th>
                <th className="px-2 py-2 text-center text-emerald-600">식사 앞</th>
                <th className="px-2 py-2 text-center text-slate-500">중간</th>
                <th className="px-2 py-2 text-center text-amber-600">뒤</th>
                <th className="px-2 py-2 text-center">평균순위</th>
                <th className="px-2 py-2 text-center">집회 앞</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sortedSummary.map(s => (
                  <tr key={s.groupId} className="hover:bg-slate-50">
                    <td className="px-2 py-2 font-medium text-slate-800">{nameOf(s.groupId)}</td>
                    <td className="px-2 py-2 text-center text-emerald-600">{s.mealFront}</td>
                    <td className="px-2 py-2 text-center text-slate-500">{s.mealMid}</td>
                    <td className="px-2 py-2 text-center text-amber-600">{s.mealBack}</td>
                    <td className="px-2 py-2 text-center font-medium">{s.avgMealRank}</td>
                    <td className="px-2 py-2 text-center">{s.seatFront}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
