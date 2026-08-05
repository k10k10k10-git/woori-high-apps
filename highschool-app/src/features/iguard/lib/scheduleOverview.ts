import type { IguardScheduleBlock } from "@/features/iguard/lib/types";
import { compareBlocks, timeRangeLabel, toMinutes } from "@/features/iguard/lib/scheduleTime";

export interface ScheduleOverviewRow {
  start: string;
  end: string | null;
  cells: Record<number, IguardScheduleBlock[]>;
  rowSpans: Record<number, number>;
  coveredDays: number[];
}

export interface ScheduleOverviewGrid {
  days: number[];
  rows: ScheduleOverviewRow[];
}

/** schedule만으로 전체 개요 격자를 만든다. DB에 별도 개요 데이터를 저장하지 않는다. */
export function buildScheduleOverview(schedule: IguardScheduleBlock[]): ScheduleOverviewGrid {
  const days = [...new Set(schedule.map(block => block.day))].sort((a, b) => a - b);
  const starts = new Set(schedule.map(block => block.start));
  const boundaries = [...new Set(schedule.flatMap(block => [block.start, block.end].filter((value): value is string => !!value)))]
    .sort((a, b) => (toMinutes(a) ?? Number.MAX_SAFE_INTEGER) - (toMinutes(b) ?? Number.MAX_SAFE_INTEGER)
      || a.localeCompare(b));
  const rowStarts = boundaries.filter((boundary, index) => index < boundaries.length - 1 || starts.has(boundary));
  const covered = new Map<number, Set<string>>(days.map(day => [day, new Set<string>()]));
  const rows = rowStarts.map((start, rowIndex) => {
    const cells: Record<number, IguardScheduleBlock[]> = {};
    const rowSpans: Record<number, number> = {};
    const coveredDays: number[] = [];
    days.forEach(day => {
      if (covered.get(day)?.has(start)) {
        cells[day] = [];
        rowSpans[day] = 0;
        coveredDays.push(day);
        return;
      }
      cells[day] = schedule
        .filter(block => block.day === day && block.start === start)
        .sort(compareBlocks);
      if (!cells[day].length) {
        rowSpans[day] = 1;
        return;
      }
      const explicitEnds = cells[day]
        .map(block => block.end)
        .filter((value): value is string => !!value)
        .map(value => boundaries.indexOf(value))
        .filter(index => index > rowIndex);
      const nextDayStart = rowStarts.findIndex((candidate, index) =>
        index > rowIndex && schedule.some(block => block.day === day && block.start === candidate),
      );
      const endIndex = explicitEnds.length
        ? Math.max(...explicitEnds)
        : nextDayStart >= 0
          ? nextDayStart
          : rowIndex + 1;
      const span = Math.max(1, endIndex - rowIndex);
      rowSpans[day] = span;
      rowStarts.slice(rowIndex + 1, rowIndex + span).forEach(value => covered.get(day)?.add(value));
    });
    return {
      start,
      end: rowStarts[rowIndex + 1] ?? null,
      cells,
      rowSpans,
      coveredDays,
    };
  });
  return { days, rows };
}

export function overviewBlockLabel(block: IguardScheduleBlock): string {
  return `${timeRangeLabel(block)} · ${block.label}`;
}
