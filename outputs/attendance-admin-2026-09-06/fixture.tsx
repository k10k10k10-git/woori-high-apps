import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider, useApp } from '@/store/AppContext';
import FirebaseDataLoader from '@/components/FirebaseDataLoader';
import DataLoadGate from '@/components/DataLoadGate';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import DashboardPage from '@/app/dashboard/page';
import Toast from '@/components/Toast';
import { canUseAdminWorkspace, canAccessAttendancePath } from '@/lib/adminNavigation';
import { qa, dynamic, usePathname, useRouter } from './mocks';
import '@/app/globals.css';
import type { UserRole } from '@/types';

const AdminPage = dynamic(() => import('@/app/admin/page'), { loading: () => <p role="status">계정·설정 화면을 불러오고 있습니다.</p> });

const params = new URLSearchParams(window.location.search);
const role: UserRole | null = qa.role === 'guest' ? null : qa.role === 'teacher'
  ? { role: 'teacher', name: '가상교사 가람', email: 'teacher1@example.test', part: '1', grade: '1', class: '1' }
  : { role: 'admin', name: qa.role === 'demo' ? '가상 데모 관리자' : '가상 관리자', email: 'admin@example.test' };

function Controls() {
  const [hidden, setHidden] = useState(params.get('chrome') === '0');
  const [snapshot, setSnapshot] = useState(qa.inspect());
  function change(key: string, value: string) { const url = new URL(window.location.href); url.searchParams.set(key, value); window.location.assign(url); }
  if (hidden) return null;
  return <details className="qa-controls"><summary>합성 QA · 운영 연결 없음</summary>
    <label>역할 <select value={qa.role} onChange={event => change('role', event.target.value)}><option value="admin">일반 관리자</option><option value="teacher">교사</option><option value="demo">관리자 권한의 데모</option><option value="guest">비로그인</option></select></label>
    <label>데이터 <select value={params.get('state') || 'populated'} onChange={event => change('state', event.target.value)}><option value="populated">완료·부분·미입력·장결</option><option value="empty">모든 원장 비어 있음</option><option value="loading">읽기 응답 대기</option><option value="error">선택 경로 읽기 오류</option></select></label>
    <label>오류 경로 <select value={qa.fault} onChange={event => change('fault', event.target.value)}>{['attendance', 'classes', 'events', 'userRoles', 'suggestions', 'teacherSpecial', 'teacherStaff', 'config/sheetSync', 'all'].map(value => <option key={value}>{value}</option>)}</select></label>
    <div><button onClick={() => { qa.recover(); setSnapshot(qa.inspect()); }}>오류 복구 준비</button><button onClick={() => setSnapshot(qa.inspect())}>계수 새로고침</button><button onClick={() => setHidden(true)}>도구 숨기기</button></div>
    <p>복구 준비 후 실제 화면의 다시 시도 버튼을 누릅니다.</p>
    <output>읽기 {snapshot.reads.length} · 차단한 쓰기 {snapshot.writes.length} · 차단한 네트워크 {snapshot.blockedNetwork.length}</output>
  </details>;
}

function Fixture() {
  const { state, dispatch } = useApp();
  const path = usePathname();
  const router = useRouter();
  const [loggedOut, setLoggedOut] = useState(false);
  useEffect(() => {
    dispatch({ type: 'SET_FB_READY' });
    dispatch({ type: 'SET_USER_ROLE', payload: role });
    dispatch({ type: 'SET_VIEW', payload: 'all' });
  }, [dispatch]);
  const isDemo = qa.role === 'demo';
  const allowed = canAccessAttendancePath(path, role, isDemo);
  const workspace = canUseAdminWorkspace(role, isDemo);
  let content: React.ReactNode;
  if (loggedOut || !role) content = <section className="qa-guard"><h1>합성 로그인 화면</h1><p>운영 인증을 호출하지 않았습니다.</p></section>;
  else if (!allowed || !workspace) content = <section className="qa-guard" role="alert"><h1>관리자 전용 화면에 접근할 수 없습니다.</h1><p>실제 canAccessAttendancePath / canUseAdminWorkspace가 {qa.role} 역할을 차단했습니다.</p><code>{path}</code><p>교사와 데모의 출석 입력 화면은 이번 fixture 범위 밖입니다.</p></section>;
  else content = <AdminWorkspace isOnline={params.get('online') !== '0'} onLogout={() => { qa.actions.push('logout:synthetic'); setLoggedOut(true); }}>
    <FirebaseDataLoader />
    <DataLoadGate>{path === '/admin' ? <AdminPage /> : path === '/' || path === '/dashboard' || path === '/overall' ? <DashboardPage /> : <section className="qa-destination"><h1>화면 이동 확인</h1><p>실제 관리자 메뉴와 반별 이동이 요청한 목적지입니다. 이 화면의 편집 기능은 fixture 범위 밖입니다.</p><code>{path}{window.location.search}</code><p>{state.curPart}부 {state.curGrade}학년 {state.curClass}반</p><button onClick={() => router.push('/dashboard')}>전체 현황으로 돌아가기</button></section>}</DataLoadGate>
  </AdminWorkspace>;
  return <>{content}<Toast /><Controls /></>;
}

const style = document.createElement('style');
style.textContent = `.qa-controls{position:fixed;z-index:10000;bottom:12px;right:12px;background:#fff;color:#262626;border:1px solid #bbb;border-radius:7px;padding:10px;font:12px/1.5 system-ui;max-width:min(340px,calc(100vw - 24px));box-shadow:0 3px 16px #0001}.qa-controls summary{cursor:pointer}.qa-controls label{display:flex;justify-content:space-between;gap:8px;margin-top:8px}.qa-controls select{max-width:210px}.qa-controls button{margin:8px 5px 0 0;border:1px solid #bbb;padding:4px 6px;background:#f8f8f8;border-radius:4px}.qa-controls p{font-size:11px}.qa-guard,.qa-destination{padding:32px;line-height:1.7}.qa-guard h1,.qa-destination h1{font-size:20px}.qa-destination code{overflow-wrap:anywhere}`;
document.head.appendChild(style);
createRoot(document.getElementById('root')!).render(<AppProvider><Fixture /></AppProvider>);
