"use client";

import { useState } from "react";

export type SaveFeedbackState = "idle" | "dirty" | "saving" | "saved" | "error";
type Entry = { pending: number; failed: boolean; dirty: boolean };

export function useSaveFeedback(scope: string) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const prefix = `${scope}\u0000`;
  const stateOf = (values: Entry[]): SaveFeedbackState => values.some((entry) => entry.pending > 0) ? "saving"
    : values.some((entry) => entry.failed) ? "error"
      : values.some((entry) => entry.dirty) ? "dirty" : values.length ? "saved" : "idle";

  function markDirty(key: string) {
    const id = `${prefix}${key}`;
    setEntries((current) => ({ ...current, [id]: { pending: current[id]?.pending ?? 0, failed: false, dirty: true } }));
  }

  function reset(key: string) {
    setEntries((current) => {
      if (current[`${prefix}${key}`]?.pending) return current;
      const next = { ...current };
      delete next[`${prefix}${key}`];
      return next;
    });
  }

  async function run(key: string, task: () => Promise<void>) {
    const id = `${prefix}${key}`;
    setEntries((current) => ({ ...current, [id]: { pending: (current[id]?.pending ?? 0) + 1, failed: current[id]?.pending ? current[id].failed : false, dirty: false } }));
    let failed = false;
    try {
      await task();
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      // 병렬 입력이 모두 끝나기 전에는 완료로 표시하지 않고, 다른 대상의 응답은 섞지 않는다.
      setEntries((current) => ({ ...current, [id]: { ...current[id], pending: current[id].pending - 1, failed: current[id].failed || failed } }));
    }
  }

  return {
    state: stateOf(Object.entries(entries).filter(([key]) => key.startsWith(prefix)).map(([, entry]) => entry)),
    stateFor: (key: string) => stateOf(entries[`${prefix}${key}`] ? [entries[`${prefix}${key}`]] : []),
    markDirty,
    reset,
    run,
  };
}
