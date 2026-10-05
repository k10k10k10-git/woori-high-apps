"use client";

import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react';
import type { buildHomeEntry } from './homeEntry';
import styles from './HomeStart.module.css';
import { useFirstVisitGuide } from './useFirstVisitGuide';
import { sundayTeamOf } from './featureCatalog';
export function HomeStart({ entry, roleLabel, userId, viewOnly = false }: { entry: ReturnType<typeof buildHomeEntry>; roleLabel: string; userId: string; viewOnly?: boolean }) {
  const teamKey = entry?.href.startsWith('/teams/') ? sundayTeamOf(entry.href.split('/')[2])?.key : undefined;
  const { opened, open, close } = useFirstVisitGuide(userId, teamKey ? `home:${teamKey}` : 'home');
  if (!entry) return null;
  const steps = viewOnly && teamKey ? ['팀 전체 현황과 모임 일정 확인', '학기 명단·연락처와 기존 기록 조회', '기록 변경이 필요하면 담당 팀장에게 문의'] : entry.steps;
  return <section className={styles.start} aria-label="내 업무 시작">
    <div><h2>{entry.title}</h2><p>{entry.description}</p><span className={styles.role}>{roleLabel}{viewOnly && teamKey ? ' · 팀 기록 조회 전용' : ''}</span></div>
    <Link href={entry.href} className={styles.action}>업무 열기<ArrowRight size={20} aria-hidden="true" /></Link>
    <details className={styles.guide} open={opened} onToggle={(event) => { if (event.currentTarget.open !== opened) { if (event.currentTarget.open) open(); else close(); } }}><summary>처음이라면 내 업무부터 확인하세요</summary><ol>{steps.map(step => <li key={step}>{step}</li>)}</ol><Link href="/library/help">사이트 사용법 보기</Link><Link href="/help/feedback">문제 문의하기</Link></details>
  </section>;
}
