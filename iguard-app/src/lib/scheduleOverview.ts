import type { IguardScheduleBlock } from "@/lib/types";
import { compareBlocks, timeRangeLabel, toMinutes } from "@/lib/scheduleTime";

export interface ScheduleOverviewRow {
  start: string;
  cells: Record<number, IguardScheduleBlock[]>;
}

export interface ScheduleOverviewGrid {
  days: number[];
  rows: ScheduleOverviewRow[];
}

/** schedule만으로 전체 개요 격자를 만든다. DB에 별도 개요 데이터를 저장하지 않는다. */
export function buildScheduleOverview(schedule: IguardScheduleBlock[]): ScheduleOverviewGrid {
  const days = [...new Set(schedule.map(block => block.day))].sort((a, b) => a - b);
  const starts = [...new Set(schedule.map(block => block.start))]
    .sort((a, b) => (toMinutes(a) ?? Number.MAX_SAFE_INTEGER) - (toMinutes(b) ?? Number.MAX_SAFE_INTEGER)
      || a.localeCompare(b));
  const rows = starts.map(start => {
    const cells: Record<number, IguardScheduleBlock[]> = {};
    days.forEach(day => {
      cells[day] = schedule
        .filter(block => block.day === day && block.start === start)
        .sort(compareBlocks);
    });
    return { start, cells };
  });
  return { days, rows };
}

export function overviewBlockLabel(block: IguardScheduleBlock): string {
  return `${timeRangeLabel(block)} · ${block.label}`;
}
