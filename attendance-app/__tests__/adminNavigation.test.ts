import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAVIGATION, adminNavigationItem, canAccessAttendancePath,
  canUseAdminWorkspace, createAdminEntryTracker, hasClassFilters, homePathForRole,
} from '@/lib/adminNavigation';
import type { UserRole } from '@/types';

const admin: UserRole = { role: 'admin' };
const teacher: UserRole = { role: 'teacher', part: '1', grade: '2', class: '3' };

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  };
}

describe('관리자 화면 경계', () => {
  it('일반 관리자에게만 작업 공간을 연다', () => {
    expect(canUseAdminWorkspace(admin, false)).toBe(true);
    expect(canUseAdminWorkspace(admin, true)).toBe(false);
    expect(canUseAdminWorkspace(teacher, false)).toBe(false);
    expect(canUseAdminWorkspace(null, false)).toBe(false);
  });

  it.each(['/pastoral', '/pastoral/', '/dashboard', '/overall', '/admin', '/dashboard/', '/admin/accounts', '/admin?week=0-0'])('교사·데모의 %s 직접 진입을 차단한다', path => {
    expect(canAccessAttendancePath(path, teacher, false)).toBe(false);
    expect(canAccessAttendancePath(path, admin, true)).toBe(false);
    expect(canAccessAttendancePath(path, null, false)).toBe(false);
    expect(canAccessAttendancePath(path, admin, false)).toBe(true);
  });

  it('담임 업무 경로와 비슷한 접두어는 관리자 전용으로 오인하지 않는다', () => {
    for (const path of ['/attendance', '/manage', '/stats', '/administrator']) {
      expect(canAccessAttendancePath(path, teacher, true)).toBe(true);
    }
  });

  it('루트 목적지를 역할과 데모 여부로 결정한다', () => {
    expect(homePathForRole(admin, false)).toBe('/dashboard');
    expect(homePathForRole(admin, true)).toBe('/attendance');
    expect(homePathForRole(teacher, false)).toBe('/attendance');
    expect(homePathForRole(null, false)).toBe('/attendance');
  });
});

describe('관리자 로그인 진입', () => {
  it.each(['/', '/attendance', '/attendance/'])('%s 첫 진입을 한 번만 안내한다', path => {
    const entry = createAdminEntryTracker();
    expect(entry.take('admin-1', path, admin, false)).toBe('/dashboard');
    expect(entry.take('admin-1', '/attendance', admin, false)).toBeNull();
    expect(entry.take('admin-1', '/dashboard', admin, false)).toBeNull();
  });

  it('깊은 링크를 보존하고 그 뒤 내부 출석 링크도 가로채지 않는다', () => {
    const entry = createAdminEntryTracker();
    expect(entry.take('admin-1', '/stats', admin, false)).toBeNull();
    expect(entry.take('admin-1', '/attendance', admin, false)).toBeNull();
  });

  it.each(['/attendance?week=0-0', '/attendance/?week=8%2D0', '/attendance?from=dashboard&week=0-0'])('첫 로그인에서도 날짜 링크 %s를 보존한다', path => {
    const entry = createAdminEntryTracker();
    expect(entry.take('admin-1', path, admin, false)).toBeNull();
    expect(entry.take('admin-1', '/attendance', admin, false)).toBeNull();
  });

  it.each(['/attendance?week=', '/attendance?week=%20', '/attendance?from=menu', '/?week=0-0'])('날짜 선택이 없는 출석 진입 또는 루트 %s는 대시보드로 안내한다', path => {
    expect(createAdminEntryTracker().take('admin-1', path, admin, false)).toBe('/dashboard');
  });

  it('새로고침으로 셸을 다시 만들어도 같은 세션의 출석 화면을 유지한다', () => {
    const storage = memoryStorage();
    expect(createAdminEntryTracker(storage).take('admin-1', '/', admin, false)).toBe('/dashboard');
    expect(createAdminEntryTracker(storage).take('admin-1', '/attendance', admin, false)).toBeNull();
  });

  it('로그아웃 후 다시 로그인하거나 다른 관리자가 로그인하면 다시 안내한다', () => {
    const entry = createAdminEntryTracker(memoryStorage());
    entry.take('admin-1', '/', admin, false);
    expect(entry.take('admin-2', '/attendance', admin, false)).toBe('/dashboard');
    entry.reset();
    expect(entry.take('admin-1', '/attendance', admin, false)).toBe('/dashboard');
  });

  it('교사와 데모는 자동 이동이나 관리자 방문 기록을 만들지 않는다', () => {
    const entry = createAdminEntryTracker(memoryStorage());
    expect(entry.take('same-id', '/', teacher, false)).toBeNull();
    expect(entry.take('same-id', '/', admin, true)).toBeNull();
    expect(entry.take('same-id', '/', admin, false)).toBe('/dashboard');
  });

  it('브라우저 저장소가 막혀도 현재 화면에서 반복 이동하지 않는다', () => {
    const fail = () => { throw new Error('저장소 접근 차단'); };
    const entry = createAdminEntryTracker({ getItem: fail, setItem: fail, removeItem: fail });
    expect(entry.take('admin-1', '/attendance', admin, false)).toBe('/dashboard');
    expect(entry.take('admin-1', '/attendance', admin, false)).toBeNull();
    expect(() => entry.reset()).not.toThrow();
  });
});

describe('관리자 메뉴 표시', () => {
  it('실제 경로를 한 번씩 표시하고 현재 경로와 하위 경로를 찾는다', () => {
    expect(new Set(ADMIN_NAVIGATION.map(item => item.path)).size).toBe(6);
    expect(adminNavigationItem('/pastoral')?.label).toBe('목양 리포트');
    expect(ADMIN_NAVIGATION.filter(item => item.label === '전체 현황')).toHaveLength(1);
    expect(adminNavigationItem('/overall/')?.path).toBe('/dashboard');
    expect(adminNavigationItem('/dashboard')?.label).toBe('전체 현황');
    expect(adminNavigationItem('/overall/')?.label).toBe('전체 현황');
    expect(adminNavigationItem('/admin/accounts')?.path).toBe('/admin');
    expect(adminNavigationItem('/administrator')).toBeUndefined();
  });

  it('반 단위 화면에서만 부서·학년 필터를 표시한다', () => {
    for (const path of ['/attendance', '/manage', '/stats']) expect(hasClassFilters(path)).toBe(true);
    for (const path of ['/dashboard', '/overall', '/admin']) expect(hasClassFilters(path)).toBe(false);
  });
});
