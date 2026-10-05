'use client';
import { useApp } from '@/store/AppContext';
import { getWindowYears, getKSTYear } from '@/utils/dates';
import AttendanceSaveStatus from '@/components/AttendanceSaveStatus';
import AdminIcon from '@/components/admin/AdminIcon';

type DemoActions = { onChangeClass: () => void; onAdminLogin: () => void };

export default function TopBar({ onLogout, demo }: { onLogout: () => void; demo?: DemoActions }) {
  const { state, dispatch } = useApp();
  const { curYear, curPart, curGrade, userRole } = state;
  const isAdmin = userRole?.role === 'admin';
  const isTeacher = userRole?.role === 'teacher';

  const windowYears = getWindowYears(state.curYear);
  const kstYear = getKSTYear();

  return (
    <header className="topbar">
      {/* 1행: 타이틀 + 저장상태 + 로그아웃 */}
      <div className="topbar-main">
        <div className="topbar-title">
          <span className="topbar-title-mark" aria-hidden="true">
            <AdminIcon name="book" size={17} />
          </span>
          <span>출석부</span>
        </div>
        <div className="topbar-actions">
          <div className="topbar-save-status" role="status" aria-live="polite" aria-atomic="true">
            <AttendanceSaveStatus />
          </div>
          {demo ? (
            <>
              <button className="logout-btn" onClick={demo.onChangeClass} aria-label="반 바꾸기">반 바꾸기</button>
              <button className="logout-btn topbar-admin-btn" onClick={demo.onAdminLogin} aria-label="교사·관리자 로그인">교사·관리자 로그인</button>
            </>
          ) : (
            <button className="logout-btn" onClick={onLogout} aria-label="로그아웃">로그아웃</button>
          )}
        </div>
      </div>

      {/* 2행: 필터 (관리자만) */}
      {!isTeacher && (
        <div className="topbar-filters">
          {isAdmin && (
            <select
              className="topbar-sel"
              value={curYear}
              onChange={e => dispatch({ type: 'SET_YEAR', payload: parseInt(e.target.value) })}
              aria-label="연도 선택"
            >
              {windowYears.map(y => (
                <option key={y} value={y}>{y}년{y === kstYear ? ' ★' : ''}</option>
              ))}
            </select>
          )}
          <select
            className="topbar-sel"
            value={curPart}
            onChange={e => dispatch({ type: 'SET_PART', payload: e.target.value })}
            aria-label="부서 선택"
          >
            <option value="1">1부</option>
            <option value="2">2부</option>
          </select>
          <select
            className="topbar-sel"
            value={curGrade}
            aria-label="학년 선택"
            onChange={e => {
              dispatch({ type: 'SET_GRADE', payload: e.target.value });
              const keys = Object.keys(state.classData).filter(k => {
                const [p, g] = k.split('-');
                return p === curPart && g === e.target.value;
              });
              if (keys.length > 0) {
                dispatch({ type: 'SET_CLASS', payload: keys[0].split('-')[2] });
              }
            }}
          >
            {[1, 2, 3].map(g => <option key={g} value={String(g)}>{g}학년</option>)}
          </select>
        </div>
      )}
    </header>
  );
}
