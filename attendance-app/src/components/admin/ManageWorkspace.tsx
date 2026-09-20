'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/store/AppContext';
import ManageTab from '@/components/tabs/ManageTab';
import StudentDirectory from './StudentDirectory';
import './management-workspace.css';

const VIEWS = [{ key: 'directory', label: '전체 명단' }, { key: 'class', label: '반별 명단·관리' }] as const;

export default function ManageWorkspace() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const requested = useSearchParams().get('view');
  const view = requested === 'class' ? 'class' : 'directory';
  if (state.userRole?.role === 'teacher') return <ManageTab />;

  function changeScope(part: string, grade: string) {
    if (part !== state.curPart) dispatch({ type: 'SET_PART', payload: part });
    if (grade !== state.curGrade) dispatch({ type: 'SET_GRADE', payload: grade });
    const classes = Object.keys(state.classData).filter(key => key.startsWith(`${part}-${grade}-`)).sort((a, b) => Number(a.split('-')[2]) - Number(b.split('-')[2]));
    if (!classes.includes(`${part}-${grade}-${state.curClass}`)) dispatch({ type: 'SET_CLASS', payload: classes[0]?.split('-')[2] ?? '1' });
  }

  return <div className="management-workspace">
    <header className="mw-heading"><h1>학생·반 관리</h1><p>전체 학생을 먼저 검색하고, 필요한 학생의 정보 수정·반 이동·명단 관리를 이어서 처리하세요.</p></header>
    <nav className="mw-tabs" aria-label="학생·반 관리 메뉴">{VIEWS.map(item => <Link key={item.key} href={`/manage?view=${item.key}`} aria-current={view === item.key ? 'page' : undefined}>{item.label}</Link>)}</nav>
    <div className="mw-content">
      {view === 'directory' ? <StudentDirectory onOpenClass={() => router.push('/manage?view=class')} /> : <>
        <div className="mw-scope" aria-label="반별 명단 범위">
          <label><span>부서</span><select value={state.curPart} onChange={event => changeScope(event.target.value, state.curGrade)}><option value="1">1부</option><option value="2">2부</option></select></label>
          <label><span>학년</span><select value={state.curGrade} onChange={event => changeScope(state.curPart, event.target.value)}>{[1, 2, 3].map(value => <option value={String(value)} key={value}>{value}학년</option>)}</select></label>
        </div>
        <ManageTab />
      </>}
    </div>
  </div>;
}
