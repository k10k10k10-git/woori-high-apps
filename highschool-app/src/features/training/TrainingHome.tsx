"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarBlank } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea } from "@/features/portal/accessPolicy";
import { subscribeSemesters } from "@/features/semester/db";
import { featuredTerm, TERM_PHASE_LABEL } from "@/features/semester/termPhase";
import type { Semester } from "@/features/semester/types";
import TrainingAccessState from "./TrainingAccessState";

export default function TrainingHome() {
  const { user, loading, roleError, roles } = useAuth();
  const [attempt, setAttempt] = useState(0);
  return <TrainingHomeContent key={`${loading}:${!!roleError}:${user?.uid ?? "guest"}:${roles.semester}:${roles.retreat}:${attempt}`} onRetry={() => setAttempt((value) => value + 1)} />;
}

function TrainingHomeContent({ onRetry }: { onRetry: () => void }) {
  const { user, loading, roleError, roles } = useAuth();
  const uid = user?.uid;
  const allowed = canAccessArea("semester", roles);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || loading || roleError || !allowed) return;
    return subscribeSemesters(
      (items) => { setSemesters(items); setLoaded(true); setError(null); },
      (reason) => { setError(reason.message); setLoaded(true); },
    );
  }, [uid, loading, roleError, allowed]);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const featured = featuredTerm(semesters, today);

  return <TrainingAccessState allowed={allowed}><main className="team-first-page">
    <header className="team-first-page-header"><div><h1>신앙훈련</h1><p>학기를 선택해 훈련 명단과 출석을 확인하세요.</p></div><span className="team-first-count">{semesters.length}개 학기</span></header>
    {error && <div className="team-first-alert" role="alert"><span>훈련 정보를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.</span><button className="btn-secondary" onClick={onRetry}>다시 불러오기</button><Link className="btn-secondary" href="/library/help#connection">접속 문제 도움말</Link></div>}
    {!loaded ? <div className="team-first-state" role="status">훈련 학기를 불러오는 중입니다…</div> : error ? null : semesters.length === 0 ? <section className="team-first-empty"><h2>등록된 학기가 없습니다</h2><p>교역자 또는 행정팀이 운영센터에서 학기를 먼저 만들어 주세요.</p></section> : <>
      {featured && <section className="team-action-grid training-current-card"><Link href={`/training/terms/${encodeURIComponent(featured.semester.id)}/overview`} className="team-action-card is-primary"><div><span>{TERM_PHASE_LABEL[featured.phase]}</span><h2>{featured.semester.meta.title}</h2></div><ArrowRight size={18} aria-hidden="true" /></Link></section>}
      <section className="team-term-section"><div className="team-section-heading"><div><h2>학기별 훈련</h2></div></div><div className="team-term-list">{semesters.map((semester) => <Link key={semester.id} href={`/training/terms/${encodeURIComponent(semester.id)}/overview`} className="team-term-row"><CalendarBlank size={18} aria-hidden="true" /><span><strong>{semester.meta.title}</strong><small>{semester.meta.startDate && semester.meta.endDate ? `${semester.meta.startDate} — ${semester.meta.endDate}` : semester.id}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>)}</div></section>
    </>}
  </main></TrainingAccessState>;
}
