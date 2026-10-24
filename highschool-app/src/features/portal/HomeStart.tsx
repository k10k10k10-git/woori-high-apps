"use client";

import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react';
import type { buildHomeEntry } from './homeEntry';
import styles from './HomeStart.module.css';
import { sundayTeamOf } from './featureCatalog';
export function HomeStart({ entry, roleLabel, viewOnly = false, accountEmail }: { entry: ReturnType<typeof buildHomeEntry>; roleLabel: string; viewOnly?: boolean; accountEmail?: string | null }) {
  const teamKey = entry?.href.startsWith('/teams/') ? sundayTeamOf(entry.href.split('/')[2])?.key : undefined;
  if (!entry) return <section className={styles.start} aria-label="담당 팀 연결 안내">
    <div><h2>담당 팀 연결이 필요합니다</h2><p>담당 팀장 또는 교역자에게 로그인 이메일과 맡을 팀을 알려 주세요.</p>{accountEmail && <span className={styles.role}>로그인 계정 · {accountEmail}</span>}</div>
    <Link href="/help/feedback" className={styles.action}>팀 연결 문의하기<ArrowRight size={20} aria-hidden="true" /></Link>
  </section>;
  return <section className={styles.start} aria-label="내 업무 시작">
    <div><h2>{entry.title}</h2><p>{entry.description}</p><span className={styles.role}>{roleLabel}{viewOnly && teamKey ? ' · 팀 기록 조회 전용' : ''}</span></div>
    <Link href={entry.href} className={styles.action}>업무 열기<ArrowRight size={20} aria-hidden="true" /></Link>
  </section>;
}
