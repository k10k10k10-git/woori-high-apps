import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MyPageModal from '@/features/portal/MyPageModal';
import '@/app/globals.css';
import '@/app/operations-tables.css';
import '@/app/portal-surfaces.css';
import '@/app/theme-compat.css';
import '@/app/interaction-controls.css';
import '@/app/program-preparation.css';
import '@/app/my-page-workspace.css';
import { qa } from './mocks';

document.documentElement.dataset.theme = qa.theme;
document.documentElement.style.colorScheme = qa.theme;
window.__MY_PAGE_QA__ = qa;

function Fixture() {
  const [open, setOpen] = useState(true);
  return <main style={{ padding: '32px', maxWidth: '1160px', margin: 'auto' }}>
    <p style={{ fontSize: 13, marginBottom: 12 }}>운영 컴포넌트 · 합성 데이터 QA · 실제 인증/DB 연결 없음</p>
    <h1 style={{ fontSize: 24, fontWeight: 700 }}>고등부 통합사이트</h1>
    <button type="button" className="btn-primary" onClick={() => setOpen(true)} style={{ marginTop: 24 }}>마이페이지 열기</button>
    <p style={{ marginTop: 20 }}>역할: {qa.role} · 데이터: {qa.state} · 테마: {qa.theme}</p>
    {open && <MyPageModal initialTab={qa.tab} onClose={() => setOpen(false)} />}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
