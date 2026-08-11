// 데모 모드 — 교사 대상 테스트 기간에만 켜는 임시 접속 방식.
//
// 평소: 교사가 각자 계정으로 로그인 → 본인 반만 접근.
// 데모: 첫 화면에서 부서·학년·반을 고르면 그 반 담임 계정으로 로그인한 것과 같은 화면.
//
// ⚠ Firebase 보안 규칙은 모든 읽기에 인증을 요구한다(database.rules.json).
//    그래서 "로그인 없음"이 아니라, 화면 뒤에서 공용 데모 계정 하나로 로그인한 뒤
//    고른 반만 보이도록 화면에서 제한하는 구조다. 반 제한은 UI 계약일 뿐 보안 경계가 아니다.
//
// 되돌리기(테스트 종료 후): .env.local의 NEXT_PUBLIC_DEMO_MODE를 0으로 바꾸고 재배포하면
//    아래 코드가 전부 비활성화되고 원래 로그인 화면으로 돌아간다. 데모 계정도 삭제할 것.

import type { UserRole } from '@/types';

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';
export const DEMO_EMAIL = (process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '').trim();
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';

/** 데모 계정 정보가 실제로 채워져 있는가 — 비어 있으면 안내 화면을 띄운다. */
export const demoConfigured = DEMO_MODE && DEMO_EMAIL !== '' && DEMO_PASSWORD !== '';

export function demoCredentials(): { email: string; password: string } {
  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
}

/** 지금 로그인된 계정이 공용 데모 계정인가 (관리자 계정 로그인과 구분하는 유일한 기준) */
export function isDemoAccount(email?: string | null): boolean {
  if (!DEMO_MODE || !DEMO_EMAIL || !email) return false;
  return email.toLowerCase() === DEMO_EMAIL.toLowerCase();
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

/**
 * 고른 반을 담임 교사 역할로 바꾼다.
 * role: 'teacher'로 두는 것이 핵심 — 구독(본인 반만)·탭 노출·화면 제한이 전부 이 값을 본다.
 * name에 (데모)를 붙여 두면 학생 정보 수정 시 남는 행정 이력에서 실제 담임과 구분된다.
 */
export function buildDemoRole(sel: DemoSelection): UserRole | null {
  const parsed = parseClassKey(sel.ck);
  if (!parsed) return null;
  const label = sel.teacherName.trim() || `${parsed.part}부 ${parsed.grade}학년 ${parsed.cls}반`;
  return {
    role: 'teacher',
    part: parsed.part,
    grade: parsed.grade,
    class: parsed.cls,
    name: `${label} (데모)`,
    email: DEMO_EMAIL,
  };
}

// ─── 반 선택 목록 만들기 ───────────────────────────────────────
export type DemoOption = { ck: string; part: string; grade: string; cls: string; teacherName: string };

function sortOptions(list: DemoOption[]): DemoOption[] {
  return [...list].sort((a, b) =>
    a.part.localeCompare(b.part) ||
    Number(a.grade) - Number(b.grade) ||
    Number(a.cls) - Number(b.cls));
}

/** 교사 계정 명단(userRoles) → 반 목록. 관리자 계정과 형식이 깨진 항목은 뺀다. */
export function buildDemoOptionsFromRoles(roles: Record<string, UserRole> | null | undefined): DemoOption[] {
  const list: DemoOption[] = [];
  Object.values(roles ?? {}).forEach(role => {
    if (role?.role !== 'teacher') return;
    const ck = `${role.part ?? ''}-${role.grade ?? ''}-${role.class ?? ''}`;
    const parsed = parseClassKey(ck);
    if (!parsed) return;
    if (list.some(o => o.ck === ck)) return; // 같은 반에 계정이 둘이면 하나만
    list.push({ ck, ...parsed, teacherName: role.name ?? '' });
  });
  return sortOptions(list);
}

/** 교사 계정이 하나도 없을 때 대비 — 반 노드(classes/{year})에서 직접 만든다. */
export function buildDemoOptionsFromClasses(classes: Record<string, { teacher?: string }> | null | undefined): DemoOption[] {
  const list: DemoOption[] = [];
  Object.entries(classes ?? {}).forEach(([ck, info]) => {
    const parsed = parseClassKey(ck);
    if (!parsed) return;
    list.push({ ck, ...parsed, teacherName: info?.teacher ?? '' });
  });
  return sortOptions(list);
}

// ─── 브라우저 저장 (새로고침해도 고른 반 유지) ─────────────────
const SELECTION_KEY = 'demoSelection';
const ADMIN_INTENT_KEY = 'demoAdminIntent';

export function loadDemoSelection(): DemoSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoSelection>;
    if (!parsed?.ck || !parseClassKey(parsed.ck)) return null;
    return { ck: parsed.ck, teacherName: parsed.teacherName ?? '' };
  } catch {
    return null;
  }
}

export function saveDemoSelection(sel: DemoSelection) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SELECTION_KEY, JSON.stringify(sel)); } catch { /* 사파리 프라이빗 모드 */ }
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
