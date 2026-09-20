'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { downloadCSV, downloadXLSX } from '@/utils/export';
import StudentModal from '@/components/modals/StudentModal';
import MoveStudentModal from '@/components/modals/MoveStudentModal';
import AdminIcon from './AdminIcon';
import type { MoveTarget, Student } from '@/types';

type DirectoryRow = { classKey: string; part: string; grade: string; classNumber: string; teacher: string; student: Student };

function searchable(value?: string) {
  return (value ?? '').normalize('NFC').replace(/[\s-]+/g, '').toLocaleLowerCase('ko');
}

export default function StudentDirectory({ onOpenClass }: { onOpenClass: (classKey?: string) => void }) {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);
  const [part, setPart] = useState('all');
  const [grade, setGrade] = useState('all');
  const [classKey, setClassKey] = useState('all');
  const [studentStatus, setStudentStatus] = useState<'all' | 'active' | 'long'>('all');
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

  const allRows = useMemo(() => Object.entries(state.classData).flatMap(([key, info]) => {
    const [rowPart = '', rowGrade = '', classNumber = ''] = key.split('-');
    return (info.students ?? []).map(student => ({ classKey: key, part: rowPart, grade: rowGrade, classNumber, teacher: info.teacher ?? '', student }));
  }).sort((a, b) => a.part.localeCompare(b.part, 'ko', { numeric: true })
    || a.grade.localeCompare(b.grade, 'ko', { numeric: true })
    || a.classNumber.localeCompare(b.classNumber, 'ko', { numeric: true })
    || (a.student.num ?? 0) - (b.student.num ?? 0)
    || a.student.name.localeCompare(b.student.name, 'ko')), [state.classData]);

  const classOptions = useMemo(() => Object.keys(state.classData).filter(key => {
    const [p, g] = key.split('-');
    return (part === 'all' || p === part) && (grade === 'all' || g === grade);
  }).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })), [state.classData, part, grade]);

  const effectiveClass = classOptions.includes(classKey) ? classKey : 'all';
  const q = searchable(search);
  const rows = allRows.filter(row => {
    if (part !== 'all' && row.part !== part) return false;
    if (grade !== 'all' && row.grade !== grade) return false;
    if (effectiveClass !== 'all' && row.classKey !== effectiveClass) return false;
    if (studentStatus === 'active' && row.student.jang === true) return false;
    if (studentStatus === 'long' && row.student.jang !== true) return false;
    if (!q) return true;
    return [row.student.name, row.student.phone, row.student.pphone, row.student.school, row.classKey, row.teacher]
      .some(value => searchable(value).includes(q));
  });
  const partOne = allRows.filter(row => row.part === '1').length;
  const partTwo = allRows.filter(row => row.part === '2').length;
  const longAbsent = allRows.filter(row => row.student.jang === true).length;
  const hasFilters = query || part !== 'all' || grade !== 'all' || effectiveClass !== 'all' || studentStatus !== 'all';

  function selectClass(key: string) {
    const [p, g, c] = key.split('-');
    dispatch({ type: 'SET_PART', payload: p });
    dispatch({ type: 'SET_GRADE', payload: g });
    dispatch({ type: 'SET_CLASS', payload: c });
  }

  function editStudent(row: DirectoryRow) {
    selectClass(row.classKey);
    dispatch({ type: 'OPEN_STUDENT_MODAL', payload: { editId: row.student.id } });
  }

  function resetFilters() { setQuery(''); setPart('all'); setGrade('all'); setClassKey('all'); setStudentStatus('all'); }

  function exportRows(format: 'csv' | 'xlsx') {
    const data = [['이름', '부서', '학년', '반', '담임 교사', '학생 연락처', '보호자 연락처', '학교', '상태'], ...rows.map(row => [
      row.student.name, `${row.part}부`, `${row.grade}학년`, `${row.classNumber}반`, row.teacher,
      row.student.phone ?? '', row.student.pphone ?? '', row.student.school ?? '', row.student.jang ? '장결' : '일반',
    ])];
    if (format === 'csv') downloadCSV(data, `전체명단_${state.curYear}.csv`);
    else void downloadXLSX(data, '전체명단', `전체명단_${state.curYear}.xlsx`);
  }

  return <section className="student-directory" aria-labelledby="student-directory-title">
    <div className="sd-heading"><div><h2 id="student-directory-title">전체 학생 명단</h2><p>반을 먼저 선택하지 않고 학생을 찾아 정보를 수정하거나 이동할 수 있습니다.</p></div><button type="button" className="sd-primary" onClick={() => { dispatch({ type: 'OPEN_STUDENT_MODAL', payload: { editId: null } }); onOpenClass(); }}>학생 추가</button></div>
    <dl className="sd-summary" aria-label="학생 명단 요약"><div><dt>전체</dt><dd>{allRows.length}명</dd></div><div><dt>1부</dt><dd>{partOne}명</dd></div><div><dt>2부</dt><dd>{partTwo}명</dd></div><div><dt>장결</dt><dd>{longAbsent}명</dd></div></dl>
    <div className="sd-toolbar">
      <label className="sd-search"><AdminIcon name="search" /><span className="ad-sr-only">학생 명단 검색</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름·연락처·학교·담임 검색" /></label>
      <select aria-label="명단 부서 필터" value={part} onChange={event => { setPart(event.target.value); setClassKey('all'); }}><option value="all">전체 부서</option><option value="1">1부</option><option value="2">2부</option></select>
      <select aria-label="명단 학년 필터" value={grade} onChange={event => { setGrade(event.target.value); setClassKey('all'); }}><option value="all">전체 학년</option>{[1, 2, 3].map(value => <option value={String(value)} key={value}>{value}학년</option>)}</select>
      <select aria-label="명단 반 필터" value={effectiveClass} onChange={event => setClassKey(event.target.value)}><option value="all">전체 반</option>{classOptions.map(key => { const [p, g, c] = key.split('-'); return <option key={key} value={key}>{p}부 {g}학년 {c}반</option>; })}</select>
      <select aria-label="학생 상태 필터" value={studentStatus} onChange={event => setStudentStatus(event.target.value as typeof studentStatus)}><option value="all">전체 상태</option><option value="active">일반 학생</option><option value="long">장결 학생</option></select>
    </div>
    <div className="sd-result-bar"><span role="status" aria-live="polite">{rows.length}명 표시{hasFilters && ' · 필터 적용 중'}</span><div>{hasFilters && <button type="button" onClick={resetFilters}>필터 초기화</button>}<button type="button" onClick={() => exportRows('csv')}>CSV</button><button type="button" onClick={() => exportRows('xlsx')}>Excel</button></div></div>
    {rows.length ? <div className="sd-table-wrap"><table className="sd-table"><caption>{state.curYear}년 전체 학생 명단</caption><thead><tr><th scope="col">이름</th><th scope="col">현재 소속</th><th scope="col">담임 교사</th><th scope="col">학생 연락처</th><th scope="col">보호자 연락처</th><th scope="col">학교</th><th scope="col">상태</th><th scope="col">작업</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.classKey}/${row.student.id}`}>
      <th scope="row"><strong>{row.student.name}</strong><small>{row.student.birth || '생년월일 미등록'}</small></th>
      <td><button type="button" className="sd-class-link" onClick={() => { selectClass(row.classKey); onOpenClass(row.classKey); }}>{row.part}부 {row.grade}학년 {row.classNumber}반</button></td><td>{row.teacher || '미등록'}</td>
      <td>{row.student.phone ? <a href={`tel:${row.student.phone.replace(/[^\d+]/g, '')}`}>{row.student.phone}</a> : '미등록'}</td><td>{row.student.pphone ? <a href={`tel:${row.student.pphone.replace(/[^\d+]/g, '')}`}>{row.student.pphone}</a> : '미등록'}</td><td>{row.student.school || '—'}</td><td>{row.student.jang ? <span className="sd-status">장결</span> : '일반'}</td>
      <td><div className="sd-actions"><button type="button" onClick={() => editStudent(row)}>수정</button><button type="button" onClick={() => setMoveTarget({ sid: row.student.id, fromCk: row.classKey })}>이동</button></div></td>
    </tr>)}</tbody></table></div> : <div className="ad-empty"><AdminIcon name="search" size={26} /><h3>조건에 맞는 학생이 없습니다.</h3><p>검색어를 바꾸거나 필터를 초기화해 보세요.</p><button type="button" onClick={resetFilters}>필터 초기화</button></div>}
    {state.studentModal.open && <StudentModal editId={state.studentModal.editId} onClose={() => dispatch({ type: 'CLOSE_STUDENT_MODAL' })} />}
    {moveTarget && <MoveStudentModal target={moveTarget} onClose={() => setMoveTarget(null)} />}
  </section>;
}
