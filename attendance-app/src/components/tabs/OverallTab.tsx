'use client';
import { useState } from 'react';
import OverallDashboard from './overall/OverallDashboard';
import TeacherManagement from './overall/TeacherManagement';
import StudentListSection from './overall/StudentListSection';
import SuggestionsSection from './overall/SuggestionsSection';

export default function OverallTab() {
  const [page, setPage] = useState<'dashboard' | 'roster' | 'suggest'>('dashboard');

  return (
    <div className="overall-container">
      {/* 페이지 탭 */}
      <div className="class-tabs-wrap" role="tablist" aria-label="전체 현황 탭">
        <button role="tab" aria-selected={page === 'dashboard'} className={`class-tab${page === 'dashboard' ? ' active' : ''}`} onClick={() => setPage('dashboard')}>대시보드</button>
        <button role="tab" aria-selected={page === 'roster'} className={`class-tab${page === 'roster' ? ' active' : ''}`} onClick={() => setPage('roster')}>교사/학생 명단</button>
        <button role="tab" aria-selected={page === 'suggest'} className={`class-tab${page === 'suggest' ? ' active' : ''}`} onClick={() => setPage('suggest')}>건의사항</button>
      </div>

      {page === 'dashboard' && <OverallDashboard />}

      {page === 'roster' && (
        <>
          <TeacherManagement />
          <StudentListSection />
        </>
      )}

      {page === 'suggest' && <SuggestionsSection />}
    </div>
  );
}
