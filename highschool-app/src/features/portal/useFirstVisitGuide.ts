"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { SundayTeamKey } from "./featureCatalog";

export type FirstVisitScope = SundayTeamKey | "home" | `home:${SundayTeamKey}`;
const completedInMemory = new Set<string>();
const GUIDE_CHANGED = "woori-team-guide-changed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(GUIDE_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(GUIDE_CHANGED, onChange);
  };
}

/** 완료 기억 로직을 공유하되 홈의 짧은 안내와 팀 상세 안내는 별도 범위로 기억한다. */
export function useFirstVisitGuide(userId: string, scope: FirstVisitScope) {
  const key = `woori-team-guide:v1:${userId}:${scope}`;
  const getCompleted = useCallback(() => {
    try { return window.localStorage.getItem(key) === "done" || completedInMemory.has(key); }
    catch { return completedInMemory.has(key); }
  }, [key]);
  const completed = useSyncExternalStore(subscribe, getCompleted, () => null);
  const [manual, setManual] = useState<{ key: string; opened: boolean } | null>(null);
  const opened = manual?.key === key ? manual.opened : completed === false;
  const open = () => setManual({ key, opened: true });
  const close = () => {
    completedInMemory.add(key);
    try { window.localStorage.setItem(key, "done"); } catch { /* 저장이 막힌 브라우저에서도 안내를 닫을 수 있다. */ }
    setManual({ key, opened: false });
    window.dispatchEvent(new Event(GUIDE_CHANGED));
  };
  return { opened, open, close };
}
