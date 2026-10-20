'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/store/AppContext';
import { buildAdminDashboard, isAttendancePending, type AdminDashboardRow, type AdminDashboardStatus } from '@/utils/adminDashboard';
import AdminIcon from './AdminIcon';
import AdminStatusBadge from './AdminStatusBadge';

const STATUS_LABELS: Record<AdminDashboardStatus, string> = {
  complete: '입력 완료', partial: '입력 중', empty: '미입력',
  started: '입력 있음', 'all-absent': '출석 0명 확인',
  'no-students': '학생 없음', 'no-targets': '출석 대상 없음', 'no-week': '조회 주일 없음',
};

type StatusFilter = 'all' | 'pending' | 'complete' | 'started' | 'all-absent';

export default function ClassAttendanceOverview({ weekKey = '', onWeekChange, initialStatus = 'all' }: { weekKey?: string; onWeekChange?: (weekKey: string) => void; initialStatus?: StatusFilter }) {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const [part, setPart] = useState('all');
  const [grade, setGrade] = useState('all');
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);
  const model = useMemo(() => buildAdminDashboard(state, { weekKey, part, grade, search }), [state, weekKey, part, grade, search]);
  const selectedStatus = model.oneTap && status === 'complete' ? 'started'
    : !model.oneTap && (status === 'started' || status === 'all-absent') ? 'all' : status;
  const rows = model.rows.filter(row => selectedStatus === 'all'
    || (selectedStatus === 'complete' ? row.status === 'complete'
      : selectedStatus === 'pending' ? isAttendancePending(row)
      : selectedStatus === 'all-absent' ? row.status === 'all-absent'
      : row.status === 'started' || row.status === 'complete' || row.status === 'partial'))
    .sort((a, b) => Number(a.status === 'complete') - Number(b.status === 'complete') || b.unentered - a.unentered || a.label.localeCompare(b.label, 'ko', { numeric: true }));
  const summary = model.summary;
  const statusTabs: [StatusFilter, string, number][] = model.oneTap
    ? [['all', '전체', summary.classCount], ['pending', '확인 필요', summary.pendingClassCount],
      ['started', '입력 있음', summary.startedClassCount + summary.completeClassCount + summary.partialClassCount], ['all-absent', '출석 0명 확인', summary.allAbsentClassCount]]
    : [['all', '전체', summary.classCount], ['pending', '확인 필요', summary.pendingClassCount], ['complete', '완료', summary.completeClassCount]];

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

    <p className="cao-summary" aria-label="반별 출석 요약"><span>확인 필요 <b className={summary.pendingClassCount ? 'cao-attention' : ''}>{summary.pendingClassCount}개 반</b></span><span>{model.oneTap ? '미시작' : '입력 완료'} <b>{model.oneTap ? summary.emptyClassCount : summary.completeClassCount}/{summary.classCount}개 반</b></span><span>출석 <b>{summary.present}명</b> · 출석률 <b>{summary.attendanceRate === null ? '—' : `${summary.attendanceRate}%`}</b></span></p>

    <div className="cao-toolbar">
      <div className="ad-status-tabs" role="group" aria-label="출석 입력 상태">
        {statusTabs.map(([key, label, count]) =>
          <button type="button" key={key} data-status-tone={key === 'pending' ? 'warning' : key === 'complete' ? 'success' : key === 'started' || key === 'all-absent' ? 'info' : 'neutral'} aria-pressed={selectedStatus === key} onClick={() => setStatus(key)}>{key !== 'all' && <AdminIcon name={key === 'pending' ? 'clock' : key === 'started' ? 'info' : 'check'} />}{label}<span>{count}</span></button>)}
      </div>
      <div className="cao-filters">
        <label className="ad-search"><AdminIcon name="search" /><span className="ad-sr-only">반, 담임 교사 또는 학생 검색</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="반·담임·학생 검색" /></label>
        <select aria-label="부서 필터" value={part} onChange={event => setPart(event.target.value)}><option value="all">전체 부서</option><option value="1">1부</option><option value="2">2부</option></select>
        <select aria-label="학년 필터" value={grade} onChange={event => setGrade(event.target.value)}><option value="all">전체 학년</option>{[1, 2, 3].map(value => <option key={value} value={String(value)}>{value}학년</option>)}</select>
        {(part !== 'all' || grade !== 'all' || selectedStatus !== 'all' || query) && <button type="button" className="cao-reset" onClick={resetFilters}>필터 초기화</button>}
      </div>
    </div>

    {rows.length && model.selectedWeek ? <div className="cao-table-wrap"><table className="cao-table">
      <caption>{state.curYear}년 {model.selectedWeek.label} 반별 출석 현황</caption>
      <thead><tr><th scope="col">반 / 담임 교사</th><th scope="col">{model.oneTap ? '체크 상태' : '미입력'}</th><th scope="col">{model.oneTap ? '최근 입력' : '입력 현황'}</th><th scope="col">출석 / 결석</th><th scope="col">출석률</th><th scope="col"><span className="ad-sr-only">작업</span></th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.classKey}>
        <th scope="row"><button type="button" className="cao-class" onClick={() => openClass(row)}><strong>{row.label}</strong><span>{row.teacher || '담임 교사 미등록'}</span></button></th>
        <td className={row.unentered ? 'cao-attention' : ''}>{model.oneTap ? <><AdminStatusBadge
          label={row.status === 'empty' ? '미시작' : row.status === 'complete' ? '기존 입력 완료' : STATUS_LABELS[row.status]}
          tone={row.status === 'empty' || row.status === 'partial' ? 'warning' : row.status === 'started' || row.status === 'all-absent' ? 'info' : 'neutral'} />
          {row.status !== 'empty' && row.unentered > 0 && <small>{row.unentered}명 기록 확인 필요</small>}</> : <><strong>{row.unentered}명</strong><small><AdminStatusBadge label={STATUS_LABELS[row.status]} /></small></>}</td>
        <td>{model.oneTap ? <>{row.inputPresent}명 출석 체크<small>일반 학생 기준</small><small>{row.lastSavedAt ? <time dateTime={new Date(row.lastSavedAt).toISOString()}>마지막 저장 {new Date(row.lastSavedAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })}</time> : row.inputRecorded ? '기존 방식 입력' : '아직 입력하지 않았습니다.'}</small></> : <>{row.inputRecorded}/{row.inputStudentCount}명<small>입력률 {row.inputRate === null ? '—' : `${row.inputRate}%`}</small></>}</td><td>{row.present}명 / {model.oneTap && row.status === 'empty' && row.recorded === 0 ? '—' : `${row.absent}명`}</td><td>{row.attendanceRate === null ? '—' : `${row.attendanceRate}%`}</td>
        <td><button type="button" className="cao-open" aria-label={`${row.label} 출석 입력 열기`} onClick={() => openClass(row)}>출석 입력 <AdminIcon name="arrow" /></button></td>
      </tr>)}</tbody>
    </table></div> : <div className="ad-empty"><AdminIcon name={model.selectedWeek && selectedStatus === 'pending' ? 'check' : 'search'} size={26} /><h3>{model.selectedWeek && selectedStatus === 'pending' && summary.pendingClassCount === 0 ? '확인이 필요한 반이 없습니다.' : '조건에 맞는 반이 없습니다.'}</h3><p>{model.selectedWeek && selectedStatus === 'pending' && summary.pendingClassCount === 0 ? model.oneTap ? '미시작·기록 확인이 필요한 반이 없습니다. 입력 있음은 완료를 뜻하지 않습니다.' : '출석 대상이 있는 반의 입력이 모두 완료되었습니다.' : '조회 주일이나 필터를 바꿔 확인해 보세요.'}</p><button type="button" onClick={model.selectedWeek && selectedStatus === 'pending' && summary.pendingClassCount === 0 ? () => setStatus('all') : resetFilters}>{model.selectedWeek && selectedStatus === 'pending' && summary.pendingClassCount === 0 ? '전체 반 보기' : '필터 초기화'}</button></div>}
    <p className="cao-note">{model.oneTap ? <>첫 체크부터 일반 학생의 미체크를 결석으로 저장합니다. <strong>미시작</strong> 반은 전원 결석으로 계산하지 않습니다. <strong>입력 있음</strong>은 완료를 뜻하지 않으며 마지막 저장 시각으로 확인하세요. 출석 0명 확인은 교사가 일반 학생 전원 결석을 직접 기록한 반입니다. 전체 출석·결석 인원과 출석률에는 기존처럼 장결 기록을 포함합니다.</> : <><strong>입력률</strong>은 장결을 제외한 출석 대상 중 O·X가 입력된 비율입니다. <strong>출석률</strong>은 장결을 포함해 입력된 O·X 중 출석(O) 비율이며, 미입력은 결석으로 계산하지 않습니다.</>}</p>
  </section>;
}
