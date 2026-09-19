'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { auth } from '@/lib/firebase/client';
import { isDemoAccount } from '@/lib/demo';
import { canUseAdminWorkspace } from '@/lib/adminNavigation';
import { subscribeReportFriends } from '@/lib/pastoralFriends';
import { buildPastoralReport, sortReportStudents, type ReportSort, type ReportFriend, type ReportStudent } from '@/utils/pastoralReport';
import './admin-overview.css';
import './pastoral-report.css';

const SECTIONS = ['새친구 정착현황', '연속 결석', '이번 주 요약'] as const;
type Section = typeof SECTIONS[number];
type FriendLoad = { status: 'loading' | 'ready' | 'error'; friends: ReportFriend[] };

function Phone({ value, label }: { value?: string; label: string }) {
  const number = value?.replace(/[^\d+]/g, '');
  return <span className="pr-phone"><small>{label}</small>{number && /\d{7}/.test(number)
    ? <a href={`tel:${number}`}>{value}</a> : <span>연락처 미등록</span>}</span>;
}

function StudentRows({ rows, empty }: { rows: ReportStudent[]; empty: string }) {
  if (!rows.length) return <p className="pr-empty">{empty}</p>;
  return <ul className="pr-students">{rows.map(row => {
    const boundary = row.recent[row.streak];
    const interruptedByMissing = !row.recovered && !!boundary && !boundary.value;
    return <li key={row.key}>
      <div><strong>{row.student.name}</strong>{row.student.jang && <span className="pr-badge">기존 장결</span>}
        <p>{row.label} · 담임 {row.teacher || '미등록'}</p></div>
      <div><strong>{row.recovered ? '다시 출석' : `확인된 연속 결석 ${row.streak}회`}</strong>
        {interruptedByMissing && <span className="pr-badge">이전 미입력 있음</span>}
        <p>마지막 출석: {row.lastPresent?.label ?? '조회 연도 기록 없음'}</p>
        {interruptedByMissing && <p>{boundary.week.label} 미입력 이전은 연속 횟수에서 제외됩니다.</p>}
        <p>최근 4회: {row.recent.slice(0, 4).reverse().map(cell => `${cell.week.label} ${cell.value === 'O' ? '출석' : cell.value === 'X' ? '결석' : '미입력'}`).join(' / ')}</p></div>
      <div><Phone value={row.student.phone} label="학생" /><Phone value={row.student.pphone} label="보호자" /></div>
    </li>;
  })}</ul>;
}

export default function PastoralReport() {
  const { state } = useApp();
  if (!canUseAdminWorkspace(state.userRole, isDemoAccount(auth.currentUser?.email))) return <p className="pr-empty">관리자 로그인 후 이용할 수 있습니다.</p>;
  // 연도·인증 세대 전환 시 이전 새친구 자료와 필터를 즉시 폐기한다.
  return <ReportContent key={`${state.curYear}/${state.dataRevision}`} />;
}

function ReportContent() {
  const { state } = useApp();
  const [section, setSection] = useState<Section>('새친구 정착현황');
  const [part, setPart] = useState('');
  const [grade, setGrade] = useState('');
  const [classKey, setClassKey] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [weekKey, setWeekKey] = useState('');
  const [longAbsent, setLongAbsent] = useState('active');
  const [sortOrder, setSortOrder] = useState<ReportSort>('absence');
  const [load, setLoad] = useState<FriendLoad>({ status: 'loading', friends: [] });
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => { if (active) setLoad({ status: 'error', friends: [] }); }, 12000);
    const stop = subscribeReportFriends(state.curYear, friends => {
      if (active) { clearTimeout(timeout); setLoad({ status: 'ready', friends }); }
    }, () => { if (active) { clearTimeout(timeout); setLoad({ status: 'error', friends: [] }); } });
    return () => { active = false; clearTimeout(timeout); stop(); };
  }, [state.curYear, revision]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const report = useMemo(() => buildPastoralReport(state, load.friends, now, weekKey), [state, load.friends, now, weekKey]);
  const query = search.trim().normalize('NFC').toLocaleLowerCase('ko');
  const classes = Object.keys(state.classData).filter(key => (!part || key.split('-')[0] === part) && (!grade || key.split('-')[1] === grade)).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
  const selectedClass = classes.includes(classKey) ? classKey : '';
  function matches(row: ReportStudent) {
    const [p, g] = row.classKey.split('-');
    return (!part || part === p) && (!grade || grade === g) && (!selectedClass || row.classKey === selectedClass)
      && (!query || `${row.student.name} ${row.label} ${row.teacher}`.normalize('NFC').toLocaleLowerCase('ko').includes(query));
  }
  const absent = sortReportStudents(report.absent.filter(matches).filter(row => longAbsent === 'all' || (longAbsent === 'long' ? row.student.jang === true : row.student.jang !== true)), sortOrder);
  const recovered = sortReportStudents(report.recovered.filter(matches), sortOrder);
  const friends = report.settlement.filter(item => item.row ? matches(item.row)
    : !selectedClass && (!part || part === item.friend.part) && (!grade || grade === item.friend.grade)
      && (!query || `${item.friend.name} ${item.friend.owner ?? ''}`.normalize('NFC').toLocaleLowerCase('ko').includes(query)));
  const activeAbsent = sortReportStudents(report.absent.filter(row => row.student.jang !== true && matches(row)), sortOrder);
  const filteredRows = report.rows.filter(matches);
  const missing = filteredRows.filter(row => row.student.jang !== true && row.recent[0] && !row.recent[0].value).length;

  return <div className="admin-overview pastoral-report">
    <header className="ao-heading"><h1>목양 리포트</h1><p>새친구의 출석 흐름과 연락이 필요한 친구들을 살펴보세요.</p></header>
    <div className="ao-sections" role="group" aria-label="목양 리포트 보기 선택">{SECTIONS.map(name => <button type="button" key={name} aria-pressed={section === name} aria-controls="pr-content" onClick={() => setSection(name)}>{name}</button>)}</div>
    <div className={`pr-filters${filtersOpen ? ' pr-filters-open' : ''}`}>
      <label>기준 주일<select value={report.selectedWeek?.key ?? ''} onChange={e => setWeekKey(e.target.value)}>{!report.weeks.length && <option value="">조회할 주일 없음</option>}{report.weeks.map(week => <option key={week.key} value={week.key}>{week.label}</option>)}</select></label>
      <button className="pr-filter-toggle" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)}>상세 필터{part || grade || selectedClass ? ' · 적용 중' : ''}</button>
      <label className="pr-advanced">부서<select value={part} onChange={e => { setPart(e.target.value); setClassKey(''); }}><option value="">전체 부서</option>{[...new Set(Object.keys(state.classData).map(key => key.split('-')[0]))].sort().map(p => <option key={p} value={p}>{p}부</option>)}</select></label>
      <label className="pr-advanced">학년<select value={grade} onChange={e => { setGrade(e.target.value); setClassKey(''); }}><option value="">전체 학년</option>{[...new Set(Object.keys(state.classData).map(key => key.split('-')[1]))].sort().map(g => <option key={g} value={g}>{g}학년</option>)}</select></label>
      <label className="pr-advanced">반<select value={selectedClass} onChange={e => setClassKey(e.target.value)}><option value="">전체 반</option>{classes.map(key => <option key={key} value={key}>{key.split('-').map((value, i) => `${value}${['부', '학년', '반'][i]}`).join(' ')}</option>)}</select></label>
      <label className="pr-search">이름·반·담임 검색<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="이름 또는 담당 교사" /></label>
      <button className={search ? '' : 'pr-advanced'} type="button" onClick={() => { setPart(''); setGrade(''); setClassKey(''); setSearch(''); }}>필터 초기화</button>
    </div>
    <p className="pr-note">{state.curYear}년 {report.selectedWeek?.label ?? '조회할 정상 주일 없음'} 기준 · 행사 주일 제외 · 미입력은 결석으로 계산하지 않습니다.</p>
    <div id="pr-content" className="ao-content">
      {section !== '새친구 정착현황' && <div className="pr-section-heading"><label>명단 정렬<select value={sortOrder} onChange={event => setSortOrder(event.target.value as ReportSort)}><option value="absence">결석 횟수순</option><option value="latest">마지막 출석 최신순</option><option value="oldest">마지막 출석 오래된순</option></select></label><p className="pr-note">마지막 출석일은 기준 주일까지의 기록입니다. 출석 기록이 없으면 날짜 정렬에서 마지막에 표시합니다.</p></div>}
      {!report.selectedWeek ? <p className="pr-empty">선택 연도에 아직 지난 정상 주일이 없습니다.</p> : <>
        {section !== '연속 결석' && <>
          {load.status === 'loading' && <p role="status" className="pr-note">새친구 등반 완료 정보를 불러오고 있습니다.</p>}
          {load.status === 'error' && <div className="ao-error" role="alert"><span>새친구 등반 완료 정보를 불러오지 못했습니다. 완료 여부를 확인할 수 없어 새친구 명단과 집계를 표시하지 않습니다. 다시 불러오기를 눌러 주세요.</span><button type="button" onClick={() => { setLoad({ status: 'loading', friends: [] }); setRevision(value => value + 1); }}>다시 불러오기</button></div>}
        </>}
        {section === '새친구 정착현황' && <>
          <h2>새친구 정착현황 <span>{load.status === 'ready' ? `${friends.length}명` : '등반 정보 확인 중'}</span></h2>
          <p className="pr-note">등반 완료 학생만 표시합니다. 등반일(출석부 반영일 또는 기존 등반 기록일)부터 첫 정상 주일 4회·8회의 출석입니다. 출석 양호는 정착 완료 판정이 아닙니다. 연락처는 출석부에 등록된 값입니다.</p>
          {!friends.length ? load.status === 'ready' && <p className="pr-empty">현재 조회 범위에 등반 완료된 새친구가 없습니다. 필터와 통합사이트의 등반 처리 상태를 확인하세요.</p> : <ul className="pr-friends">{friends.map(item => <li key={item.friend.key}>
            <div className="pr-friend-heading"><strong>{item.friend.name}</strong><span className="pr-badge">{item.status}</span></div>
            <p>{item.row?.label ?? `${item.friend.part}부 ${item.friend.grade}학년 · 출석부 미연결`} · 담당 {item.friend.owner || item.row?.teacher || '미등록'}</p>
            <p>등반 완료 · 등반일 {item.startedDate || '확인 필요'}</p>
            <dl className="pr-windows">{([['첫 4회', item.four], ['첫 8회', item.eight]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.elapsed ? `출석 ${value.present}/${value.elapsed}회 · 미입력 ${value.missing}회` : '관찰 자료 부족'}</dd></div>)}</dl>
            <p>등반 후 마지막 출석: {item.lastPresent?.label ?? (!item.row ? '출석부 연결 확인 필요' : !item.startedDate ? '등반일 확인 필요' : '등반 이후 출석 기록 없음')}</p>
            <div className="pr-contacts"><Phone value={item.row?.student.phone} label="학생" /><Phone value={item.row?.student.pphone} label="보호자" /></div>
          </li>)}</ul>}
        </>}
        {section === '연속 결석' && <>
          <div className="pr-section-heading"><h2>연속 결석 <span>{absent.length}명</span></h2><label>장결 구분<select value={longAbsent} onChange={e => setLongAbsent(e.target.value)}><option value="active">일반 학생</option><option value="long">기존 장결</option><option value="all">모두</option></select></label></div>
          <p className="pr-note">기준 주일부터 거슬러 확인된 결석이 3회 이상 이어진 학생입니다. 선택한 명단 정렬 순서로 표시합니다. 출석·미입력에서 연속 계산을 멈추며, 이전 미입력이 있으면 학생별로 표시합니다.</p>
          <StudentRows rows={absent} empty="이 조건에 해당하는 연속 결석 학생이 없습니다." />
        </>}
        {section === '이번 주 요약' && <>
          <h2>이번 주 요약 <span>{report.selectedWeek.label}</span></h2>
          <p className="pr-note">현재 부서·학년·반·검색 필터 기준입니다. 아직 입력 중인 주일은 결과가 달라질 수 있습니다.</p>
          <dl className="pr-summary"><div><dt>3회 이상 연속 결석 · 일반 학생</dt><dd>{activeAbsent.length}명</dd></div><div><dt>새친구 2회 연속 결석 · 등반 완료 학생</dt><dd>{load.status === 'ready' ? `${friends.filter(item => item.status === '연락 필요').length}명` : '등반 정보 확인 필요'}</dd></div><div><dt>3회 이상 결석 후 다시 출석</dt><dd>{recovered.length}명</dd></div><div><dt>기준 주일 미입력 · 일반 학생</dt><dd>{missing}명</dd></div></dl>
          <h3>연락이 필요한 친구</h3><StudentRows rows={activeAbsent} empty="3회 이상 연속 결석한 일반 학생이 없습니다." />
          <h3>다시 출석한 친구</h3><StudentRows rows={recovered} empty="이번 기준 주일에 3회 연속 결석 후 다시 출석한 학생이 없습니다." />
        </>}
      </>}
    </div>
  </div>;
}
