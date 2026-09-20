import { createRoot } from 'react-dom/client';
import { AppProvider } from '../src/store/AppContext';
import AppShell from '../src/components/AppShell';
import AttendanceTab from '../src/components/tabs/AttendanceTab';
import ManageWorkspace from '../src/components/admin/ManageWorkspace';
import AdminTab from '../src/components/tabs/AdminTab';
import { usePathname } from 'next/navigation';
import '../src/app/globals.css';
function Workflow() { const path = usePathname(); return path === '/admin' ? <AdminTab /> : path === '/manage' ? <ManageWorkspace /> : <AttendanceTab />; }
createRoot(document.getElementById('root')!).render(<><p style={{ margin: 0, textAlign: 'center' }}>합성 데이터 · 로컬 인증 및 출석 검증</p><AppProvider><AppShell><Workflow /></AppShell></AppProvider></>);
