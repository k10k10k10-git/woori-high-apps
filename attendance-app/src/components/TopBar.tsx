'use client';
import { useApp, useClassKey } from '@/store/AppContext';
import { getWindowYears, getKSTYear } from '@/utils/dates';

type DemoActions = { onChangeClass: () => void; onAdminLogin: () => void };

export default function TopBar({ onLogout, demo }: { onLogout: () => void; demo?: DemoActions }) {
  const { state, dispatch } = useApp();
  const { curYear, curPart, curGrade, userRole, saveStatus } = state;
  const isAdmin = !userRole || userRole.role === 'admin';
  const isTeacher = userRole?.role === 'teacher';

  const ck = useClassKey(state);
  const classInfo = state.classData[ck];
  const teacherName = classInfo?.teacher ?? '';

  const windowYears = getWindowYears(state.curYear);
  const kstYear = getKSTYear();

  return (
    <div className="topbar">
      {/* 1행: 타이틀 + 저장상태 + 로그아웃 */}
      <div className="topbar-main">
        <div className="topbar-title">📋 출석부</div>
        {isTeacher && teacherName && (
          <span className="topbar-teacher-badge">{teacherName}</span>
        )}
        <div className="topbar-actions">
          <div className={`save-dot${saveStatus === 'saving' ? ' saving' : saveStatus === 'saved' ? ' saved' : ''}`} />
          {saveStatus !== 'idle' && (
            <span className="save-label">
              {saveStatus === 'saving' ? '저장 중' : '저장됨'}
            </span>
          )}
          {demo ? (
            <>
              <button className="logout-btn" onClick={demo.onChangeClass} aria-label="반 바꾸기">반 바꾸기</button>
              <button className="logout-btn topbar-admin-btn" onClick={demo.onAdminLogin} aria-label="관리자 계정으로 접근">관리자 접근</button>
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
    </div>
  );
}
