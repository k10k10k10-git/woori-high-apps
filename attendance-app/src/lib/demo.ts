// 임시 공용 출석 흐름. 반 선택 후 실제 원장을 사용하므로 화면의 반 제한은 보안 경계가 아니다.

import type { UserRole } from '@/types';

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';
export const DEMO_EMAIL = (process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '').trim();
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';
export const demoConfigured = DEMO_MODE && !!DEMO_EMAIL && !!DEMO_PASSWORD;

export function demoCredentials(): { email: string; password: string } {
  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
}

/** 공용 출석 계정인지 판별한다. */
export function isDemoAccount(email?: string | null): boolean {
  return !!(DEMO_MODE && DEMO_EMAIL && email?.toLowerCase() === DEMO_EMAIL.toLowerCase());
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

/** 공용 계정에는 선택한 반의 교사 화면만 적용한다. */
export function buildDemoRole(sel: DemoSelection): UserRole | null {
  const parsed = parseClassKey(sel.ck);
  if (!parsed) return null;
  const label = sel.teacherName.trim() || `${parsed.part}부 ${parsed.grade}학년 ${parsed.cls}반`;
  return {
    role: 'teacher', part: parsed.part, grade: parsed.grade, class: parsed.cls,
    name: `${label} (데모)`, email: DEMO_EMAIL,
  };
}

// ─── 반 선택 목록 만들기 ───────────────────────────────────────
export type DemoOption = { ck: string; part: string; grade: string; cls: string; teacherName: string };

function sortOptions(list: DemoOption[]): DemoOption[] {
  return [...list].sort((a, b) =>
    a.part.localeCompare(b.part) || Number(a.grade) - Number(b.grade) || Number(a.cls) - Number(b.cls));
}

export function buildDemoOptionsFromClasses(classes: Record<string, { teacher?: string }> | null | undefined): DemoOption[] {
  return sortOptions(Object.entries(classes ?? {}).flatMap(([ck, info]) => {
    const parsed = parseClassKey(ck);
    return parsed ? [{ ck, ...parsed, teacherName: info?.teacher ?? '' }] : [];
  }));
}

export function resolveDemoSelection(value: DemoSelection | null): DemoSelection | null {
  return value && parseClassKey(value.ck)
    ? { ck: value.ck, teacherName: value.teacherName ?? '' } : null;
}

// ─── 브라우저 저장 ───────────────────────────────────────────
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

/** 반 바꾸기로 현재 선택을 비운 뒤에도 직전 반을 한 번에 다시 열 수 있게 한다. */
export function loadLastDemoSelection(): DemoSelection | null {
  return resolveDemoSelection(readStoredSelection(LAST_SELECTION_KEY));
}

export function saveDemoSelection(sel: DemoSelection) {
  if (typeof window === 'undefined') return;
  try {
    const value = JSON.stringify(sel);
    localStorage.removeItem(SELECTION_KEY); // 과거 자동 진입 선택은 더 이상 사용하지 않는다.
    localStorage.setItem(LAST_SELECTION_KEY, value);
  } catch { /* 사파리 프라이빗 모드 */ }
}

export function clearDemoSelection() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(SELECTION_KEY); } catch { /* 제한된 저장소 */ }
}

export function getAdminIntent(): boolean {
  if (typeof window === 'undefined') return false;
  try { return sessionStorage.getItem(ADMIN_INTENT_KEY) === '1'; } catch { return false; }
}

export function setAdminIntent(on: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (on) sessionStorage.setItem(ADMIN_INTENT_KEY, '1');
    else sessionStorage.removeItem(ADMIN_INTENT_KEY);
  } catch { /* 제한된 저장소 */ }
}
