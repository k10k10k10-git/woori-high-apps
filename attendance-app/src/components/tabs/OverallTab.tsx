'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import AdminDashboard from '@/components/admin/AdminDashboard';
import AdminIcon from '@/components/admin/AdminIcon';
import '@/components/admin/admin-overview.css';

const loading = () => <p className="ao-loading" role="status">화면을 불러오고 있습니다.</p>;
const OverallDashboard = dynamic(() => import('./overall/OverallDashboard'), { loading });
const TeacherManagement = dynamic(() => import('./overall/TeacherManagement'), { loading });
const StudentListSection = dynamic(() => import('./overall/StudentListSection'), { loading });
const SuggestionsSection = dynamic(() => import('./overall/SuggestionsSection'), { loading });
const VisitRequestsSection = dynamic(() => import('./overall/VisitRequestsSection'), { loading });

const SECTIONS = [
  { id: 'attendance', label: '출석 현황' },
  { id: 'roster', label: '교사·학생 명단' },
  { id: 'suggest', label: '특이사항' },
  { id: 'visit', label: '심방 요청' },
] as const;

export default function OverallTab() {
  const [page, setPage] = useState<typeof SECTIONS[number]['id']>('attendance');
  const [trendsOpen, setTrendsOpen] = useState(false);
  const trendsRef = useRef<HTMLElement>(null);

  function showTrends() {
    setTrendsOpen(true);
    trendsRef.current?.scrollIntoView({ block: 'start' });
    trendsRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }

  return (
    <div className="admin-overview">
      <header className="ao-heading">
        <h1>전체 현황</h1>
        <p>출석과 구성원, 특이사항과 심방 요청을 한곳에서 확인하세요.</p>
      </header>
      <div className="ao-sections" role="group" aria-label="전체 현황 보기 선택">
        {SECTIONS.map(section => <button key={section.id} type="button" aria-pressed={page === section.id}
          aria-controls="ao-content" onClick={() => setPage(section.id)}>{section.label}</button>)}
      </div>
      <div id="ao-content" className="ao-content">
        {page === 'attendance' && <>
          <AdminDashboard onShowTrends={showTrends} onShowVisits={() => setPage('visit')} />
          <section ref={trendsRef} className="ao-trends" aria-labelledby="ao-trends-title">
            <button type="button" className="ao-trends-toggle" aria-expanded={trendsOpen} aria-controls="ao-trends-content"
              onClick={() => setTrendsOpen(open => !open)}>
              <AdminIcon name="chart" size={20} />
              <span><strong id="ao-trends-title">연간 출석 추이</strong><small>반별 누적 출석률과 주차·월별 변화를 살펴보세요.</small></span>
              <AdminIcon name="chevron" className={trendsOpen ? 'ao-chevron-open' : ''} />
            </button>
            <div id="ao-trends-content" hidden={!trendsOpen}>{trendsOpen && <OverallDashboard />}</div>
          </section>
        </>}
        {page === 'roster' && <div className="ao-directory">
          <TeacherManagement />
          <StudentListSection />
        </div>}
        {page === 'suggest' && <SuggestionsSection />}
        {page === 'visit' && <VisitRequestsSection />}
      </div>
    </div>
  );
}
