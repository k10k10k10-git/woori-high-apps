'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { downloadCSV, downloadXLSX } from '@/utils/export';
import StudentModal from '@/components/modals/StudentModal';
import MoveStudentModal from '@/components/modals/MoveStudentModal';
import AdminIcon from './AdminIcon';
import type { MoveTarget, Student } from '@/types';

type DirectoryRow = { classKey: string; part: string; grade: string; classNumber: string; teacher: string; student: Student };
type DirectoryView = 'compact' | 'table';
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
  const [selectedKey, setSelectedKey] = useState('');
  const [addClassKey, setAddClassKey] = useState('');

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(DIRECTORY_VIEW_KEY); } catch { /* 저장소를 사용할 수 없어도 보기 전환은 유지한다. */ }
    if (saved === 'compact' || saved === 'table') setDirectoryView(saved);
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
  const allClasses = useMemo(() => Object.keys(state.classData).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })), [state.classData]);
  const classOptions = useMemo(() => allClasses.filter(key => { const [p, g] = key.split('-'); return (part === 'all' || p === part) && (grade === 'all' || g === grade); }), [allClasses, part, grade]);
  const effectiveClass = classOptions.includes(classKey) ? classKey : 'all';
  const q = searchable(search);
  const rows = allRows.filter(row => (part === 'all' || row.part === part) && (grade === 'all' || row.grade === grade) && (effectiveClass === 'all' || row.classKey === effectiveClass)
    && (studentStatus === 'all' || (studentStatus === 'active' ? row.student.jang !== true : row.student.jang === true))
    && (!q || [row.student.name, row.student.phone, row.student.pphone, row.student.school, row.classKey, row.teacher].some(value => searchable(value).includes(q))));
  const selected = rows.find(row => `${row.classKey}/${row.student.id}` === selectedKey) ?? null;
  const hasFilters = !!query || part !== 'all' || grade !== 'all' || effectiveClass !== 'all' || studentStatus !== 'all';

  function selectClass(key: string) { const [p, g, c] = key.split('-'); dispatch({ type: 'SET_PART', payload: p }); dispatch({ type: 'SET_GRADE', payload: g }); dispatch({ type: 'SET_CLASS', payload: c }); }
  function editStudent(row: DirectoryRow) { selectClass(row.classKey); dispatch({ type: 'OPEN_STUDENT_MODAL', payload: { editId: row.student.id } }); }
  function resetFilters() { setQuery(''); setPart('all'); setGrade('all'); setClassKey('all'); setStudentStatus('all'); }
  function addStudent() { if (!addClassKey) return; selectClass(addClassKey); dispatch({ type: 'OPEN_STUDENT_MODAL', payload: { editId: null } }); }
  function exportRows(format: 'csv' | 'xlsx') {
    const data = [['이름', '부서', '학년', '반', '담임 교사', '학생 연락처', '보호자 연락처', '학교', '상태'], ...rows.map(row => [row.student.name, `${row.part}부`, `${row.grade}학년`, `${row.classNumber}반`, row.teacher, row.student.phone ?? '', row.student.pphone ?? '', row.student.school ?? '', row.student.jang ? '장결' : '일반'])];
    if (format === 'csv') downloadCSV(data, `전체명단_${state.curYear}.csv`); else void downloadXLSX(data, '전체명단', `전체명단_${state.curYear}.xlsx`);
  }

  return <section className="student-directory" aria-labelledby="student-directory-title">
    <div className="sd-heading"><div><h2 id="student-directory-title">전체 학생 명단</h2><p>간편 목록과 상세 표를 바꿔 보며 검색·수정·이동을 한곳에서 처리하세요.</p></div><details className="sd-add"><summary>학생 추가</summary><div><label>추가할 반<select value={addClassKey} onChange={event => setAddClassKey(event.target.value)}><option value="">반을 선택하세요</option>{allClasses.map(key => { const [p,g,c] = key.split('-'); return <option value={key} key={key}>{p}부 {g}학년 {c}반 · {state.classData[key]?.teacher || '담임 미등록'}</option>; })}</select></label><button type="button" disabled={!addClassKey} onClick={addStudent}>선택한 반에 추가</button></div></details></div>
    <div className="sd-toolbar"><label className="sd-search"><AdminIcon name="search" /><span className="ad-sr-only">학생 명단 검색</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름·연락처·학교·담임 검색" /></label><select aria-label="명단 부서 필터" value={part} onChange={event => { setPart(event.target.value); setClassKey('all'); }}><option value="all">전체 부서</option><option value="1">1부</option><option value="2">2부</option></select><details className="sd-more"><summary>필터 더보기{grade !== 'all' || effectiveClass !== 'all' || studentStatus !== 'all' ? ' · 적용 중' : ''}</summary><div><label>학년<select value={grade} onChange={event => { setGrade(event.target.value); setClassKey('all'); }}><option value="all">전체 학년</option>{[1,2,3].map(value => <option value={String(value)} key={value}>{value}학년</option>)}</select></label><label>반<select value={effectiveClass} onChange={event => setClassKey(event.target.value)}><option value="all">전체 반</option>{classOptions.map(key => { const [p,g,c] = key.split('-'); return <option key={key} value={key}>{p}부 {g}학년 {c}반</option>; })}</select></label><label>상태<select value={studentStatus} onChange={event => setStudentStatus(event.target.value as typeof studentStatus)}><option value="all">전체 상태</option><option value="active">일반 학생</option><option value="long">장결 학생</option></select></label></div></details></div>
    <div className="sd-result-bar"><span role="status" aria-live="polite"><b>{rows.length}명</b> / 전체 {allRows.length}명{hasFilters && ' · 필터 적용 중'}</span><div><div className="sd-view-switch" role="group" aria-label="명단 보기 방식"><button type="button" aria-pressed={directoryView === 'compact'} onClick={() => changeDirectoryView('compact')}>간편 목록</button><button type="button" aria-pressed={directoryView === 'table'} onClick={() => changeDirectoryView('table')}>상세 표</button></div>{hasFilters && <button type="button" onClick={resetFilters}>필터 초기화</button>}<details className="sd-export"><summary>명단 내보내기</summary><div><button type="button" onClick={() => exportRows('xlsx')}>Excel</button><button type="button" onClick={() => exportRows('csv')}>CSV</button></div></details></div></div>
    {rows.length ? directoryView === 'compact' ? <div className={`sd-master-detail${selected ? ' is-open' : ''}`}><div className="sd-table-wrap"><table className="sd-table"><caption>{state.curYear}년 전체 학생 간편 목록</caption><thead><tr><th>이름</th><th>현재 소속</th><th>담임 교사</th><th>학교</th><th>작업</th></tr></thead><tbody>{rows.map(row => { const key = `${row.classKey}/${row.student.id}`; return <tr key={key}><th scope="row"><button type="button" className="sd-name" onClick={() => setSelectedKey(key)}>{row.student.name}{row.student.jang && <small>장결</small>}</button></th><td><button type="button" className="sd-class-link" onClick={() => { selectClass(row.classKey); onOpenClass(row.classKey); }}>{row.part}부 {row.grade}학년 {row.classNumber}반</button></td><td>{row.teacher || '미등록'}</td><td>{row.student.school || '—'}</td><td><div className="sd-actions"><button type="button" onClick={() => setSelectedKey(key)}>상세</button><button type="button" onClick={() => editStudent(row)}>수정</button><button type="button" onClick={() => setMoveTarget({ sid: row.student.id, fromCk: row.classKey })}>이동</button></div></td></tr>; })}</tbody></table></div>{selected && <aside className="sd-detail"><button type="button" className="sd-detail-close" onClick={() => setSelectedKey('')}>닫기</button><h3>{selected.student.name}</h3><p>{selected.part}부 {selected.grade}학년 {selected.classNumber}반 · 담임 {selected.teacher || '미등록'}</p><dl><div><dt>학생 연락처</dt><dd>{selected.student.phone ? <a href={phoneHref(selected.student.phone)}>{selected.student.phone}</a> : '미등록'}</dd></div><div><dt>보호자 연락처</dt><dd>{selected.student.pphone ? <a href={phoneHref(selected.student.pphone)}>{selected.student.pphone}</a> : '미등록'}</dd></div><div><dt>생년월일</dt><dd>{selected.student.birth || '미등록'}</dd></div><div><dt>학교</dt><dd>{selected.student.school || '미등록'}</dd></div><div><dt>상태</dt><dd>{selected.student.jang ? '장결 학생' : '일반 학생'}</dd></div></dl><div className="sd-detail-actions"><button type="button" onClick={() => editStudent(selected)}>정보 수정</button><button type="button" onClick={() => setMoveTarget({ sid: selected.student.id, fromCk: selected.classKey })}>소속 이동</button></div></aside>}</div> : <div className="sd-table-view"><p>연락처·생년월일까지 한 표에서 비교할 수 있습니다. 표 안을 좌우로 움직여 확인하세요.</p><div className="sd-table-wrap" role="region" aria-label="전체 학생 상세 표, 좌우로 이동 가능" tabIndex={0}><table className="sd-table sd-detailed-table"><caption>{state.curYear}년 전체 학생 상세 표</caption><thead><tr><th>이름</th><th>소속</th><th>번호</th><th>담임 교사</th><th>학교</th><th>학생 연락처</th><th>보호자 연락처</th><th>생년월일</th><th>상태</th><th>작업</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.classKey}/${row.student.id}`}><th scope="row"><span className="sd-table-name">{row.student.name}{row.student.jang && <small>장결</small>}</span></th><td><button type="button" className="sd-class-link" onClick={() => { selectClass(row.classKey); onOpenClass(row.classKey); }}>{row.part}부 {row.grade}학년 {row.classNumber}반</button></td><td>{row.student.num ?? '—'}</td><td>{row.teacher || '미등록'}</td><td>{row.student.school || '—'}</td><td>{row.student.phone ? <a href={phoneHref(row.student.phone)}>{row.student.phone}</a> : '—'}</td><td>{row.student.pphone ? <a href={phoneHref(row.student.pphone)}>{row.student.pphone}</a> : '—'}</td><td>{row.student.birth || '—'}</td><td>{row.student.jang ? '장결' : '일반'}</td><td><div className="sd-actions"><button type="button" onClick={() => editStudent(row)}>수정</button><button type="button" onClick={() => setMoveTarget({ sid: row.student.id, fromCk: row.classKey })}>이동</button></div></td></tr>)}</tbody></table></div></div> : <div className="ad-empty"><AdminIcon name="search" size={26} /><h3>조건에 맞는 학생이 없습니다.</h3><p>검색어를 바꾸거나 필터를 초기화해 보세요.</p><button type="button" onClick={resetFilters}>필터 초기화</button></div>}
    {state.studentModal.open && <StudentModal editId={state.studentModal.editId} onClose={() => dispatch({ type: 'CLOSE_STUDENT_MODAL' })} />}
    {moveTarget && <MoveStudentModal target={moveTarget} onClose={() => setMoveTarget(null)} />}
  </section>;
}
