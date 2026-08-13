"use client";
import type { IguardScheduleBlock } from "@/features/iguard/lib/types";
import { buildScheduleOverview, overviewBlockLabel } from "@/features/iguard/lib/scheduleOverview";
import { toMinutes } from "@/features/iguard/lib/scheduleTime";

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
            {grid.rows.map(row => {
              const duration = row.end
                ? Math.max(0, (toMinutes(row.end) ?? 0) - (toMinutes(row.start) ?? 0))
                : 30;
              const rowHeight = Math.max(64, Math.min(180, Math.round(duration * 1.25)));
              return (
              <tr
                key={row.start}
                className="border-b border-slate-200 align-top last:border-b-0"
                style={{ height: `${rowHeight}px` }}
              >
                <th className="bg-slate-50 px-3 py-3 text-left font-mono text-xs text-slate-500">
                  <div>{row.start}</div>
                  {row.end && <div className="mt-1 text-[10px] font-normal text-slate-300">~ {row.end}</div>}
                </th>
                {grid.days.map(day => {
                  if (row.coveredDays.includes(day)) return null;
                  const blocks = row.cells[day];
                  return (
                    <td
                      key={day}
                      rowSpan={row.rowSpans[day]}
                      className="h-px border-l border-slate-200 p-2 align-stretch"
                    >
                      {blocks.length ? (
                        <div className="flex h-full min-h-16 flex-col gap-1.5">
                          {blocks.map(block => (
                            <div key={block.id} className="flex min-h-full flex-1 flex-col justify-center rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
                              <div className="font-semibold text-slate-800">{block.label}</div>
                              <div className="mt-1 font-mono text-xs text-slate-400">{overviewBlockLabel(block).split(" · ")[0]}</div>
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-slate-200">-</span>}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
