"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarBlank } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea } from "@/features/portal/accessPolicy";
import { subscribeSemesters } from "@/features/semester/db";
import type { Semester } from "@/features/semester/types";
import TrainingAccessState from "./TrainingAccessState";

export default function TrainingHome() {
  const { roles } = useAuth();
  const allowed = canAccessArea("semester", roles);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    return subscribeSemesters(
      (items) => { setSemesters(items); setLoaded(true); },
      (reason) => { setError(reason.message); setLoaded(true); },
    );
  }, [allowed]);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const current = semesters.find(({ meta }) => !!meta.startDate && !!meta.endDate && meta.startDate <= today && today <= meta.endDate) ?? semesters[0];

  return <TrainingAccessState allowed={allowed}><main className="team-first-page">
    <header className="team-first-page-header"><div><p className="section-kicker">TRAINING</p><h1>훈련</h1><p>학기마다 운영센터에서 관리하던 훈련반, 명단, 출석과 커리큘럼을 한곳에서 이어봅니다.</p></div><span className="team-first-count">{semesters.length}개 학기</span></header>
    {error && <div className="team-first-alert" role="alert">훈련 정보를 불러오지 못했습니다: {error}</div>}
    {!loaded ? <div className="team-first-state" role="status">훈련 학기를 불러오는 중입니다…</div> : semesters.length === 0 ? <section className="team-first-empty"><h2>등록된 학기가 없습니다</h2><p>교역자 또는 행정팀이 운영센터에서 학기를 먼저 만들어 주세요.</p></section> : <>
      {current && <section className="team-action-grid training-current-card"><Link href={`/training/terms/${encodeURIComponent(current.id)}/overview`} className="team-action-card is-primary"><div><span>현재 학기</span><h2>{current.meta.title}</h2><p>훈련반 현황과 다음 회차를 바로 확인합니다.</p></div><ArrowRight size={18} aria-hidden="true" /></Link></section>}
      <section className="team-term-section"><div className="team-section-heading"><div><h2>학기별 훈련</h2><p>기존 기록을 옮기지 않고 같은 학기 원장을 사용합니다.</p></div></div><div className="team-term-list">{semesters.map((semester) => <Link key={semester.id} href={`/training/terms/${encodeURIComponent(semester.id)}/overview`} className="team-term-row"><CalendarBlank size={18} aria-hidden="true" /><span><strong>{semester.meta.title}</strong><small>{semester.meta.startDate && semester.meta.endDate ? `${semester.meta.startDate} — ${semester.meta.endDate}` : semester.id}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>)}</div></section>
    </>}
  </main></TrainingAccessState>;
}
