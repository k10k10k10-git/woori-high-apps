import { IguardScheduleBlock } from "./types";
import { compareBlocks, timeRangeLabel, toMinutes } from "./scheduleTime";

export function progressCurrentBlock(schedule: IguardScheduleBlock[]): IguardScheduleBlock | null {
  return schedule
    .filter(block => !!block.actualStart && typeof block.actualStartAt === "number")
    .sort((a, b) => (b.actualStartAt || 0) - (a.actualStartAt || 0))[0] || null;
}

/** 24시+ 블록을 현장 시계(00:xx)로 찍으면 같은 논리 일차의 24:xx로 기록한다. */
export function actualStartForBlock(block: IguardScheduleBlock, clockTime: string): string {
  const planned = toMinutes(block.start);
  const clock = toMinutes(clockTime);
  if (planned == null || clock == null) return clockTime;
  if (planned >= 24 * 60 && clock < 12 * 60) {
    const minutes = clock + 24 * 60;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  return clockTime;
}

export function effectiveBlockTime(
  block: IguardScheduleBlock,
  anchor: IguardScheduleBlock | null,
): { start: string; end?: string; shifted: boolean } {
  if (!anchor?.actualStart) return { start: block.start, end: block.end, shifted: false };
  const sorted = [anchor, block].sort(compareBlocks);
  if (block.id !== anchor.id && sorted[0]?.id !== anchor.id) {
    return { start: block.start, end: block.end, shifted: false };
  }
  const plannedAnchor = toMinutes(anchor.start);
  const actualAnchor = toMinutes(anchor.actualStart);
  const start = toMinutes(block.start);
  if (plannedAnchor == null || actualAnchor == null || start == null) {
    return { start: block.start, end: block.end, shifted: false };
  }
  const delta = actualAnchor - plannedAnchor;
  const fmt = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const end = block.end && block.end !== "~" ? toMinutes(block.end) : null;
  return {
    start: fmt(start + delta),
    end: end == null ? block.end : fmt(end + delta),
    shifted: delta !== 0,
  };
}

export function effectiveTimeRangeLabel(block: IguardScheduleBlock, anchor: IguardScheduleBlock | null): string {
  const effective = effectiveBlockTime(block, anchor);
  return timeRangeLabel({ ...block, start: effective.start, end: effective.end });
}
