'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import AttendanceTab from '@/components/tabs/AttendanceTab';
import StatTab from '@/components/tabs/StatTab';
import OverallDashboard from '@/components/tabs/overall/OverallDashboard';
import ClassAttendanceOverview from './ClassAttendanceOverview';
import './management-workspace.css';

const VIEWS = [
  { key: 'overview', label: '반별 출석 현황' },
  { key: 'check', label: '출석 입력' },
  { key: 'table', label: '출석부 조회' },
  { key: 'analysis', label: '출석 분석' },
] as const;
type View = typeof VIEWS[number]['key'];

export default function AttendanceManagement() {
  const { state, dispatch } = useApp();
  const params = useSearchParams();
  const requested = params.get('view') as View | null;
  const [week, setWeek] = useState(params.get('week') ?? '');
  const isTeacher = state.userRole?.role === 'teacher';
  if (isTeacher) return <AttendanceTab />;
  const view = VIEWS.some(item => item.key === requested) ? requested! : 'overview';

  function changeScope(part: string, grade: string) {
    if (part !== state.curPart) dispatch({ type: 'SET_PART', payload: part });
    if (grade !== state.curGrade) dispatch({ type: 'SET_GRADE', payload: grade });
    const classes = Object.keys(state.classData).filter(key => key.startsWith(`${part}-${grade}-`)).sort((a, b) => Number(a.split('-')[2]) - Number(b.split('-')[2]));
    if (!classes.includes(`${part}-${grade}-${state.curClass}`)) dispatch({ type: 'SET_CLASS', payload: classes[0]?.split('-')[2] ?? '1' });
  }

  return <div className="management-workspace">
    <header className="mw-heading"><h1>출석 관리</h1><p>반별 입력 상태를 먼저 확인하고 필요한 반의 출석부로 바로 이동하세요.</p></header>
    <nav className="mw-tabs" aria-label="출석 관리 메뉴">{VIEWS.map(item => <Link key={item.key} href={`/attendance?view=${item.key}${week ? `&week=${encodeURIComponent(week)}` : ''}`} aria-current={view === item.key ? 'page' : undefined}>{item.label}</Link>)}</nav>
    <div className="mw-content">
      {view === 'overview' && <ClassAttendanceOverview weekKey={week} onWeekChange={setWeek} />}
      {view !== 'overview' && <div className="mw-scope" aria-label="출석 관리 범위">
        <label><span>부서</span><select value={state.curPart} onChange={event => changeScope(event.target.value, state.curGrade)}><option value="1">1부</option><option value="2">2부</option></select></label>
        <label><span>학년</span><select value={state.curGrade} onChange={event => changeScope(state.curPart, event.target.value)}>{[1, 2, 3].map(value => <option value={String(value)} key={value}>{value}학년</option>)}</select></label>
      </div>}
      {view === 'check' && <AttendanceTab key="check" initialSubview="check" hideAdminSubtabs />}
      {view === 'table' && <AttendanceTab key="table" initialSubview="table" hideAdminSubtabs />}
      {view === 'analysis' && <div className="mw-analysis"><section><h2>전체 출석 추이</h2><p>반별 누적 출석률과 부서·학년별 흐름입니다.</p><OverallDashboard /></section><section><h2>선택한 반 상세 분석</h2><p>현재 선택한 부서·학년·반의 학생별 현황입니다.</p><StatTab /></section></div>}
    </div>
  </div>;
}
