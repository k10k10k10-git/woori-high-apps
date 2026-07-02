'use client';

import { useApp, effectiveKey } from '@/store/AppContext';
import { GROUP_KEYS, GROUP_LABELS, STAFF_TEAMS } from '@/types';
import type { StaffTeam } from '@/types';

export default function GroupNav() {
  const { state, dispatch } = useApp();
  const isStaff = state.curGroup === 'staff';

  return (
    <div className="group-nav-wrap">
      {/* 상단: 1부 교사 / 2부 교사 / 스탭 */}
      <div className="group-nav">
        {GROUP_KEYS.map(gk => (
          <button
            key={gk}
            className={`group-btn${state.curGroup === gk ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_GROUP', payload: gk })}
          >
            {GROUP_LABELS[gk]}
          </button>
        ))}
      </div>

      {/* 하단: 스탭 선택 시 사역팀 서브탭 */}
      {isStaff && (
        <div className="team-nav">
          {STAFF_TEAMS.map(team => (
            <button
              key={team}
              className={`team-btn${state.curStaffTeam === team ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'SET_STAFF_TEAM', payload: team as StaffTeam })}
            >
              {team}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
