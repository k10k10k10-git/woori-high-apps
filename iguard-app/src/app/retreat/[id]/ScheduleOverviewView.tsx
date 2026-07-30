"use client";
import type { IguardScheduleBlock } from "@/lib/types";
import { buildScheduleOverview, overviewBlockLabel } from "@/lib/scheduleOverview";

export default function ScheduleOverviewView({ schedule }: { schedule: IguardScheduleBlock[] }) {
  const grid = buildScheduleOverview(schedule);
  if (!schedule.length) {
    return <div className="card p-8 text-center text-sm text-slate-400">등록된 시간 블록이 없습니다.</div>;
  }
  return (
    <section>
      <div className="mb-3 rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm text-sky-800">
        일정에서 자동 생성한 전체 개요입니다. 개요를 따로 저장하지 않아 큐싯 수정이 즉시 반영됩니다.
      </div>
      <div className="card overflow-x-auto">
        <table className="min-w-[720px] w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="w-28 border-r border-slate-700 px-3 py-3 text-left">시각</th>
              {grid.days.map(day => (
                <th key={day} className="border-r border-slate-700 px-3 py-3 text-left last:border-r-0">{day}일차</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map(row => (
              <tr key={row.start} className="border-b border-slate-200 align-top last:border-b-0">
                <th className="bg-slate-50 px-3 py-3 text-left font-mono text-xs text-slate-500">{row.start}</th>
                {grid.days.map(day => (
                  <td key={day} className="border-l border-slate-200 px-2 py-2">
                    {row.cells[day].length ? (
                      <div className="space-y-1.5">
                        {row.cells[day].map(block => (
                          <div key={block.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                            <div className="font-semibold text-slate-800">{block.label}</div>
                            <div className="mt-0.5 font-mono text-[11px] text-slate-400">{overviewBlockLabel(block).split(" · ")[0]}</div>
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-slate-200">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
