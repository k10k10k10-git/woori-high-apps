'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/store/AppContext';
import { auth } from '@/lib/firebase/client';
import { isDemoAccount } from '@/lib/demo';
import { canUseAdminWorkspace } from '@/lib/adminNavigation';
import { subscribeReportFriends } from '@/lib/pastoralFriends';
import { buildPastoralReport, sortReportStudents, type ReportSort, type ReportFriend, type ReportStudent } from '@/utils/pastoralReport';
import VisitRequestsSection from '@/components/tabs/overall/VisitRequestsSection';
import SuggestionsSection from '@/components/tabs/overall/SuggestionsSection';
import AdminIcon from './AdminIcon';
import './admin-overview.css';
import './pastoral-report.css';

const SECTIONS = [
  { key: 'visits', label: '심방 요청' },
  { key: 'absence', label: '연속 결석' },
  { key: 'friends', label: '새친구 정착' },
  { key: 'notes', label: '특이사항' },
] as const;
type Section = typeof SECTIONS[number];
type FriendLoad = { status: 'loading' | 'ready' | 'error'; friends: ReportFriend[] };

function Phone({ value, label }: { value?: string; label: string }) {
  const number = value?.replace(/[^\d+]/g, '');
  return <span className="pr-phone"><small>{label}</small>{number && /\d{7}/.test(number) ? <a href={`tel:${number}`}>{value}</a> : <span>미등록</span>}</span>;
}

export default function PastoralReport() {
  const { state } = useApp();
  if (!canUseAdminWorkspace(state.userRole, isDemoAccount(auth.currentUser?.email))) return <p className="pr-empty">관리자 로그인 후 이용할 수 있습니다.</p>;
  return <ReportContent key={`${state.curYear}/${state.dataRevision}`} />;
}

function ReportContent() {
  const { state } = useApp();
  const params = useSearchParams();
  const requested = params.get('view');
  const requestedStudentKey = params.get('student') ?? '';
  const requestedVisitKey = params.get('request') ?? '';
  const requestedWeekKey = params.get('week') ?? '';
  const initialSection = SECTIONS.find(item => item.key === requested) ?? (requestedStudentKey ? SECTIONS[1] : SECTIONS[0]);
  const [section, setSection] = useState<Section>(initialSection);
  const [part, setPart] = useState('');
  const [grade, setGrade] = useState('');
  const [classKey, setClassKey] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [weekKey, setWeekKey] = useState(requestedWeekKey);
  const [longAbsent, setLongAbsent] = useState('active');
  const [absenceView, setAbsenceView] = useState<'absent' | 'recovered'>('absent');
  const [sortOrder, setSortOrder] = useState<ReportSort>('absence');
  const [load, setLoad] = useState<FriendLoad>({ status: 'loading', friends: [] });
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [selectedStudentKey, setSelectedStudentKey] = useState(requestedStudentKey);
  const [activeVisitKey, setActiveVisitKey] = useState(requestedVisitKey);
  const [selectedFriendKey, setSelectedFriendKey] = useState('');
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setSection(requestedStudentKey ? SECTIONS[1] : requestedVisitKey ? SECTIONS[0] : SECTIONS.find(item => item.key === requested) ?? SECTIONS[0]);
  }, [requested, requestedStudentKey, requestedVisitKey]);
  useEffect(() => { setWeekKey(requestedWeekKey); }, [requestedWeekKey]);
  useEffect(() => { setActiveVisitKey(requestedVisitKey); }, [requestedVisitKey]);
  useEffect(() => {
    if (!requestedStudentKey) { setSelectedStudentKey(''); return; }
    setAbsenceView('absent');
    setSelectedStudentKey(requestedStudentKey);
    setPart(''); setGrade(''); setClassKey(''); setSearch('');
  }, [requestedStudentKey]);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => { if (active) setLoad({ status: 'error', friends: [] }); }, 12000);
    const stop = subscribeReportFriends(state.curYear, friends => { if (active) { clearTimeout(timeout); setLoad({ status: 'ready', friends }); } }, () => { if (active) { clearTimeout(timeout); setLoad({ status: 'error', friends: [] }); } });
    return () => { active = false; clearTimeout(timeout); stop(); };
  }, [state.curYear, revision]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!selectedStudentKey && !selectedFriendKey) return;
    const detail = detailRef.current ?? document.querySelector<HTMLElement>('.pastoral-report .pr-detail');
    if (!detail) return;
    (detail.matches('[tabindex]') ? detail : detail.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
    if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches) detail.scrollIntoView({ block: 'start' });
  }, [selectedStudentKey, selectedFriendKey]);

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
  const absenceRows = absenceView === 'recovered' ? recovered : absent;
  const friends = report.settlement.filter(item => item.row ? matches(item.row) : !selectedClass && (!part || part === item.friend.part) && (!grade || grade === item.friend.grade) && (!query || `${item.friend.name} ${item.friend.owner ?? ''}`.normalize('NFC').toLocaleLowerCase('ko').includes(query)));
  const selectedStudent = absenceRows.find(row => row.key === selectedStudentKey) ?? null;
  const selectedFriend = friends.find(item => item.friend.key === selectedFriendKey) ?? null;
  const visitFilter = { part, grade, classKey: selectedClass, search };
  const showFilters = section.key !== 'notes';

  function resetFilters() { setPart(''); setGrade(''); setClassKey(''); setSearch(''); }

  return <div className="admin-overview pastoral-report">
    <header className="ao-heading"><h1>목양 관리</h1><p>학생 이름을 먼저 보고, 필요한 연락과 후속 조치를 바로 확인하세요.</p></header>
    <div className="ao-sections" role="group" aria-label="목양 관리 보기 선택">{SECTIONS.map(item => <button type="button" key={item.key} aria-pressed={section.key === item.key} aria-controls="pr-content" onClick={() => { setSection(item); setSelectedStudentKey(''); setSelectedFriendKey(''); setActiveVisitKey(''); }}>{item.label}</button>)}</div>

    {showFilters && <div className={`pr-filters${filtersOpen ? ' pr-filters-open' : ''}`}>
      {section.key !== 'visits' && <label>기준 주일<select value={report.selectedWeek?.key ?? ''} onChange={e => setWeekKey(e.target.value)}>{!report.weeks.length && <option value="">조회할 주일 없음</option>}{report.weeks.map(week => <option key={week.key} value={week.key}>{week.label}</option>)}</select></label>}
      <label className="pr-search">학생 검색<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="이름 또는 담당 교사" /></label>
      <label>부서<select value={part} onChange={e => { setPart(e.target.value); setClassKey(''); }}><option value="">전체 부서</option>{[...new Set(Object.keys(state.classData).map(key => key.split('-')[0]))].sort().map(p => <option key={p} value={p}>{p}부</option>)}</select></label>
      <button className="pr-filter-toggle" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)}>필터 더보기{grade || selectedClass ? ' · 적용 중' : ''}</button>
      <label className="pr-advanced">학년<select value={grade} onChange={e => { setGrade(e.target.value); setClassKey(''); }}><option value="">전체 학년</option>{[...new Set(Object.keys(state.classData).map(key => key.split('-')[1]))].sort().map(g => <option key={g} value={g}>{g}학년</option>)}</select></label>
      <label className="pr-advanced">반<select value={selectedClass} onChange={e => setClassKey(e.target.value)}><option value="">전체 반</option>{classes.map(key => <option key={key} value={key}>{key.split('-').map((value, i) => `${value}${['부', '학년', '반'][i]}`).join(' ')}</option>)}</select></label>
      {(part || grade || selectedClass || search) && <button type="button" onClick={resetFilters}>초기화</button>}
    </div>}
    {showFilters && section.key !== 'visits' && <p className="pr-note">{state.curYear}년 {report.selectedWeek?.label ?? '조회할 정상 주일 없음'} 기준 · 행사 주일 제외 · 미입력은 결석으로 계산하지 않습니다.</p>}

    <div id="pr-content" className="ao-content">
      {section.key === 'visits' && <VisitRequestsSection filter={visitFilter} requestKey={activeVisitKey} />}
      {section.key === 'notes' && <SuggestionsSection />}
      {section.key === 'absence' && (!report.selectedWeek ? <p className="pr-empty">선택 연도에 아직 지난 정상 주일이 없습니다.</p> : <>
        <div className="pr-section-heading"><div><h2>{absenceView === 'absent' ? '연속 결석' : '다시 출석'} <span>{absenceRows.length}명</span></h2><p className="pr-note">{absenceView === 'absent' ? '행마다 최근 주일의 기록과 확인된 연속 결석 횟수를 보여드립니다.' : '3회 이상 결석한 뒤 기준 주일에 다시 출석한 학생입니다.'}</p><div className="ad-status-tabs" role="group" aria-label="결석 상태"><button type="button" aria-pressed={absenceView === 'absent'} onClick={() => { setAbsenceView('absent'); setSelectedStudentKey(''); }}>연속 결석 <span>{absent.length}</span></button><button type="button" aria-pressed={absenceView === 'recovered'} onClick={() => { setAbsenceView('recovered'); setSelectedStudentKey(''); }}>다시 출석 <span>{recovered.length}</span></button></div></div><div className="pr-inline-controls">{absenceView === 'absent' && <label>장결<select value={longAbsent} onChange={e => setLongAbsent(e.target.value)}><option value="active">일반 학생</option><option value="long">기존 장결</option><option value="all">모두</option></select></label>}<label>정렬<select value={sortOrder} onChange={e => setSortOrder(e.target.value as ReportSort)}><option value="absence">결석 많은 순</option><option value="latest">마지막 출석 최신순</option><option value="oldest">마지막 출석 오래된순</option></select></label></div></div>
        {requestedStudentKey === selectedStudentKey && !selectedStudent && <p className="pr-empty" role="status">요청한 학생이 현재 연속 결석 명단에 없습니다. 조회 주일과 장결 필터를 확인해 주세요.</p>}
        <div className={`pr-master-detail${selectedStudent ? ' is-open' : ''}`}>
          <div className="pr-table-wrap"><table className="pr-table"><caption>{absenceView === 'absent' ? '연속 결석' : '다시 출석'} 학생 명단</caption><thead><tr><th>학생</th><th>반 / 담임</th><th>최근 4회</th><th>{absenceView === 'absent' ? '연속 결석' : '확인 내용'}</th><th>마지막 출석</th><th><span className="ad-sr-only">상세</span></th></tr></thead><tbody>{absenceRows.map(row => <tr key={row.key}><th scope="row"><button type="button" onClick={() => setSelectedStudentKey(row.key)}>{row.student.name}{row.student.jang && <small>장결</small>}</button></th><td>{row.label}<small>{row.teacher || '담임 미등록'}</small></td><td><div className="pr-week-cells">{row.recent.slice(0, 4).reverse().map(cell => <span key={cell.week.key} data-value={cell.value || '-'} title={`${cell.week.label} ${cell.value === 'O' ? '출석' : cell.value === 'X' ? '결석' : '미입력'}`}>{cell.value || '·'}</span>)}</div></td><td><strong>{row.recovered ? '3회 이상 결석 후 출석' : `${row.streak}회`}</strong>{!row.recovered && row.recent[row.streak] && !row.recent[row.streak].value && <small>이전 미입력 있음</small>}</td><td>{row.lastPresent?.label ?? '기록 없음'}</td><td><button type="button" className="pr-open" aria-label={`${row.student.name} 상세 보기`} onClick={() => setSelectedStudentKey(row.key)}><AdminIcon name="arrow" /></button></td></tr>)}</tbody></table>{!absenceRows.length && <p className="pr-empty">{absenceView === 'absent' ? '이 조건에 해당하는 연속 결석 학생이 없습니다.' : '이 기준 주일에 다시 출석한 학생이 없습니다.'}</p>}</div>
          {selectedStudent && <aside ref={detailRef} tabIndex={-1} aria-label={`${selectedStudent.student.name} 상세`} className="pr-detail"><button className="pr-close" type="button" aria-label="상세 닫기" onClick={() => setSelectedStudentKey('')}>닫기</button><h3>{selectedStudent.student.name}</h3><p>{selectedStudent.label} · 담임 {selectedStudent.teacher || '미등록'}</p><dl><div><dt>{selectedStudent.recovered ? '다시 출석 전 연속 결석' : '확인된 연속 결석'}</dt><dd>{selectedStudent.recovered ? '3회 이상' : `${selectedStudent.streak}회`}</dd></div><div><dt>마지막 출석</dt><dd>{selectedStudent.lastPresent?.label ?? '조회 연도 기록 없음'}</dd></div><div><dt>최근 기록</dt><dd>{selectedStudent.recent.slice(0, 8).reverse().map(cell => `${cell.week.label} ${cell.value || '미입력'}`).join(' / ')}</dd></div></dl><div className="pr-contacts"><Phone value={selectedStudent.student.phone} label="학생" /><Phone value={selectedStudent.student.pphone} label="보호자" /></div></aside>}
        </div>
      </>)}
      {section.key === 'friends' && (!report.selectedWeek ? <p className="pr-empty">선택 연도에 아직 지난 정상 주일이 없습니다.</p> : <>
        <div className="pr-section-heading"><div><h2>새친구 정착 <span>{load.status === 'ready' ? `${friends.length}명` : '확인 중'}</span></h2><p className="pr-note">등반 완료 학생만 표시하며, 4회·8회 출석 흐름은 정착 판단을 돕는 자료입니다.</p></div></div>
        {load.status === 'error' && <div className="ao-error" role="alert"><span>등반 완료 정보를 불러오지 못해 명단을 표시하지 않습니다.</span><button type="button" onClick={() => { setLoad({ status: 'loading', friends: [] }); setRevision(value => value + 1); }}>다시 불러오기</button></div>}
        {load.status === 'loading' ? <p className="pr-empty" role="status">등반 완료 정보를 불러오고 있습니다.</p> : <div className={`pr-master-detail${selectedFriend ? ' is-open' : ''}`}><div className="pr-table-wrap"><table className="pr-table"><caption>등반 완료 새친구 정착 현황</caption><thead><tr><th>학생</th><th>반 / 담당</th><th>등반일</th><th>첫 4회</th><th>첫 8회</th><th>상태</th></tr></thead><tbody>{friends.map(item => <tr key={item.friend.key}><th scope="row"><button type="button" onClick={() => setSelectedFriendKey(item.friend.key)}>{item.friend.name}</button></th><td>{item.row?.label ?? `${item.friend.part}부 ${item.friend.grade}학년`}<small>{item.friend.owner || item.row?.teacher || '담당 미등록'}</small></td><td>{item.startedDate || '확인 필요'}</td><td>출석 {item.four.present}/{item.four.elapsed}<small>미입력 {item.four.missing}</small></td><td>출석 {item.eight.present}/{item.eight.elapsed}<small>미입력 {item.eight.missing}</small></td><td><button className="pr-status-button" type="button" onClick={() => setSelectedFriendKey(item.friend.key)}>{item.status}</button></td></tr>)}</tbody></table>{!friends.length && <p className="pr-empty">현재 조회 범위에 등반 완료된 새친구가 없습니다.</p>}</div>{selectedFriend && <aside className="pr-detail"><button className="pr-close" type="button" onClick={() => setSelectedFriendKey('')}>닫기</button><h3>{selectedFriend.friend.name}</h3><p>{selectedFriend.row?.label ?? '출석부 연결 확인 필요'} · 담당 {selectedFriend.friend.owner || selectedFriend.row?.teacher || '미등록'}</p><dl><div><dt>등반일</dt><dd>{selectedFriend.startedDate || '확인 필요'}</dd></div><div><dt>등반 후 마지막 출석</dt><dd>{selectedFriend.lastPresent?.label ?? '기록 없음'}</dd></div><div><dt>현재 표시</dt><dd>{selectedFriend.status}</dd></div></dl><div className="pr-contacts"><Phone value={selectedFriend.row?.student.phone} label="학생" /><Phone value={selectedFriend.row?.student.pphone} label="보호자" /></div></aside>}</div>}
      </>)}
    </div>
  </div>;
}
