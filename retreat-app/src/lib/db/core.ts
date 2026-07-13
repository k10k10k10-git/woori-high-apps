import { ref, get, update, onValue, DataSnapshot } from "firebase/database";
import { db } from "../firebase";

// Helper: DataSnapshot → typed list (injects id from Firebase key)
function snapToList<T extends { id: string }>(snap: DataSnapshot): T[] {
  if (!snap.exists()) return [];
  return Object.entries(snap.val()).map(([id, data]) => ({ id, ...(data as object) } as T));
}

function stripUndefined<T>(value: T): T {
  return stripUndefinedValue(value) as T;
}

function stripUndefinedValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map(item => {
      const cleaned = stripUndefinedValue(item);
      return cleaned === undefined ? null : cleaned;
    });
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, nested]) => [key, stripUndefinedValue(nested)] as const)
        .filter(([, nested]) => nested !== undefined)
    );
  }
  return value;
}

/**
 * 노드 전체 덮어쓰기(set) 직전, 현재 상태를 롤링 백업(최근 5개)한다.
 * groups/rooms는 participants와 달리 전체 set으로 저장돼 저장 버그·실수 시 복구 수단이 없었다.
 * 편집 중 저장이 잦으므로 마지막 백업이 minIntervalMs 이내면 건너뛰어 쓰기 폭주를 막는다.
 * 일반 저장은 반환값을 무시해 베스트 에포트로 동작하고, 파괴적 작업은 false일 때 중단할 수 있다.
 */
async function backupNodeBeforeOverwrite(
  currentPath: string,
  backupsBasePath: string,
  minIntervalMs = 10 * 60 * 1000,
): Promise<boolean> {
  try {
    const curSnap = await get(ref(db, currentPath));
    if (!curSnap.exists()) return true; // 백업할 현재 데이터 없음
    const backupsSnap = await get(ref(db, backupsBasePath));
    const existingKeys = backupsSnap.exists() ? Object.keys(backupsSnap.val()) : [];
    const now = Date.now();
    const lastTs = existingKeys.map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a)[0];
    if (lastTs && now - lastTs < minIntervalMs) return true; // 최근 백업이 있으면 스킵
    const payload: Record<string, unknown> = {};
    const sorted = [...existingKeys].sort();
    if (sorted.length >= 5) sorted.slice(0, sorted.length - 4).forEach(k => { payload[`${backupsBasePath}/${k}`] = null; });
    payload[`${backupsBasePath}/${now}`] = curSnap.val();
    await update(ref(db), payload);
    return true;
  } catch {
    // 일반 저장은 베스트 에포트, 파괴적 호출자는 false를 확인해 작업을 중단한다.
    return false;
  }
}

/** Firebase 연결 상태 구독 (".info/connected") — 오프라인 안내 배너용 */
export function subscribeToConnection(callback: (connected: boolean) => void): () => void {
  const r = ref(db, ".info/connected");
  return onValue(r, (snap) => callback(snap.val() === true));
}

export { snapToList, stripUndefined, backupNodeBeforeOverwrite };
