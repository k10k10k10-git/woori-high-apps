// 로그인 세션 저장 위치 — 출석부의 "로그인 유지" 선택을 Supabase 에서도 지킨다(고등부 앱에는 없는 부분).
// Firebase 때: 체크 해제(기본) = browserSessionPersistence(이 탭에만, 브라우저를 닫으면 로그아웃),
//             체크 = browserLocalPersistence(브라우저를 닫아도 유지). 공용 기기에서 개인 계정이 남지 않게 한다.
// Supabase 클라이언트의 auth.storage 로 끼운다. 저장소가 막힌 브라우저에서는 메모리에 둔다(그 탭이 살아 있는 동안만).

export type AuthPersistence = 'local' | 'session';

/** 이 탭에서 사용자가 고른 방식. sessionStorage 에 두어 Google 로그인처럼 다른 주소를 다녀와도 남는다. */
const MODE_KEY = 'attendanceAuthPersistence';
const memory = new Map<string, string>();

function storage(kind: AuthPersistence): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(kind: AuthPersistence, key: string): string | null {
  try { return storage(kind)?.getItem(key) ?? null; } catch { return null; }
}

function drop(kind: AuthPersistence, key: string): void {
  try { storage(kind)?.removeItem(key); } catch { /* 막힌 저장소 */ }
}

/** 로그인 직전에 부른다. 이후 이 탭의 세션 저장(토큰 갱신 포함)은 고른 곳으로 간다. */
export function setAuthPersistence(mode: AuthPersistence): void {
  try { storage('session')?.setItem(MODE_KEY, mode); } catch { /* 막힌 저장소: 아래 추론으로 동작 */ }
}

function modeFor(key: string): AuthPersistence {
  const chosen = read('session', MODE_KEY);
  if (chosen === 'local' || chosen === 'session') return chosen;
  // 새로고침·새 탭: 고른 기록이 없으면 세션이 이미 있는 곳을 따른다. 처음이면 Firebase 기본처럼 local.
  return read('session', key) !== null ? 'session' : 'local';
}

export const authStorage = {
  getItem(key: string): string | null {
    return read('session', key) ?? read('local', key) ?? memory.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    const mode = modeFor(key);
    const other: AuthPersistence = mode === 'local' ? 'session' : 'local';
    try {
      const target = storage(mode);
      if (!target) throw new Error('storage unavailable');
      target.setItem(key, value);
      memory.delete(key);
    } catch {
      memory.set(key, value);
    }
    // 다른 쪽에 남은 예전 세션이 다음 탭에서 되살아나지 않게 지운다.
    drop(other, key);
  },
  removeItem(key: string): void {
    drop('session', key);
    drop('local', key);
    memory.delete(key);
  },
};
