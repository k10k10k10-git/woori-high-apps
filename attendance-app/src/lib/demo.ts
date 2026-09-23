// 공개 데모는 가상 명단만 사용한다. Firebase Auth/DB에 접속하지 않는다.

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';
const DEMO_ROLE_EMAIL = 'demo@local.invalid';

/** 가상 데모 역할인지 판별한다. 실제 Firebase 계정에는 이 값을 사용하지 않는다. */
export function isDemoAccount(email?: string | null): boolean {
  return DEMO_MODE && email === DEMO_ROLE_EMAIL;
}

export type DemoSelection = { ck: string; teacherName: string };

/** "1-2-3" → { part: '1', grade: '2', cls: '3' }. 형식이 아니면 null. */
export function parseClassKey(ck: string): { part: string; grade: string; cls: string } | null {
  const parts = ck.split('-');
  if (parts.length !== 3) return null;
  const [part, grade, cls] = parts;
  if (!part || !grade || !cls) return null;
  return { part, grade, cls };
}

// ─── 반 선택 목록 만들기 ───────────────────────────────────────
export type DemoOption = { ck: string; part: string; grade: string; cls: string; teacherName: string };

export const DEMO_OPTIONS: DemoOption[] = ['1', '2'].flatMap(part =>
  ['1', '2', '3'].flatMap(grade =>
    ['1', '2', '3'].map(cls => ({ ck: `${part}-${grade}-${cls}`, part, grade, cls, teacherName: '' }))));

export function resolveDemoSelection(value: DemoSelection | null): DemoSelection | null {
  return value && DEMO_OPTIONS.some(option => option.ck === value.ck)
    ? { ck: value.ck, teacherName: '' } : null;
}

// ─── 브라우저 저장 (새로고침해도 고른 반 유지) ─────────────────
const SELECTION_KEY = 'demoSelection';
const LAST_SELECTION_KEY = 'demoLastSelection';
const ADMIN_INTENT_KEY = 'demoAdminIntent';

function readStoredSelection(key: string): DemoSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoSelection>;
    if (!parsed?.ck || !parseClassKey(parsed.ck)) return null;
    return { ck: parsed.ck, teacherName: parsed.teacherName ?? '' };
  } catch {
    return null;
  }
}

export function loadDemoSelection(): DemoSelection | null {
  return resolveDemoSelection(readStoredSelection(SELECTION_KEY));
}

/** 반 바꾸기로 현재 선택을 비운 뒤에도 직전 반을 한 번에 다시 열 수 있게 한다. */
export function loadLastDemoSelection(): DemoSelection | null {
  return resolveDemoSelection(readStoredSelection(LAST_SELECTION_KEY));
}

export function saveDemoSelection(sel: DemoSelection) {
  if (typeof window === 'undefined') return;
  try {
    const value = JSON.stringify(sel);
    localStorage.setItem(SELECTION_KEY, value);
    localStorage.setItem(LAST_SELECTION_KEY, value);
  } catch { /* 사파리 프라이빗 모드 */ }
}

export function clearDemoSelection() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(SELECTION_KEY); } catch { /* 무시 */ }
}

/** 관리자 로그인을 누른 뒤에는 데모 계정으로 자동 재로그인하지 않는다(탭 단위). */
export function getAdminIntent(): boolean {
  if (typeof window === 'undefined') return false;
  try { return sessionStorage.getItem(ADMIN_INTENT_KEY) === '1'; } catch { return false; }
}

export function setAdminIntent(on: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (on) sessionStorage.setItem(ADMIN_INTENT_KEY, '1');
    else sessionStorage.removeItem(ADMIN_INTENT_KEY);
  } catch { /* 무시 */ }
}
