'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { getWindowYears, getKSTYear } from '@/utils/dates';
import { ADMIN_NAVIGATION, adminNavigationItem, hasClassFilters } from '@/lib/adminNavigation';
import AdminIcon from './AdminIcon';
import './admin-workspace.css';

export default function AdminWorkspace({ children, onLogout, isOnline }: { children: React.ReactNode; onLogout: () => void | Promise<void>; isOnline: boolean }) {
  const { state, dispatch } = useApp();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const activeItem = adminNavigationItem(pathname);
  const currentYear = getKSTYear();
  const userName = state.userRole?.name?.trim() || '관리자';

  async function handleLogout() {
    if (loggingOut) return;
    setLogoutError(false);
    setLoggingOut(true);
    try { await onLogout(); }
    catch { setLogoutError(true); setLoggingOut(false); }
  }

  function changeScope(part: string, grade: string) {
    if (part !== state.curPart) dispatch({ type: 'SET_PART', payload: part });
    if (grade !== state.curGrade) dispatch({ type: 'SET_GRADE', payload: grade });
    const classes = Object.keys(state.classData)
      .filter(key => key.startsWith(`${part}-${grade}-`))
      .sort((a, b) => Number(a.split('-')[2]) - Number(b.split('-')[2]));
    const previousClass = `${part}-${grade}-${state.curClass}`;
    if (!classes.includes(previousClass)) dispatch({ type: 'SET_CLASS', payload: classes[0]?.split('-')[2] ?? '1' });
  }

  return (
    <div className="admin-workspace">
      <a className="aw-skip" href="#admin-main">본문으로 이동</a>
      <aside className="aw-sidebar" aria-label="관리자 작업 공간">
        <Link href="/dashboard" className="aw-brand" aria-label="서현고등부 출석부 대시보드">
          <span className="aw-brand-mark"><AdminIcon name="book" size={19} /></span>
          <span className="aw-brand-copy"><strong>서현고등부</strong><span>출석부</span></span>
        </Link>
        <nav className="aw-navigation" aria-label="관리자 메뉴">
          {ADMIN_NAVIGATION.map(item => (
            <Link key={item.path} href={item.path} className={`aw-nav-link${activeItem?.path === item.path ? ' is-active' : ''}`} aria-current={activeItem?.path === item.path ? 'page' : undefined}>
              <AdminIcon name={item.icon} size={17} /><span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="aw-account">
          <div className="aw-account-person">
            <span className="aw-avatar" aria-hidden="true">{Array.from(userName)[0]}</span>
            <span className="aw-account-copy"><strong>{userName}</strong><span>출석부 관리자</span></span>
          </div>
          <button type="button" className="aw-logout" onClick={() => void handleLogout()} disabled={loggingOut} aria-label={loggingOut ? '로그아웃 중' : '로그아웃'} title="로그아웃">
            <AdminIcon name="logout" size={18} />
          </button>
          {logoutError && <p className="aw-logout-error" role="alert">로그아웃하지 못했습니다. 다시 시도해 주세요.</p>}
        </div>
      </aside>
      <div className="aw-main-column">
        <header className="aw-header">
          <div className="aw-page-name"><AdminIcon name={activeItem?.icon ?? 'dashboard'} size={17} /><span>{activeItem?.label ?? '출석부'}</span></div>
          <div className="aw-header-tools">
            <span className="aw-save-status" role="status" aria-live="polite">
              {state.saveStatus !== 'idle' && <><span className={`aw-status-dot ${state.saveStatus}`} aria-hidden="true" />{state.saveStatus === 'saving' ? '저장 중' : '저장됨'}</>}
            </span>
            <label className="aw-year"><span>조회 연도</span><select value={state.curYear} onChange={event => dispatch({ type: 'SET_YEAR', payload: Number(event.target.value) })}>
              {getWindowYears(state.curYear).map(year => <option key={year} value={year}>{year}년{year === currentYear ? ' · 올해' : ''}</option>)}
            </select></label>
          </div>
        </header>
        {!isOnline && <div className="aw-offline" role="status"><AdminIcon name="signal" size={16} />오프라인입니다. 인터넷 연결을 확인해 주세요.</div>}
        {hasClassFilters(pathname) && <div className="aw-class-filters">
          <label><span>부서</span><select value={state.curPart} onChange={event => changeScope(event.target.value, state.curGrade)}><option value="1">1부</option><option value="2">2부</option></select></label>
          <label><span>학년</span><select value={state.curGrade} onChange={event => changeScope(state.curPart, event.target.value)}>{[1, 2, 3].map(grade => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
        </div>}
        <main id="admin-main" className="aw-main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
