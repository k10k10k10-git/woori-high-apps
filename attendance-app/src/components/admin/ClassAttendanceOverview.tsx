'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/store/AppContext';
import { buildAdminDashboard, type AdminDashboardRow, type AdminDashboardStatus } from '@/utils/adminDashboard';
import AdminIcon from './AdminIcon';

const STATUS_LABELS: Record<AdminDashboardStatus, string> = {
  complete: '입력 완료', partial: '입력 중', empty: '미입력',
  'no-students': '학생 없음', 'no-targets': '출석 대상 없음', 'no-week': '조회 주일 없음',
};

type StatusFilter = 'all' | 'pending' | 'complete';

export default function ClassAttendanceOverview({ weekKey = '', onWeekChange, initialStatus = 'all' }: { weekKey?: string; onWeekChange?: (weekKey: string) => void; initialStatus?: StatusFilter }) {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const [part, setPart] = useState('all');
  const [grade, setGrade] = useState('all');
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);
  const model = useMemo(() => buildAdminDashboard(state, { weekKey, part, grade, search }), [state, weekKey, part, grade, search]);
  const rows = model.rows.filter(row => status === 'all'
    || (status === 'complete' ? row.status === 'complete' : row.status === 'empty' || row.status === 'partial'))
    .sort((a, b) => Number(a.status === 'complete') - Number(b.status === 'complete') || b.unentered - a.unentered || a.label.localeCompare(b.label, 'ko', { numeric: true }));
  const summary = model.summary;

  function openClass(row: AdminDashboardRow) {
    dispatch({ type: 'SET_PART', payload: row.part });
    dispatch({ type: 'SET_GRADE', payload: row.grade });
    dispatch({ type: 'SET_CLASS', payload: row.classNumber });
    if (model.selectedWeek) {
      const month = new Date(model.selectedWeek.dateValue).getUTCMonth() + 1;
      dispatch({ type: 'SET_VIEW', payload: month <= 6 ? 'first' : 'second' });
    }
    router.push(`/attendance?view=check${model.selectedWeek ? `&week=${encodeURIComponent(model.selectedWeek.key)}` : ''}`);
  }

  function resetFilters() {
    setPart('all'); setGrade('all'); setStatus('all'); setQuery('');
  }

  return <section className="class-attendance-overview" aria-labelledby="class-attendance-title">
    <div className="cao-heading">
      <div><h2 id="class-attendance-title">반별 출석 현황</h2><p>한 화면에서 반별 입력 상태와 출석 인원·출석률을 비교하세요.</p></div>
      <label className="cao-week"><span>조회 주일</span><select value={model.selectedWeek?.key ?? ''} onChange={event => onWeekChange?.(event.target.value)}>
        {!model.weeks.length && <option value="">조회할 주일 없음</option>}
        {model.weeks.map(week => <option key={week.key} value={week.key}>{week.label}</option>)}
      </select></label>
    </div>

    <p className="cao-summary" aria-label="반별 출석 요약"><span>확인 필요 <b className={summary.pendingClassCount ? 'cao-attention' : ''}>{summary.pendingClassCount}개 반</b></span><span>입력 완료 <b>{summary.completeClassCount}/{summary.classCount}개 반</b></span><span>출석 <b>{summary.present}명</b> · 출석률 <b>{summary.attendanceRate === null ? '—' : `${summary.attendanceRate}%`}</b></span></p>

    <div className="cao-toolbar">
      <div className="ad-status-tabs" role="group" aria-label="출석 입력 상태">
        {([['all', '전체', summary.classCount], ['pending', '확인 필요', summary.pendingClassCount], ['complete', '완료', summary.completeClassCount]] as const).map(([key, label, count]) =>
          <button type="button" key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>{label}<span>{count}</span></button>)}
      </div>
      <div className="cao-filters">
        <label className="ad-search"><AdminIcon name="search" /><span className="ad-sr-only">반, 담임 교사 또는 학생 검색</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="반·담임·학생 검색" /></label>
        <select aria-label="부서 필터" value={part} onChange={event => setPart(event.target.value)}><option value="all">전체 부서</option><option value="1">1부</option><option value="2">2부</option></select>
        <select aria-label="학년 필터" value={grade} onChange={event => setGrade(event.target.value)}><option value="all">전체 학년</option>{[1, 2, 3].map(value => <option key={value} value={String(value)}>{value}학년</option>)}</select>
        {(part !== 'all' || grade !== 'all' || status !== 'all' || query) && <button type="button" className="cao-reset" onClick={resetFilters}>필터 초기화</button>}
      </div>
    </div>

    {rows.length && model.selectedWeek ? <div className="cao-table-wrap"><table className="cao-table">
      <caption>{state.curYear}년 {model.selectedWeek.label} 반별 출석 현황</caption>
      <thead><tr><th scope="col">반 / 담임 교사</th><th scope="col">미입력</th><th scope="col">입력 현황</th><th scope="col">출석 / 결석</th><th scope="col">출석률</th><th scope="col"><span className="ad-sr-only">작업</span></th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.classKey}>
        <th scope="row"><button type="button" className="cao-class" onClick={() => openClass(row)}><strong>{row.label}</strong><span>{row.teacher || '담임 교사 미등록'}</span></button></th>
        <td className={row.unentered ? 'cao-attention' : ''}><strong>{row.unentered}명</strong><small>{STATUS_LABELS[row.status]}</small></td>
        <td>{row.inputRecorded}/{row.inputStudentCount}명<small>입력률 {row.inputRate === null ? '—' : `${row.inputRate}%`}</small></td><td>{row.present}명 / {row.absent}명</td><td>{row.attendanceRate === null ? '—' : `${row.attendanceRate}%`}</td>
        <td><button type="button" className="cao-open" aria-label={`${row.label} 출석 입력 열기`} onClick={() => openClass(row)}>출석 입력 <AdminIcon name="arrow" /></button></td>
      </tr>)}</tbody>
    </table></div> : <div className="ad-empty"><AdminIcon name={model.selectedWeek && status === 'pending' ? 'check' : 'search'} size={26} /><h3>{model.selectedWeek && status === 'pending' && summary.pendingClassCount === 0 ? '확인이 필요한 반이 없습니다.' : '조건에 맞는 반이 없습니다.'}</h3><p>{model.selectedWeek && status === 'pending' && summary.pendingClassCount === 0 ? '출석 대상이 있는 반의 입력이 모두 완료되었습니다.' : '조회 주일이나 필터를 바꿔 확인해 보세요.'}</p><button type="button" onClick={model.selectedWeek && status === 'pending' && summary.pendingClassCount === 0 ? () => setStatus('all') : resetFilters}>{model.selectedWeek && status === 'pending' && summary.pendingClassCount === 0 ? '전체 반 보기' : '필터 초기화'}</button></div>}
    <p className="cao-note"><strong>입력률</strong>은 장결을 제외한 출석 대상 중 O·X가 입력된 비율입니다. <strong>출석률</strong>은 장결을 포함해 입력된 O·X 중 출석(O) 비율이며, 미입력은 결석으로 계산하지 않습니다.</p>
  </section>;
}
