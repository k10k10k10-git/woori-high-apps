import { type IguardScheduleBlock } from "@/lib/types";
import { compareBlocks, toMinutes } from "@/lib/scheduleTime";

export type CueTimelinePhase = "before" | "active" | "after" | "unknown";

export interface CueTimelineWindow {
  nextBlock: IguardScheduleBlock | null;
  remainingBlocks: IguardScheduleBlock[];
}

function absoluteStart(block: IguardScheduleBlock): number {
  return (block.day - 1) * 24 * 60 + (toMinutes(block.start) ?? 0);
}

/**
 * 개인 큐카드의 고정 영역과 일반 목록 경계를 계산한다.
 * 현재 블록 다음 하나는 "다음 해야 할 일"로 고정하고, 일반 목록은 그 뒤부터 노출한다.
 */
export function cueTimelineWindow(
  schedule: IguardScheduleBlock[],
  currentBlockId: string | null,
  curDay: number | null,
  currentTime: string,
  phase: CueTimelinePhase,
): CueTimelineWindow {
  const sorted = [...schedule].sort(compareBlocks);
  const currentIndex = currentBlockId ? sorted.findIndex(block => block.id === currentBlockId) : -1;
  let nextIndex = -1;

  if (currentIndex >= 0) {
    nextIndex = currentIndex + 1;
  } else if (curDay != null) {
    const now = (curDay - 1) * 24 * 60 + (toMinutes(currentTime) ?? 0);
    nextIndex = sorted.findIndex(block => absoluteStart(block) > now);
  } else if (phase === "before") {
    nextIndex = sorted.length ? 0 : -1;
  } else if (phase === "unknown") {
    return { nextBlock: null, remainingBlocks: sorted };
  }

  const nextBlock = nextIndex >= 0 && nextIndex < sorted.length ? sorted[nextIndex] : null;
  return {
    nextBlock,
    remainingBlocks: nextBlock ? sorted.slice(nextIndex + 1) : [],
  };
}
