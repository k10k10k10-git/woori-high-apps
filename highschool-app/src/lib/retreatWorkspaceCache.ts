import type { Group, Retreat, RetreatProgram } from "@/lib/types";

type RetreatWorkspaceSnapshot = {
  retreat?: Retreat | null;
  groups?: Group[];
  programs?: RetreatProgram[];
  updatedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEY = "__wooriRetreatWorkspaceSnapshots";

type CacheWindow = Window & {
  [CACHE_KEY]?: Map<string, RetreatWorkspaceSnapshot>;
};

function browserSnapshots(): Map<string, RetreatWorkspaceSnapshot> | null {
  // Client Component도 서버에서 모듈이 평가될 수 있다. 운영 데이터를 Node 전역에
  // 두면 요청자 사이에 섞일 수 있으므로 브라우저 탭의 window에만 보관한다.
  if (typeof window === "undefined") return null;
  const cacheWindow = window as CacheWindow;
  cacheWindow[CACHE_KEY] ??= new Map<string, RetreatWorkspaceSnapshot>();
  return cacheWindow[CACHE_KEY];
}

export function getRetreatWorkspaceSnapshot(retreatId: string): RetreatWorkspaceSnapshot | null {
  const snapshots = browserSnapshots();
  if (!snapshots) return null;
  const snapshot = snapshots.get(retreatId);
  if (!snapshot) return null;
  if (Date.now() - snapshot.updatedAt > CACHE_TTL_MS) {
    snapshots.delete(retreatId);
    return null;
  }
  return snapshot;
}

export function mergeRetreatWorkspaceSnapshot(
  retreatId: string,
  next: Omit<Partial<RetreatWorkspaceSnapshot>, "updatedAt">,
) {
  const snapshots = browserSnapshots();
  if (!snapshots) return;
  snapshots.set(retreatId, {
    ...snapshots.get(retreatId),
    ...next,
    updatedAt: Date.now(),
  });
}
