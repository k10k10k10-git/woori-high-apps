"use client";

import Link from "next/link";
import { useId } from "react";
import type { SundayTeamKey } from "@/features/portal/featureCatalog";
import { useFirstVisitGuide } from "@/features/portal/useFirstVisitGuide";
import styles from "./TeamWorkspace.module.css";

type GuideStep = { title: string; description: string; href?: string; action?: string };
/** 안내 완료만 브라우저에 기억한다. 업무 원장·계정 권한에는 쓰지 않는다. */
export function FirstVisitGuide({ userId, teamKey, teamLabel, roleLabel, steps }: {
  userId: string; teamKey: SundayTeamKey; teamLabel: string; roleLabel: string; steps: GuideStep[];
}) {
  const { opened, open, close } = useFirstVisitGuide(userId, teamKey);
  const panelId = useId();
  const titleId = useId();

  return <section id="team-first-guide" className={styles.guide} aria-label={`${teamLabel} 사용 안내`}>
    <div className={styles.guideTop}>
      <div><h2 id={titleId}>{opened ? `${teamLabel}, 이렇게 시작해요` : `${teamLabel} 사용 안내`}</h2><p>내 역할: {roleLabel} · 팀 현황을 먼저 확인하고 필요한 업무로 이동하세요.</p></div>
      <button type="button" className="btn-secondary" aria-expanded={opened} aria-controls={panelId} onClick={opened ? close : open}>{opened ? "안내 닫기" : "사용 안내 열기"}</button>
    </div>
    {opened && <div id={panelId} role="region" aria-labelledby={titleId}>
      <ol className={styles.guideSteps}>{steps.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.description}</p>{step.href && <Link href={step.href}>{step.action ?? "업무 열기"}</Link>}</li>)}</ol>
      <div className={styles.guideFooter}><p>안내를 닫아도 ‘사용 안내 열기’에서 다시 볼 수 있어요.</p><Link href="/library/help">사이트 사용법 보기</Link></div>
    </div>}
  </section>;
}
