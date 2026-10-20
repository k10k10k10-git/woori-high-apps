import { createRoot } from 'react-dom/client';
import { AppProvider } from '../src/store/AppContext';
import AppShell from '../src/components/AppShell';
import AttendanceTab from '../src/components/tabs/AttendanceTab';
import AttendanceManagement from '../src/components/admin/AttendanceManagement';
import ManageWorkspace from '../src/components/admin/ManageWorkspace';
import AdminTab from '../src/components/tabs/AdminTab';
import PastoralReport from '../src/components/admin/PastoralReport';
import FileExportTab from '../src/components/admin/FileExportTab';
import NewFriendRemarkEditor from '../src/components/admin/NewFriendRemarkEditor';
import '../src/components/admin/pastoral-report.css';
import { usePathname } from 'next/navigation';
import '../src/app/globals.css';
function Workflow() { const path = usePathname(); return path === '/admin' ? <AdminTab /> : path === '/manage' ? <ManageWorkspace /> : path === '/pastoral' ? <PastoralReport /> : path === '/files' ? <FileExportTab /> : path === '/attendance' && new URLSearchParams(location.search).get('view') === 'overview' ? <AttendanceManagement /> : <AttendanceTab />; }
const preview = window.location.pathname === '/remarks-preview';
createRoot(document.getElementById('root')!).render(preview ? <main className="pastoral-report" style={{ maxWidth: 900, margin: '32px auto', padding: 16 }}><NewFriendRemarkEditor friendKey="2026-sunday/synthetic" name="합성 새친구" opened="2주 과정 완료. 다음 주 부서 적응을 함께 확인해 주세요." latest={{ status: 'ready', value: '2주 과정 완료. 다음 주 부서 적응을 함께 확인해 주세요.' }} isCurrent={() => false} onClose={() => {}} onRetry={() => {}} /></main> : <><p style={{ margin: 0, textAlign: 'center' }}>합성 데이터 · 로컬 인증 및 출석 검증</p><AppProvider><AppShell><Workflow /></AppShell></AppProvider></>);
