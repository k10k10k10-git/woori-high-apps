'use client';

import { useState, useMemo } from 'react';
import { useApp, calcStats, effectiveKey } from '@/store/AppContext';
import { evKey } from '@/utils/dates';
import { saveAttendance } from '@/lib/db';
import GroupNav from '@/components/GroupNav';
import AttModal from '@/components/modals/AttModal';
import type { GroupKey, AttEditTarget, AttValue } from '@/types';

const ATT_CYCLE: AttValue[] = ['O', 'X', 'T', ''];

function nextAtt(v: AttValue): AttValue {
  const idx = ATT_CYCLE.indexOf(v);
  return ATT_CYCLE[(idx + 1) % ATT_CYCLE.length];
}

function AttBadge({ v }: { v: AttValue }) {
  if (v === 'O') return <span className="att-o">O</span>;
  if (v === 'X') return <span className="att-x">X</span>;
  if (v === 'T') return <span className="att-t">T</span>;
  return <span className="att-empty">-</span>;
}

export default function AttendanceTab() {
  const { state, dispatch } = useApp();
  const { curYear, months, events, attData, groupData } = state;
  const gk = effectiveKey(state);
  const members = groupData[gk]?.members ?? [];
  const isAdmin = !state.userRole || state.userRole.role === 'admin';

  const [subView, setSubView] = useState<'check' | 'table'>('check');

  // 이번 주 키 (KST 기준 가장 최근 일요일)
  const thisWeekKey = useMemo(() => {
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const dayOfWeek = now.getUTCDay();
    const lastSun = new Date(now);
    lastSun.setUTCDate(now.getUTCDate() - dayOfWeek);
    const sunMonth = lastSun.getUTCMonth() + 1;
    const sunDate = lastSun.getUTCDate();
    for (let mi = 0; mi < months.length; mi++) {
      if (months[mi].month === sunMonth) {
        for (let di = 0; di < months[mi].sundays.length; di++) {
          if (months[mi].sundays[di] === sunDate) return evKey(mi, di);
        }
      }
    }
    return null;
  }, [months]);

  const thisWeekLabel = useMemo(() => {
    if (!thisWeekKey) return '';
    const [mi, di] = thisWeekKey.split('-').map(Number);
    const m = months[mi]; if (!m) return '';
    return `${m.month}월 ${m.sundays[di]}일`;
  }, [thisWeekKey, months]);

  const validWeeks = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    months.forEach(({ month, sundays }, mi) => {
      sundays.forEach((day, di) => {
        const k = evKey(mi, di);
        if (!events[k]) list.push({ key: k, label: `${month}/${day}` });
      });
    });
    return list;
  }, [months, events]);

  function handleQuickToggle(mid: string, k: string) {
    const cur = (attData[gk]?.[mid]?.[k] ?? '') as AttValue;
    const next = nextAtt(cur);
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    void saveAttendance(curYear, gk, mid, k, next)
      .then(() => dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' }))
      .catch(() => dispatch({ type: 'SET_SAVE_STATUS', payload: 'idle' }));
  }

  function openAttModal(mid: string, k: string) {
    dispatch({ type: 'OPEN_ATT_MODAL', payload: { gk: gk as GroupKey, mid, k } });
  }

  if (members.length === 0) {
    return (
      <div className="att-tab">
        <GroupNav />
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <div className="empty-text">멤버가 없습니다</div>
          {isAdmin && state.curGroup === 'staff' && (
            <div className="empty-sub">설정 탭에서 멤버를 추가해 주세요</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="att-tab">
      <GroupNav />

      <div className="sub-tab-row">
        <button className={`sub-tab-btn${subView === 'check' ? ' active' : ''}`} onClick={() => setSubView('check')}>
          체크
        </button>
        <button className={`sub-tab-btn${subView === 'table' ? ' active' : ''}`} onClick={() => setSubView('table')}>
          전체 표
        </button>
      </div>

      {subView === 'check' && (
        <div className="check-view">
          <div className="check-week-label">
            {thisWeekLabel ? `${thisWeekLabel} 출석` : '이번 주 일요일 데이터 없음'}
          </div>
          <div className="check-list">
            {members.map(m => {
              const v = thisWeekKey ? ((attData[gk]?.[m.id]?.[thisWeekKey] ?? '') as AttValue) : '';
              const stats = calcStats(state, gk, m.id);
              return (
                <div key={m.id} className="check-item">
                  <div className="check-name">{m.name}</div>
                  <div className="check-stats">{stats.present}/{stats.total} ({stats.rate}%)</div>
                  <button
                    className={`check-att-btn att-btn-${v || 'empty'}`}
                    onClick={() => thisWeekKey && handleQuickToggle(m.id, thisWeekKey)}
                    disabled={!thisWeekKey}
                  >
                    {v || '-'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subView === 'table' && (
        <div className="table-view">
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th className="att-th-name">이름</th>
                  {months.map(({ month, sundays }, mi) =>
                    sundays.map((day, di) => {
                      const k = evKey(mi, di);
                      const ev = events[k];
                      return (
                        <th key={k} className={`att-th-cell${ev ? ' holiday' : ''}`}>
                          {ev ? <span className="holiday-label">{ev}</span> : (
                            <>
                              <div className="cell-month">{month}월</div>
                              <div className="cell-day">{day}</div>
                            </>
                          )}
                        </th>
                      );
                    })
                  )}
                  <th className="att-th-stat">출석률</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const stats = calcStats(state, gk, m.id);
                  return (
                    <tr key={m.id}>
                      <td className="att-td-name">{m.name}</td>
                      {months.map(({ sundays }, mi) =>
                        sundays.map((_, di) => {
                          const k = evKey(mi, di);
                          const ev = events[k];
                          if (ev) return <td key={k} className="att-td-holiday" />;
                          const v = (attData[gk]?.[m.id]?.[k] ?? '') as AttValue;
                          return (
                            <td
                              key={k}
                              className="att-td-cell"
                              onClick={() => isAdmin
                                ? openAttModal(m.id, k)
                                : handleQuickToggle(m.id, k)
                              }
                            >
                              <AttBadge v={v} />
                            </td>
                          );
                        })
                      )}
                      <td className="att-td-stat">
                        <span className={`stat-rate rate-${stats.rate >= 80 ? 'good' : stats.rate >= 60 ? 'mid' : 'bad'}`}>
                          {stats.rate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-legend">
            <span className="att-o">O</span> 출석 &nbsp;
            <span className="att-x">X</span> 결석 &nbsp;
            <span className="att-t">T</span> 지각
          </div>
        </div>
      )}

      {state.attModal.open && state.attModal.target && (
        <AttModal
          target={state.attModal.target}
          onClose={() => dispatch({ type: 'CLOSE_ATT_MODAL' })}
          validWeeks={validWeeks}
        />
      )}
    </div>
  );
}
