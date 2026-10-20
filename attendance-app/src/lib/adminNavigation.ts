import type { UserRole } from '@/types';

export const ADMIN_NAVIGATION = [
  { path: '/dashboard', label: '오늘 업무', icon: 'dashboard' },
  { path: '/pastoral', label: '목양 관리', icon: 'book' },
  { path: '/attendance', label: '출석 관리', icon: 'calendar' },
  { path: '/manage', label: '학생·반 관리', icon: 'users' },
  { path: '/files', label: '파일화', icon: 'download' },
  { path: '/admin', label: '운영 설정', icon: 'settings' },
] as const;

const ADMIN_ONLY_PATHS = ['/dashboard', '/overall', '/admin', '/pastoral', '/files'];
const CLASS_FILTER_PATHS: string[] = [];
const ENTRY_STORAGE_KEY = 'attendance-admin-entry-uid';

function normalizePath(pathname: string): string {
  return pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

function isWithinPath(pathname: string, base: string): boolean {
  const path = normalizePath(pathname);
  return path === base || path.startsWith(`${base}/`);
}

/** 데모의 실제 DB 권한과 관계없이 관리자 화면은 일반 관리자 계정에만 연다. */
export function canUseAdminWorkspace(role: UserRole | null, isDemo: boolean): boolean {
  return role?.role === 'admin' && !isDemo;
}

export function canAccessAttendancePath(pathname: string, role: UserRole | null, isDemo: boolean): boolean {
  return !ADMIN_ONLY_PATHS.some(base => isWithinPath(pathname, base)) || canUseAdminWorkspace(role, isDemo);
}

export function homePathForRole(role: UserRole | null, isDemo: boolean): '/dashboard' | '/attendance' {
  return canUseAdminWorkspace(role, isDemo) ? '/dashboard' : '/attendance';
}

export function adminNavigationItem(pathname: string) {
  // 이전 전체 현황 주소도 통합 메뉴의 활성 상태를 공유한다.
  const current = isWithinPath(pathname, '/overall') ? '/dashboard'
    : isWithinPath(pathname, '/stats') ? '/attendance'
      : pathname;
  return ADMIN_NAVIGATION.find(item => isWithinPath(current, item.path));
}

export function hasClassFilters(pathname: string): boolean {
  return CLASS_FILTER_PATHS.some(base => isWithinPath(pathname, base));
}

type EntryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** 인증 세션 첫 진입만 이동한다. 깊은 링크 방문도 기록해 이후 출석 링크는 그대로 연다. */
export function createAdminEntryTracker(storage?: EntryStorage) {
  const visited = new Set<string>();
  return {
    take(uid: string, pathname: string, role: UserRole | null, isDemo: boolean): '/dashboard' | null {
      if (!uid || !canUseAdminWorkspace(role, isDemo)) return null;
      let seen = visited.has(uid);
      try { seen ||= storage?.getItem(ENTRY_STORAGE_KEY) === uid; } catch { /* 저장소가 막혀도 현재 셸의 방문 기록은 유지한다. */ }
      visited.add(uid);
      try { storage?.setItem(ENTRY_STORAGE_KEY, uid); } catch { /* 메모리 기록으로 반복 이동을 막는다. */ }
      const path = normalizePath(pathname);
      const search = pathname.split('?')[1]?.split('#')[0] ?? '';
      // 날짜 링크는 출석 화면에서 역할별 허용 주일을 검증한다. 로그인 진입에서는 의도만 보존한다.
      const hasRequestedWeek = !!new URLSearchParams(search).get('week')?.trim();
      return !seen && (path === '/' || (path === '/attendance' && !hasRequestedWeek)) ? '/dashboard' : null;
    },
    reset() {
      visited.clear();
      try { storage?.removeItem(ENTRY_STORAGE_KEY); } catch { /* 로그아웃의 인증 처리를 막지 않는다. */ }
    },
  };
}
