"use client";
import { useMemo, useState } from "react";
import { IguardStaff, IguardScheduleBlock, IguardPost, AssignedIguardMovement } from "@/features/iguard/lib/types";

interface Props {
  staff: IguardStaff[];
  schedule: IguardScheduleBlock[];
  posts: IguardPost[];
  movements: AssignedIguardMovement[];
}

export default function MovementsView({ staff, schedule, posts, movements }: Props) {
  const days = useMemo(() => [...new Set(schedule.map(b => b.day))].sort((a, b) => a - b), [schedule]);
  const [day, setDay] = useState<number>(days[0] ?? 1);

  const moveMap = useMemo(() => {
    const m = new Map<string, AssignedIguardMovement>();
    movements.forEach(mv => m.set(`${mv.staffId}__${mv.blockId}`, mv));
    return m;
  }, [movements]);

  const postMap = useMemo(() => {
    const m = new Map<string, IguardPost>();
    posts.forEach(p => m.set(p.id, p));
    return m;
  }, [posts]);

  const postLabel = (id: string) => {
    const p = postMap.get(id);
    return p ? (p.area ? `[${p.area}] ${p.name}` : p.name) : "?";
  };

  const cols = schedule.filter(b => b.day === day);

  if (staff.length === 0 || schedule.length === 0) return (
    <div className="card p-8 text-center text-slate-400">
      <div className="text-3xl mb-2">🧭</div>
      <p>먼저 <strong>스탭</strong>과 <strong>스탭 전체 큐싯</strong>을 등록해주세요.</p>
    </div>
  );

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {days.map(d => (
          <button key={d} onClick={() => setDay(d)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${day === d ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{d}일차</button>
        ))}
      </div>

      <div className="card max-h-[72vh] overflow-auto">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="table-header">
              <th scope="col" className="sticky left-0 top-0 z-30 min-w-[104px] bg-slate-50 px-3 py-2 text-left shadow-[1px_0_0_#e2e8f0] sm:min-w-[120px]">스탭 \ 시간</th>
              {cols.map(b => (
                <th scope="col" key={b.id} className="min-w-[138px] border-l border-slate-100 bg-slate-50 px-2 py-2 text-left align-bottom sm:min-w-[150px]">
                  <div className="text-[11px] text-slate-400 font-mono">{b.start}</div>
                  <div className="text-xs">{b.label}{b.meal && " 🍚"}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map(s => (
              <tr key={s.id} className="hover:bg-slate-50/50">
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-slate-800 shadow-[1px_0_0_#e2e8f0]">{s.name}</th>
                {cols.map(b => {
                  const mv = moveMap.get(`${s.id}__${b.id}`);
                  return (
                    <td key={b.id} className={`px-2 py-2 border-l border-slate-100 text-xs ${mv ? "text-slate-800" : "text-slate-200"}`}>
                      <div className="mb-1 text-[10px] font-mono text-slate-300 sm:hidden">{b.start} · {b.label}</div>
                      {mv ? (
                        <div>
                          <div className={`font-medium ${mv ? "text-emerald-700" : ""}`}>{postLabel(mv.postId)}</div>
                          {mv.round && (
                            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] ${mv.round === "선밥" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{mv.round}</span>
                          )}
                          {mv.note && <div className="text-[11px] text-slate-500 mt-0.5 truncate">• {mv.note}</div>}
                        </div>
                      ) : "-"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
