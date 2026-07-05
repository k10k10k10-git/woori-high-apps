import type { DataSnapshot } from "firebase/database";

export function snapToList<T extends { id: string }>(snap: DataSnapshot): T[] {
  if (!snap.exists()) return [];
  const raw = snap.val();
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw)
    .filter(([, data]) => data != null && typeof data === "object" && !Array.isArray(data))
    .map(([id, data]) => ({ id, ...(data as object) } as T));
}
