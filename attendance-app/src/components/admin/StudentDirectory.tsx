'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { calcStats, useApp } from '@/store/AppContext';
import { downloadCSV, downloadXLSX } from '@/utils/export';
import { attendanceGrade } from '@/utils/attendanceHistory';
import StudentModal from '@/components/modals/StudentModal';
import MoveStudentModal from '@/components/modals/MoveStudentModal';
import AdminIcon from './AdminIcon';
import AdminStatusBadge from './AdminStatusBadge';
import HistoryModal from '@/components/modals/HistoryModal';
import LongAbsentReturnDialog, { type LongAbsentReturnTarget } from '@/components/modals/LongAbsentReturnDialog';
import type { MoveTarget, Student } from '@/types';

type DirectoryRow = { classKey: string; part: string; grade: string; classNumber: string; teacher: string; student: Student };
type DirectoryView = 'overview' | 'compact' | 'table';
const DIRECTORY_VIEW_KEY = 'woori-admin-directory-view';
function searchable(value?: string) { return (value ?? '').normalize('NFC').replace(/[\s-]+/g, '').toLocaleLowerCase('ko'); }
function phoneHref(value: string) { return `tel:${value.replace(/[^\d+]/g, '')}`; }

export default function StudentDirectory({ onOpenClass }: { onOpenClass: (classKey?: string) => void }) {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);
  const [part, setPart] = useState('all');
  const [grade, setGrade] = useState('all');
  const [classKey, setClassKey] = useState('all');
  const [studentStatus, setStudentStatus] = useState<'all' | 'active' | 'long'>('all');
  const [directoryView, setDirectoryView] = useState<DirectoryView>('table');
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [returnTarget, setReturnTarget] = useState<LongAbsentReturnTarget | null>(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [addClassKey, setAddClassKey] = useState('');
  const detailRef = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  function openDetail(row: DirectoryRow, button: HTMLButtonElement) { opener.current = button; setSelectedKey(`${row.classKey}/${row.student.id}`); }
  function closeDetail() { setSelectedKey(''); opener.current?.focus(); }

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(DIRECTORY_VIEW_KEY); } catch { /* 저장소를 사용할 수 없어도 보기 전환은 유지한다. */ }
    if (saved === 'overview' || saved === 'compact' || saved === 'table') setDirectoryView(saved);
    else if (window.matchMedia?.('(max-width: 760px)').matches) setDirectoryView('compact');
  }, []);

  function changeDirectoryView(view: DirectoryView) {
    setDirectoryView(view);
    try { localStorage.setItem(DIRECTORY_VIEW_KEY, view); } catch { /* 저장소를 사용할 수 없어도 보기 전환은 유지한다. */ }
  }

  const allRows = useMemo(() => Object.entries(state.classData).flatMap(([key, info]) => {
    const [rowPart = '', rowGrade = '', classNumber = ''] = key.split('-');
    return (info.students ?? []).map(student => ({ classKey: key, part: rowPart, grade: rowGrade, classNumber, teacher: info.teacher ?? '', student }));
  }).sort((a, b) => a.part.localeCompare(b.part, 'ko', { numeric: true }) || a.grade.localeCompare(b.grade, 'ko', { numeric: true }) || a.classNumber.localeCompare(b.classNumber, 'ko', { numeric: true }) || (a.student.num ?? 0) - (b.student.num ?? 0) || a.student.name.localeCompare(b.student.name, 'ko')), [state.classData]);
  const annualRates = useMemo(() => {
    const source = { months: state.months, attData: state.attData, events: state.events, curView: 'all' as const };
    return new Map(allRows.map(row => {
      const { present, absent, rate } = calcStats(source, row.classKey, row.student.id);
      return [`${row.classKey}/${row.student.id}`, { rate: present + absent > 0 ? `${rate}%` : '—', grade: present + absent > 0 ? attendanceGrade(rate) : '—' }];
    }));
  }, [allRows, state.months, state.attData, state.events]);
  const allClasses = useMemo(() => Object.keys(state.classData).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })), [state.classData]);
  const classOptions = useMemo(() => allClasses.filter(key => { const [p, g] = key.split('-'); return (part === 'all' || p === part) && (grade === 'all' || g === grade); }), [allClasses, part, grade]);
  const effectiveClass = classOptions.includes(classKey) ? classKey : 'all';
  const q = searchable(search);
  const rows = allRows.filter(row => (part === 'all' || row.part === part) && (grade === 'all' || row.grade === grade) && (effectiveClass === 'all' || row.classKey === effectiveClass)
    && (studentStatus === 'all' || (studentStatus === 'active' ? row.student.jang !== true : row.student.jang === true))
    && (!q || [row.student.name, row.student.phone, row.student.pphone, row.student.school, row.classKey, row.teacher].some(value => searchable(value).includes(q))));
  const overviewGroups = rows.reduce((groups, row) => {
    const group = groups.get(row.classKey);
    if (group) group.push(row);
    else groups.set(row.classKey, [row]);
    return groups;
  }, new Map<string, DirectoryRow[]>());
  const overviewGrades = [...overviewGroups].reduce((groups, classGroup) => {
    const first = classGroup[1][0];
    const key = `${first.part}-${first.grade}`;
    const classes = groups.get(key);
    if (classes) classes.push(classGroup);
    else groups.set(key, [classGroup]);
    return groups;
  }, new Map<string, [string, DirectoryRow[]][]>());
  const selected = rows.find(row => `${row.classKey}/${row.student.id}` === selectedKey) ?? null;
  const hasSelected = !!selected;
  useEffect(() => {
    if (!hasSelected) return;
    detailRef.current?.focus({ preventScroll: true });
    if (window.matchMedia?.('(max-width: 1100px)').matches) detailRef.current?.scrollIntoView?.({ block: 'start' });
  }, [selectedKey, hasSelected]);
  const hasFilters = !!query || part !== 'all' || grade !== 'all' || effectiveClass !== 'all' || studentStatus !== 'all';

  function selectClass(key: string) { const [p, g, c] = key.split('-'); dispatch({ type: 'SET_PART', payload: p }); dispatch({ type: 'SET_GRADE', payload: g }); dispatch({ type: 'SET_CLASS', payload: c }); }
  function editStudent(row: DirectoryRow) { selectClass(row.classKey); dispatch({ type: 'OPEN_STUDENT_MODAL', payload: { editId: row.student.id } }); }
  function resetFilters() { setQuery(''); setPart('all'); setGrade('all'); setClassKey('all'); setStudentStatus('all'); }
  function addStudent() { if (!addClassKey) return; selectClass(addClassKey); dispatch({ type: 'OPEN_STUDENT_MODAL', payload: { editId: null } }); }
  function exportRows(format: 'csv' | 'xlsx') {
    const data = [
      ['이름', '부서', '학년', '반', '담임 교사', '학생 연락처', '보호자 연락처', '학교', '주소', '생년월일', '출석률', '등급'],
      ...rows.map(row => {
        const stats = annualRates.get(`${row.classKey}/${row.student.id}`);
        return [
          row.student.name, `${row.part}부`, `${row.grade}학년`, `${row.classNumber}반`, row.teacher,
          row.student.phone ?? '', row.student.pphone ?? '', row.student.school ?? '',
          row.student.addr ?? '', row.student.birth ?? '', stats?.rate ?? '—', stats?.grade ?? '—',
        ];
      }),
    ];
    if (format === 'csv') downloadCSV(data, `전체명단_${state.curYear}.csv`); else void downloadXLSX(data, '전체명단', `전체명단_${state.curYear}.xlsx`);
  }

  return <section className="student-directory" aria-labelledby="student-directory-title">
    <div className="sd-heading"><div><h2 id="student-directory-title">전체 학생 명단</h2><p>이름을 누르면 연락처·출석 이력·수정·이동을 한곳에서 확인할 수 있습니다.</p></div><details className="sd-add"><summary>학생 추가</summary><div><label>추가할 반<select value={addClassKey} onChange={event => setAddClassKey(event.target.value)}><option value="">반을 선택하세요</option>{allClasses.map(key => { const [p,g,c] = key.split('-'); return <option value={key} key={key}>{p}부 {g}학년 {c}반 · {state.classData[key]?.teacher || '담임 미등록'}</option>; })}</select></label><button type="button" disabled={!addClassKey} onClick={addStudent}>선택한 반에 추가</button></div></details></div>
    <div className="sd-toolbar"><label className="sd-search"><AdminIcon name="search" /><span className="ad-sr-only">학생 명단 검색</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름·연락처·학교·담임 검색" /></label><select aria-label="명단 부서 필터" value={part} onChange={event => { setPart(event.target.value); setClassKey('all'); }}><option value="all">전체 부서</option><option value="1">1부</option><option value="2">2부</option></select><details className="sd-more"><summary>필터 더보기{grade !== 'all' || effectiveClass !== 'all' || studentStatus !== 'all' ? ' · 적용 중' : ''}</summary><div><label>학년<select value={grade} onChange={event => { setGrade(event.target.value); setClassKey('all'); }}><option value="all">전체 학년</option>{[1,2,3].map(value => <option value={String(value)} key={value}>{value}학년</option>)}</select></label><label>반<select value={effectiveClass} onChange={event => setClassKey(event.target.value)}><option value="all">전체 반</option>{classOptions.map(key => { const [p,g,c] = key.split('-'); return <option key={key} value={key}>{p}부 {g}학년 {c}반</option>; })}</select></label><label>상태<select value={studentStatus} onChange={event => setStudentStatus(event.target.value as typeof studentStatus)}><option value="all">전체 상태</option><option value="active">일반 학생</option><option value="long">장결 학생</option></select></label></div></details></div>
    <div className="sd-result-bar"><span role="status" aria-live="polite"><b>{rows.length}명</b> / 전체 {allRows.length}명{hasFilters && ' · 필터 적용 중'}</span><div><div className="sd-view-switch" role="group" aria-label="명단 보기 방식"><button type="button" aria-pressed={directoryView !== 'overview'} onClick={() => changeDirectoryView(window.matchMedia?.('(max-width: 760px)').matches ? 'compact' : 'table')}>명단 표</button><button type="button" aria-pressed={directoryView === 'overview'} onClick={() => changeDirectoryView('overview')}>한눈에</button></div><details className="sd-more sd-view-options"><summary>보기 설정</summary><div><button type="button" aria-pressed={directoryView === 'compact'} onClick={() => changeDirectoryView('compact')}>간편 목록</button><button type="button" aria-pressed={directoryView === 'table'} onClick={() => changeDirectoryView('table')}>상세 표</button></div></details>{hasFilters && <button type="button" onClick={resetFilters}>필터 초기화</button>}<details className="sd-export"><summary>명단 내보내기</summary><div><button type="button" onClick={() => exportRows('xlsx')}>Excel</button><button type="button" onClick={() => exportRows('csv')}>CSV</button></div></details></div></div>
    <div className={`sd-master-detail${selected ? ' is-open' : ''}`}><div className="sd-list-area">
    {directoryView === 'overview' && rows.length > 0 && <div className="sd-overview">
      <p>부·학년별로 반과 학생 이름을 확인하세요. 이름을 누르면 학생 상세가 열립니다.</p>
      <div className="sd-overview-grades">
        {[...overviewGrades].map(([gradeKey, classes]) => {
          const first = classes[0][1][0];
          const studentCount = classes.reduce((count, [, group]) => count + group.length, 0);
          return <section className="sd-overview-grade" key={gradeKey} aria-labelledby={`sd-overview-grade-${gradeKey}`}>
            <div className="sd-overview-grade-heading"><h3 id={`sd-overview-grade-${gradeKey}`}>{first.part}부 {first.grade}학년</h3><span>{classes.length}개 반 · {studentCount}명</span></div>
            <div className="sd-overview-grid">{classes.map(([key, group]) => {
              const classRow = group[0];
              return <section className="sd-overview-class" key={key} aria-labelledby={`sd-overview-${key}`}>
                <div className="sd-overview-class-heading"><div><h4 id={`sd-overview-${key}`}><span className="ad-sr-only">{classRow.part}부 {classRow.grade}학년 </span>{classRow.classNumber}반</h4><p>담임 {classRow.teacher || '미등록'}</p></div><span>{group.length}명</span></div>
                <ul className="sd-overview-names">{group.map(row => <li key={`${row.classKey}/${row.student.id}`}><span className="sd-overview-number">{row.student.num ?? '—'}</span><button type="button" className="sd-overview-name" onClick={event => openDetail(row, event.currentTarget)}>{row.student.name}</button>{row.student.jang && <span className="sd-overview-long">장결</span>}</li>)}</ul>
              </section>;
            })}</div>
          </section>;
        })}
      </div>
    </div>}
    {(directoryView !== 'overview' || !rows.length) && <>
    {rows.length ? directoryView === 'compact' ? <div className="sd-table-wrap"><table className="sd-table"><caption>{state.curYear}년 전체 학생 간편 목록</caption><thead><tr><th>이름</th><th>현재 소속</th></tr></thead><tbody>{rows.map(row => { const key = `${row.classKey}/${row.student.id}`; return <tr key={key}><th scope="row"><button type="button" className="sd-name" onClick={event => openDetail(row, event.currentTarget)}>{row.student.name}{row.student.jang && <small>장결</small>}</button></th><td><button type="button" className="sd-class-link" onClick={() => { selectClass(row.classKey); onOpenClass(row.classKey); }}>{row.part}부 {row.grade}학년 {row.classNumber}반</button></td></tr>; })}</tbody></table></div> : <div className="sd-table-view"><p>주소·연락처·생년월일·출석률을 한 표에서 비교하세요. 출석률은 {state.curYear}년 전체 입력 기록 기준이며, 행사·미입력은 제외합니다. 기록이 없으면 —로 표시합니다.</p><div className="sd-table-wrap" role="region" aria-label="전체 학생 상세 표, 좌우로 이동 가능" tabIndex={0}><table className="sd-table sd-detailed-table"><caption>{state.curYear}년 전체 학생 상세 표</caption><thead><tr><th>이름</th><th>소속</th><th>번호</th><th>주소</th><th>학교</th><th>학생 연락처</th><th>보호자 연락처</th><th>생년월일</th><th>출석률</th><th>등급</th><th>상태</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.classKey}/${row.student.id}`}><th scope="row"><button type="button" className="sd-name sd-table-name" onClick={event => openDetail(row, event.currentTarget)}>{row.student.name}{row.student.jang && <small>장결</small>}</button></th><td><button type="button" className="sd-class-link" onClick={() => { selectClass(row.classKey); onOpenClass(row.classKey); }}>{row.part}부 {row.grade}학년 {row.classNumber}반</button></td><td>{row.student.num ?? '—'}</td><td className="sd-address">{row.student.addr || '—'}</td><td>{row.student.school || '—'}</td><td>{row.student.phone ? <a href={phoneHref(row.student.phone)}>{row.student.phone}</a> : '—'}</td><td>{row.student.pphone ? <a href={phoneHref(row.student.pphone)}>{row.student.pphone}</a> : '—'}</td><td>{row.student.birth || '—'}</td><td>{annualRates.get(`${row.classKey}/${row.student.id}`)?.rate}</td><td><AdminStatusBadge label={annualRates.get(`${row.classKey}/${row.student.id}`)?.grade ?? '—'} /></td><td><AdminStatusBadge label={row.student.jang ? '장결' : '일반'} /></td></tr>)}</tbody></table></div></div> : <div className="ad-empty"><AdminIcon name="search" size={26} /><h3>조건에 맞는 학생이 없습니다.</h3><p>검색어를 바꾸거나 필터를 초기화해 보세요.</p><button type="button" onClick={resetFilters}>필터 초기화</button></div>}
    </>}
</div>{selected && <aside className="sd-detail" ref={detailRef} tabIndex={-1} aria-label={`${selected.student.name} 학생 상세`}><button type="button" className="sd-detail-close" onClick={closeDetail}>닫기</button><h3>{selected.student.name}</h3><p>{selected.part}부 {selected.grade}학년 {selected.classNumber}반 · 담임 {selected.teacher || '미등록'}</p><dl><div><dt>학생 연락처</dt><dd>{selected.student.phone ? <a href={phoneHref(selected.student.phone)}>{selected.student.phone}</a> : '미등록'}</dd></div><div><dt>보호자 연락처</dt><dd>{selected.student.pphone ? <a href={phoneHref(selected.student.pphone)}>{selected.student.pphone}</a> : '미등록'}</dd></div><div><dt>생년월일</dt><dd>{selected.student.birth || '미등록'}</dd></div><div><dt>학교</dt><dd>{selected.student.school || '미등록'}</dd></div><div><dt>주소</dt><dd>{selected.student.addr || '미등록'}</dd></div><div><dt>연간 출석률</dt><dd>{annualRates.get(`${selected.classKey}/${selected.student.id}`)?.rate}</dd></div><div><dt>등급</dt><dd><AdminStatusBadge label={annualRates.get(`${selected.classKey}/${selected.student.id}`)?.grade ?? '—'} /></dd></div><div><dt>상태</dt><dd><AdminStatusBadge label={selected.student.jang ? '장결 학생' : '일반 학생'} /></dd></div></dl><p>{state.curYear}년 전체 입력 기록 기준 · 행사·미입력 제외</p><div className="sd-detail-actions">{selected.student.jang === true && state.userRole?.role === 'admin' && <button type="button" onClick={() => setReturnTarget({ year: state.curYear, classKey: selected.classKey, revision: state.dataRevision, student: structuredClone(selected.student) })}>일반 명단 복귀</button>}<button type="button" onClick={() => { selectClass(selected.classKey); dispatch({ type: 'OPEN_HISTORY_MODAL', payload: { sid: selected.student.id, ck: selected.classKey } }); }}>출석 이력</button><button type="button" onClick={() => editStudent(selected)}>정보 수정</button><button type="button" onClick={() => setMoveTarget({ sid: selected.student.id, fromCk: selected.classKey })}>소속 이동</button></div></aside>}</div>
    {state.historyModal.open && state.historyModal.sid && state.historyModal.ck && <HistoryModal sid={state.historyModal.sid} curCk={state.historyModal.ck} onClose={() => dispatch({ type: 'CLOSE_HISTORY_MODAL' })} />}
    {state.studentModal.open && <StudentModal editId={state.studentModal.editId} onClose={() => dispatch({ type: 'CLOSE_STUDENT_MODAL' })} />}
    {moveTarget && <MoveStudentModal target={moveTarget} onClose={() => setMoveTarget(null)} />}
    {returnTarget && <LongAbsentReturnDialog target={returnTarget} onClose={() => setReturnTarget(null)} />}
  </section>;
}
