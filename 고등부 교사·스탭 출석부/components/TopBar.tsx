'use client';

import { useApp } from '@/store/AppContext';
import { getWindowYears, getKSTYear } from '@/utils/dates';

export default function TopBar({ onLogout }: { onLogout: () => void }) {
  const { state, dispatch } = useApp();
  const { curYear, userRole, saveStatus } = state;
  const isAdmin = !userRole || userRole.role === 'admin';
  const windowYears = getWindowYears(state.curYear);
  const kstYear = getKSTYear();

  return (
    <div className="topbar">
      <div className="topbar-title">👨‍🏫 교사/스탭 출석부</div>

      {isAdmin && (
        <select
          className="topbar-sel"
          value={curYear}
          onChange={e => dispatch({ type: 'SET_YEAR', payload: parseInt(e.target.value) })}
        >
          {windowYears.map(y => (
            <option key={y} value={y}>{y}년{y === kstYear ? ' (현재)' : ''}</option>
          ))}
        </select>
      )}

      <div className="save-dot" style={{
        background: saveStatus === 'saving' ? 'var(--amber)' : saveStatus === 'saved' ? 'var(--green)' : 'transparent'
      }} />
      <span className="save-label">
        {saveStatus === 'saving' ? '저장 중...' : saveStatus === 'saved' ? '저장됨' : ''}
      </span>

      <button className="logout-btn" onClick={onLogout}>로그아웃</button>
    </div>
  );
}
