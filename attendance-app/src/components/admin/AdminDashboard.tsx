'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/store/AppContext';
import { buildAdminDashboard, isAttendancePending, type AdminDashboardRow } from '@/utils/adminDashboard';
import { buildPastoralReport } from '@/utils/pastoralReport';
import { useOpenVisitRequests } from '@/hooks/useVisitRequests';
import AdminIcon from './AdminIcon';
import './admin-dashboard.css';
import './admin-status.css';

export default function AdminDashboard() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const [pickedWeek, setPickedWeek] = useState<{ year: number; key: string } | null>(null);
  const { classData, attData, months, events, curYear, attendanceChecks } = state;
  const model = useMemo(() => buildAdminDashboard({ classData, attData, months, events, curYear, attendanceChecks }, {
    weekKey: pickedWeek?.year === curYear ? pickedWeek.key : undefined,
  }), [classData, attData, months, events, curYear, attendanceChecks, pickedWeek]);
  const report = useMemo(() => buildPastoralReport({ classData, attData, months, events, curYear }, [], Date.now(), model.selectedWeek?.key),
    [classData, attData, months, events, curYear, model.selectedWeek?.key]);
  const visits = useOpenVisitRequests(curYear);
  const absences = report.absent.filter(row => row.student.jang !== true);
  const pending = [...model.allRows]
    .filter(isAttendancePending)
    .sort((a, b) => b.unentered - a.unentered || a.label.localeCompare(b.label, 'ko', { numeric: true }));
  const { weeks, selectedWeek, overallSummary: totals } = model;
  const selectedIndex = weeks.findIndex(week => week.key === selectedWeek?.key);
  const weekQuery = selectedWeek ? `&week=${encodeURIComponent(selectedWeek.key)}` : '';
  const inputClassCount = model.allRows.filter(row => row.inputStudentCount > 0).length;

  function selectWeek(key: string) { setPickedWeek({ year: curYear, key }); }
  function openClass(row: AdminDashboardRow) {
    dispatch({ type: 'SET_PART', payload: row.part });
    dispatch({ type: 'SET_GRADE', payload: row.grade });
    dispatch({ type: 'SET_CLASS', payload: row.classNumber });
    if (selectedWeek) {
      const month = new Date(selectedWeek.dateValue).getUTCMonth() + 1;
      dispatch({ type: 'SET_VIEW', payload: month <= 6 ? 'first' : 'second' });
    }
    router.push(`/attendance?view=check${weekQuery}`);
  }

  return <div className="admin-dashboard">
    <header className="ad-heading">
      <div><h1>오늘 업무</h1><p>지금 연락하거나 입력을 확인할 대상부터 보여드립니다.</p></div>
      <div className="ad-week-control">
        <button className="ad-icon-button ad-previous" type="button" aria-label="이전 주일" disabled={selectedIndex <= 0} onClick={() => selectWeek(weeks[selectedIndex - 1].key)}><AdminIcon name="chevron" /></button>
        <label className="ad-week-select"><AdminIcon name="calendar" /><span className="ad-sr-only">조회 주일</span><select value={selectedWeek?.key ?? ''} disabled={!weeks.length} onChange={event => selectWeek(event.target.value)}>{!weeks.length && <option value="">조회할 주일 없음</option>}{weeks.map(week => <option key={week.key} value={week.key}>{week.label} 주일</option>)}</select></label>
        <button className="ad-icon-button" type="button" aria-label="다음 주일" disabled={selectedIndex < 0 || selectedIndex >= weeks.length - 1} onClick={() => selectWeek(weeks[selectedIndex + 1].key)}><AdminIcon name="chevron" /></button>
      </div>
    </header>

    <div className="ad-glance" aria-label="업무 현황">
      <div className="ad-glance-current" role="group" aria-label={`${curYear}년 현재 미처리 심방 요청`}>
        <small className="ad-glance-period">{curYear}년 현재 미처리</small>
        <span><b>{visits.status === 'ready' ? visits.rows.length : '—'}</b>명 심방 요청</span>
      </div>
      <div className="ad-glance-week" role="group" aria-label={`${selectedWeek?.label ?? '조회 주일 없음'} 출석 현황`}>
        <small className="ad-glance-period">{selectedWeek?.label ?? '조회 주일 없음'} 기준</small>
        <div>
          <span><b>{selectedWeek ? totals.pendingClassCount : '—'}</b>개 반 입력 확인</span>
          <span><b>{selectedWeek ? absences.length : '—'}</b>명 연속 결석</span>
          <span className="ad-glance-attendance">출석 <b>{selectedWeek ? totals.present : '—'}</b>명 · 출석률 <b>{totals.attendanceRate === null ? '—' : `${totals.attendanceRate}%`}</b><small>{!selectedWeek ? '조회할 주일이 없어 입력 인원을 계산하지 않습니다.' : model.oneTap
            ? `O·X 집계 ${totals.recorded}명 기준 · 입력 있음 ${totals.startedClassCount}개 반 · 출석 0명 확인 ${totals.allAbsentClassCount}개 반`
            : `O·X 입력 ${totals.recorded}명 기준 · 출석 체크 ${totals.inputRecorded}/${totals.inputStudentCount}명 완료(장결 제외)`}</small></span>
        </div>
      </div>
    </div>

    <section className="ad-worklist" aria-labelledby="ad-worklist-title">
      <div className="ad-section-heading"><div><h2 id="ad-worklist-title">먼저 확인하세요</h2><p>심방은 {curYear}년 현재 미처리 요청 · 결석과 출석 입력은 {selectedWeek?.label ?? '조회 주일 없음'} 기준입니다. {model.oneTap ? '체크를 시작한 반의 미체크는 결석으로 집계하며, 미시작 반은 별도로 확인합니다. 입력 있음은 완료를 뜻하지 않습니다.' : '미입력은 결석으로 계산하지 않습니다.'}</p></div></div>
      <div className="ad-work-groups">
        <article data-status-tone={visits.status === 'error' ? 'danger' : visits.status === 'loading' ? 'info' : visits.rows.length ? 'warning' : 'neutral'} className={visits.status === 'ready' && !visits.rows.length ? 'ad-work-idle' : undefined}>
          <header><span className="ad-work-icon"><AdminIcon name="book" size={17} /></span><div><h3>심방 요청 <b>{visits.status === 'ready' ? visits.rows.length : '—'}</b></h3><p>{curYear}년 미처리 · 교사가 확인을 요청했습니다.</p></div><Link href="/pastoral?view=visits">전체 보기 <AdminIcon name="arrow" /></Link></header>
          {visits.status === 'ready' && visits.rows.length ? <ul>{visits.rows.slice(0, 3).map(row => { const [part, grade, cls] = row.classKey.split('-'); return <li key={`${row.classKey}/${row.id}`}><span><strong>{row.studentName}</strong><small>{part}부 {grade}학년 {cls}반 · {row.text}</small></span><Link aria-label={`${row.studentName} 심방 요청 보기`} href={`/pastoral?view=visits&request=${encodeURIComponent(`${row.classKey}/${row.id}`)}`}><AdminIcon name="arrow" /></Link></li>; })}</ul> : <p className="ad-work-empty">{visits.status === 'loading' ? '요청을 불러오는 중입니다.' : visits.status === 'error' ? '요청을 불러오지 못했습니다.' : '확인할 심방 요청이 없습니다.'}</p>}
        </article>
        <article data-status-tone={selectedWeek && absences.length ? 'danger' : 'neutral'} className={selectedWeek && !absences.length ? 'ad-work-idle' : undefined}>
          <header><span className="ad-work-icon"><AdminIcon name="users" size={17} /></span><div><h3>연속 결석 <b>{selectedWeek ? absences.length : '—'}</b></h3><p>확인된 결석이 3회 이상 이어졌습니다.</p></div><Link href={`/pastoral?view=absence${weekQuery}`}>전체 보기 <AdminIcon name="arrow" /></Link></header>
          {absences.length ? <ul>{absences.slice(0, 3).map(row => <li key={row.key}><span><strong>{row.student.name}</strong><small>{row.label} · {row.streak}회 연속 결석</small></span><Link aria-label={`${row.student.name} 연속 결석 보기`} href={`/pastoral?view=absence&student=${encodeURIComponent(row.key)}${weekQuery}`}><AdminIcon name="arrow" /></Link></li>)}</ul> : <p className="ad-work-empty">{selectedWeek ? '3회 이상 연속 결석한 학생이 없습니다.' : '조회할 주일이 없습니다.'}</p>}
        </article>
        <article data-status-tone={!selectedWeek || !inputClassCount ? 'neutral' : pending.length ? 'warning' : 'success'} className={selectedWeek && !pending.length ? 'ad-work-idle' : undefined}>
          <header><span className="ad-work-icon"><AdminIcon name={pending.length ? 'clock' : 'check'} size={17} /></span><div><h3>{model.oneTap ? '출석 미시작·확인' : '출석 미입력'} <b>{selectedWeek ? pending.length : '—'}</b></h3><p>{inputClassCount}개 대상 반 중 {model.oneTap ? '미시작·기록 확인이 필요한 반입니다.' : '입력이 덜 끝난 반입니다.'}</p></div><Link href={`/attendance?view=overview&status=pending${weekQuery}`}>전체 보기 <AdminIcon name="arrow" /></Link></header>
          {pending.length ? <ul>{pending.slice(0, 3).map(row => <li key={row.classKey}><span><strong>{row.label}</strong><small>{row.teacher || '담임 미등록'} · {model.oneTap && row.status === 'empty' ? '체크 미시작' : `${row.unentered}명 미입력`}</small></span><button type="button" aria-label={`${row.label} 출석 입력 열기`} onClick={() => openClass(row)}><AdminIcon name="arrow" /></button></li>)}</ul> : <p className="ad-work-empty">{!selectedWeek ? '조회할 주일이 없습니다.' : model.oneTap ? '미시작·기록 확인이 필요한 반이 없습니다.' : '모든 대상 반의 입력이 끝났습니다.'}</p>}
        </article>
      </div>
    </section>

    <section className="ad-shortcuts" aria-labelledby="ad-shortcuts-title"><h2 id="ad-shortcuts-title">바로가기</h2><div>
      <Link href="/manage?view=directory"><AdminIcon name="search" /><span><strong>학생 찾기·이동</strong><small>이름으로 찾아 상세 확인</small></span><AdminIcon name="arrow" /></Link>
      <Link href="/manage?view=class"><AdminIcon name="users" /><span><strong>반 명단 관리</strong><small>학생 추가와 반 편성</small></span><AdminIcon name="arrow" /></Link>
      <Link href="/admin"><AdminIcon name="settings" /><span><strong>계정·행사 설정</strong><small>운영 설정 열기</small></span><AdminIcon name="arrow" /></Link>
    </div></section>
  </div>;
}
