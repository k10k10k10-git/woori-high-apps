import type { Group, Retreat, RetreatProgram } from "@/lib/types";

type RetreatWorkspaceSnapshot = {
  retreat?: Retreat | null;
  groups?: Group[];
  programs?: RetreatProgram[];
  updatedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const snapshots = new Map<string, RetreatWorkspaceSnapshot>();

export function getRetreatWorkspaceSnapshot(retreatId: string): RetreatWorkspaceSnapshot | null {
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
  snapshots.set(retreatId, {
    ...snapshots.get(retreatId),
    ...next,
    updatedAt: Date.now(),
  });
}
