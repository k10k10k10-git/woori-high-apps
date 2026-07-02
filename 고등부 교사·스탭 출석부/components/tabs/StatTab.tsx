'use client';

import { useApp, calcStats, effectiveKey } from '@/store/AppContext';
import { evKey } from '@/utils/dates';
import GroupNav from '@/components/GroupNav';
import { GROUP_KEYS, GROUP_LABELS, STAFF_TEAMS } from '@/types';

export default function StatTab() {
  const { state } = useApp();
  const { groupData, attData, months, events } = state;
  const gk = effectiveKey(state);
  const members = groupData[gk]?.members ?? [];
  const isStaff = state.curGroup === 'staff';

  // 유효 주일 수
  const validWeekCount = months.reduce((sum, { sundays }, mi) =>
    sum + sundays.filter((_, di) => !events[evKey(mi, di)]).length, 0
  );

  // 그룹/팀 요약
  function groupSummary(key: string) {
    const ms = groupData[key]?.members ?? [];
    if (ms.length === 0) return null;
    let totalPresent = 0, totalPossible = 0;
    ms.forEach(m => {
      const s = calcStats(state, key, m.id);
      totalPresent += s.present;
      totalPossible += s.total;
    });
    const rate = totalPossible > 0 ? Math.round((totalPresent / totalPossible) * 100) : 0;
    return { count: ms.length, rate, totalPresent, totalPossible };
  }

  return (
    <div className="stat-tab">
      <GroupNav />

      {/* 교사 그룹 요약 (1부/2부) */}
      {!isStaff && (
        <div className="stat-summary-row">
          {GROUP_KEYS.filter(k => k !== 'staff').map(k => {
            const s = groupSummary(k);
            if (!s) return (
              <div key={k} className={`stat-card${k === state.curGroup ? ' active' : ''}`}>
                <div className="stat-card-label">{GROUP_LABELS[k]}</div>
                <div className="stat-card-val">-</div>
                <div className="stat-card-sub">멤버 없음</div>
              </div>
            );
            return (
              <div key={k} className={`stat-card${k === state.curGroup ? ' active' : ''}`}>
                <div className="stat-card-label">{GROUP_LABELS[k]}</div>
                <div className="stat-card-val">{s.rate}%</div>
                <div className="stat-card-sub">{s.count}명 · {s.totalPresent}/{s.totalPossible}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 스탭일 때 사역팀별 요약 */}
      {isStaff && (
        <div className="stat-summary-scroll">
          {STAFF_TEAMS.map(team => {
            const s = groupSummary(team);
            if (!s) return (
              <div key={team} className={`stat-card${state.curStaffTeam === team ? ' active' : ''}`}>
                <div className="stat-card-label">{team}</div>
                <div className="stat-card-val">-</div>
                <div className="stat-card-sub">멤버 없음</div>
              </div>
            );
            return (
              <div key={team} className={`stat-card${state.curStaffTeam === team ? ' active' : ''}`}>
                <div className="stat-card-label">{team}</div>
                <div className="stat-card-val">{s.rate}%</div>
                <div className="stat-card-sub">{s.count}명 · {s.totalPresent}/{s.totalPossible}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 현재 그룹/팀 멤버별 통계 */}
      <div className="stat-section">
        <div className="stat-section-title">
          {isStaff ? state.curStaffTeam : GROUP_LABELS[state.curGroup]} 개인 통계
        </div>
        {members.length === 0 ? (
          <div className="empty-state"><div className="empty-text">멤버가 없습니다</div></div>
        ) : (
          <div className="stat-member-list">
            {members
              .map(m => ({ m, s: calcStats(state, gk, m.id) }))
              .sort((a, b) => b.s.rate - a.s.rate)
              .map(({ m, s }) => (
                <div key={m.id} className="stat-member-row">
                  <div className="stat-member-name">{m.name}</div>
                  <div className="stat-member-bar">
                    <div
                      className={`stat-bar-fill ${s.rate >= 80 ? 'fill-good' : s.rate >= 60 ? 'fill-mid' : 'fill-bad'}`}
                      style={{ width: `${s.rate}%` }}
                    />
                  </div>
                  <div className="stat-member-nums">
                    <span className={`stat-rate-badge rate-${s.rate >= 80 ? 'good' : s.rate >= 60 ? 'mid' : 'bad'}`}>
                      {s.rate}%
                    </span>
                    <span className="stat-detail">출석 {s.present} / 결석 {s.absent} / 지각 {s.tardy} (총 {validWeekCount}주)</span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
