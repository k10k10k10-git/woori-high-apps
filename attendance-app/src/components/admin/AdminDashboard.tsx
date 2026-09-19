'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/store/AppContext';
import { buildAdminDashboard, type AdminDashboardRow, type AdminDashboardStatus } from '@/utils/adminDashboard';
import { buildPastoralReport } from '@/utils/pastoralReport';
import { useOpenVisitRequestCount } from '@/hooks/useVisitRequests';
import AdminIcon from './AdminIcon';
import './admin-dashboard.css';

const STATUS_LABELS: Record<AdminDashboardStatus, string> = {
  complete: '입력 완료', partial: '입력 중', empty: '미입력',
  'no-students': '학생 없음', 'no-targets': '출석 대상 없음', 'no-week': '조회 주일 없음',
};
type StatusFilter = 'all' | 'pending' | 'complete';

export default function AdminDashboard({ onShowTrends, onShowVisits }: { onShowTrends: () => void; onShowVisits: () => void }) {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const [pickedWeek, setPickedWeek] = useState<{ year: number; key: string } | null>(null);
  const [part, setPart] = useState('all');
  const [grade, setGrade] = useState('all');
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);
  const [status, setStatus] = useState<StatusFilter>('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const { classData, attData, months, events, curYear } = state;

  const model = useMemo(() => buildAdminDashboard({ classData, attData, months, events, curYear }, {
    weekKey: pickedWeek?.year === curYear ? pickedWeek.key : undefined,
    part, grade, search,
  }), [classData, attData, months, events, curYear, pickedWeek, part, grade, search]);
  const { weeks, selectedWeek, overallSummary: totals, summary } = model;
  const visitSummary = useOpenVisitRequestCount(curYear);
  const longAbsenceCount = useMemo(() => buildPastoralReport({ classData, attData, months, events, curYear }, [], Date.now(), selectedWeek?.key)
    .absent.filter(row => row.student.jang !== true).length,
  [classData, attData, months, events, curYear, selectedWeek?.key]);
  const inputClassCount = model.allRows.filter(row => row.inputStudentCount > 0).length;
  const rows = model.rows.filter(row => status === 'all'
    || (status === 'complete' ? row.status === 'complete' : row.status === 'empty' || row.status === 'partial'));
  const selectedIndex = weeks.findIndex(week => week.key === selectedWeek?.key);
  const hasFilters = part !== 'all' || grade !== 'all' || query !== '' || status !== 'all';

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', focusSearch);
    return () => document.removeEventListener('keydown', focusSearch);
  }, []);

  function selectWeek(key: string) { setPickedWeek({ year: curYear, key }); }
  function resetFilters() { setPart('all'); setGrade('all'); setQuery(''); setStatus('all'); }
  function showPending() { resetFilters(); setStatus('pending'); }
  function openClass(row: AdminDashboardRow) {
    dispatch({ type: 'SET_PART', payload: row.part });
    dispatch({ type: 'SET_GRADE', payload: row.grade });
    dispatch({ type: 'SET_CLASS', payload: row.classNumber });
    // 기존 출석 화면에서 선택한 주일이 속한 학기를 볼 수 있게 한다.
    if (selectedWeek) {
      const month = new Date(selectedWeek.dateValue).getUTCMonth() + 1;
      dispatch({ type: 'SET_VIEW', payload: month <= 6 ? 'first' : 'second' });
    }
    router.push(selectedWeek ? `/attendance?week=${encodeURIComponent(selectedWeek.key)}` : '/attendance');
  }

  return (
    <div className="admin-dashboard">
      <div className="ad-heading">
        <div>
          <h2>주간 출석</h2>
        </div>
        <div className="ad-week-control">
          <button className="ad-icon-button ad-previous" type="button" aria-label="이전 주일"
            disabled={selectedIndex <= 0} onClick={() => selectWeek(weeks[selectedIndex - 1].key)}>
            <AdminIcon name="chevron" />
          </button>
          <label className="ad-week-select">
            <AdminIcon name="calendar" />
            <span className="ad-sr-only">조회 주일</span>
            <select value={selectedWeek?.key ?? ''} disabled={weeks.length === 0} onChange={event => selectWeek(event.target.value)}>
              {weeks.length === 0 && <option value="">조회할 주일 없음</option>}
              {weeks.map(week => <option key={week.key} value={week.key}>{week.label} 주일</option>)}
            </select>
          </label>
          <button className="ad-icon-button" type="button" aria-label="다음 주일"
            disabled={selectedIndex < 0 || selectedIndex >= weeks.length - 1} onClick={() => selectWeek(weeks[selectedIndex + 1].key)}>
            <AdminIcon name="chevron" />
          </button>
        </div>
      </div>

      <dl className="ad-summary" aria-label="선택한 주일의 전체 현황">
        <div><dt>입력 완료</dt><dd>{selectedWeek && inputClassCount > 0 ? totals.completeClassCount : '—'}{inputClassCount > 0 && <span> / {inputClassCount}개 반</span>}</dd>
          <dd className="ad-summary-detail">출석 대상이 있는 반 기준</dd></div>
        <div><dt>출석 인원</dt><dd>{totals.present.toLocaleString()}<span>명</span></dd>
          <dd className="ad-summary-detail">전체 학생 {totals.studentCount.toLocaleString()}명</dd></div>
        <div><dt>출석률</dt><dd>{totals.attendanceRate === null ? '—' : `${totals.attendanceRate}%`}</dd>
          <dd className="ad-summary-detail">입력된 {totals.recorded.toLocaleString()}명 기준</dd></div>
        <div><dt>아직 입력하지 않은 학생</dt><dd className={totals.unentered ? 'ad-attention-number' : ''}>{selectedWeek ? totals.unentered.toLocaleString() : '—'}<span>{selectedWeek ? '명' : ''}</span></dd>
          <dd className="ad-summary-detail">입력률 {totals.inputRate === null ? '—' : `${totals.inputRate}%`} · 장결 제외</dd></div>
      </dl>

      <section className="ad-today" aria-labelledby="ad-today-title">
        <div className="ad-today-heading"><div><h2 id="ad-today-title">오늘 확인할 일</h2><p>{selectedWeek?.label ?? '조회 주일 없음'} 기준으로 먼저 살펴볼 항목입니다.</p></div></div>
        <div className="ad-today-list">
          <button type="button" onClick={showPending} disabled={!selectedWeek || totals.pendingClassCount === 0}>
            <span><AdminIcon name={totals.pendingClassCount ? 'clock' : 'check'} size={17} /><strong>출석 입력 확인</strong><small>미입력 {totals.emptyClassCount}개 · 입력 중 {totals.partialClassCount}개 반</small></span>
            <b>{selectedWeek ? `${totals.pendingClassCount}개 반` : '—'}</b><AdminIcon name="arrow" />
          </button>
          <button type="button" onClick={onShowVisits} disabled={visitSummary.status !== 'ready' || visitSummary.count === 0}>
            <span><AdminIcon name="book" size={17} /><strong>심방 요청</strong><small>교사가 직접 확인을 요청한 학생</small></span>
            <b>{visitSummary.status === 'ready' ? `${visitSummary.count}명` : '—'}</b><AdminIcon name="arrow" />
          </button>
          <Link href="/pastoral">
            <span><AdminIcon name="users" size={17} /><strong>연속 결석</strong><small>3회 이상 연속 결석한 일반 학생</small></span>
            <b>{selectedWeek ? `${longAbsenceCount}명` : '—'}</b><AdminIcon name="arrow" />
          </Link>
        </div>
      </section>

      <section className="ad-roster" aria-labelledby="ad-roster-title">
        <div className="ad-roster-heading">
          <h2 id="ad-roster-title">반별 입력 현황 <span>{totals.classCount}</span></h2>
          <button type="button" className="ad-text-link" onClick={onShowTrends}>연간 추이 보기 <AdminIcon name="arrow" /></button>
        </div>
        <div className="ad-toolbar">
          <div className="ad-status-tabs" role="group" aria-label="입력 상태 필터">
            {([
              ['all', '전체', summary.classCount], ['pending', '확인 필요', summary.pendingClassCount], ['complete', '완료', summary.completeClassCount],
            ] as const).map(([key, label, count]) => (
              <button type="button" key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
          <div className="ad-filters">
            <label className="ad-search"><AdminIcon name="search" /><span className="ad-sr-only">반, 교사 또는 학생 검색</span>
              <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="반, 교사, 학생 검색" type="search" />
              <kbd aria-hidden="true">/</kbd>
            </label>
            <select aria-label="현황 부서 필터" value={part} onChange={event => setPart(event.target.value)}>
              <option value="all">전체 부서</option><option value="1">1부</option><option value="2">2부</option>
            </select>
            <select aria-label="현황 학년 필터" value={grade} onChange={event => setGrade(event.target.value)}>
              <option value="all">전체 학년</option>{[1, 2, 3].map(value => <option key={value} value={String(value)}>{value}학년</option>)}
            </select>
          </div>
        </div>

        {rows.length > 0 && selectedWeek ? (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <caption className="ad-sr-only">{curYear}년 {selectedWeek.label} 반별 출석 입력 현황</caption>
              <thead><tr><th scope="col">반 / 담임 교사</th><th scope="col">입력 상태</th><th scope="col">입력 현황</th><th scope="col">출석</th><th scope="col">미입력</th><th scope="col"><span className="ad-sr-only">이동</span></th></tr></thead>
              <tbody>{rows.map(row => (
                <tr key={row.classKey}>
                  <th scope="row" className="ad-class-cell"><button type="button" onClick={() => openClass(row)}>
                    <span className="ad-class-mark" aria-hidden="true">{row.part}</span>
                    <span><strong>{row.label}</strong><small>{row.teacher || '담임 교사 미등록'}</small></span>
                  </button></th>
                  <td className="ad-status-cell"><span className={`ad-status ad-status-${row.status}`}><i aria-hidden="true" />{STATUS_LABELS[row.status]}</span></td>
                  <td className="ad-progress-cell"><div className="ad-progress-label"><span>{row.inputRecorded}<span className="ad-muted"> / {row.inputStudentCount}명</span></span><span>{row.inputRate === null ? '—' : `${row.inputRate}%`}</span></div>
                    <div className="ad-progress-track" aria-hidden="true"><div style={{ transform: `scaleX(${(row.inputRate ?? 0) / 100})` }} /></div></td>
                  <td className="ad-number-cell"><span className="ad-mobile-label">출석</span>{row.present}<span className="ad-unit">명</span></td>
                  <td className={`ad-number-cell${row.unentered ? ' ad-pending-cell' : ''}`}><span className="ad-mobile-label">미입력</span>{row.unentered || '—'}{row.unentered > 0 && <span className="ad-unit">명</span>}</td>
                  <td className="ad-open-cell"><button className="ad-icon-button" type="button" aria-label={`${row.label} 출석부 열기`} onClick={() => openClass(row)}><AdminIcon name="arrow" /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="ad-empty">
            <AdminIcon name={totals.classCount ? 'search' : 'users'} size={26} />
            <h3>{!selectedWeek ? '조회할 주일이 없습니다.' : totals.classCount === 0 ? '등록된 반이 없습니다.' : '조건에 맞는 반이 없습니다.'}</h3>
            <p>{!selectedWeek ? '이 연도의 행사 설정을 확인하거나 다른 연도를 선택해 주세요.' : totals.classCount === 0 ? '학생 관리에서 반과 학생을 등록하면 출석 현황을 확인할 수 있습니다.' : '검색어를 바꾸거나 필터를 초기화해 보세요.'}</p>
            {hasFilters ? <button type="button" onClick={resetFilters}>필터 초기화</button> : <Link href={!selectedWeek ? '/admin' : '/manage'}>{!selectedWeek ? '행사 설정 확인' : '학생 관리로 이동'} <AdminIcon name="arrow" /></Link>}
          </div>
        )}
        <div className="ad-table-footer"><span role="status" aria-live="polite">{rows.length}개 반 표시{hasFilters && ' · 필터 적용 중'}</span>{hasFilters && <button type="button" onClick={resetFilters}>필터 초기화</button>}</div>
      </section>

      <div className="ad-bottom-note"><span>입력 현황은 장결 학생을 제외합니다. 출석률은 장결을 포함한 입력 기록(O·X) 중 출석(O)의 비율입니다.</span><Link href="/admin">계정·행사 설정 <AdminIcon name="arrow" /></Link></div>
    </div>
  );
}
