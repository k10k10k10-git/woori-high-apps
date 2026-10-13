"use client";

import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react';
import type { buildHomeEntry } from './homeEntry';
import styles from './HomeStart.module.css';
import { sundayTeamOf } from './featureCatalog';
export function HomeStart({ entry, roleLabel, viewOnly = false }: { entry: ReturnType<typeof buildHomeEntry>; roleLabel: string; viewOnly?: boolean }) {
  const teamKey = entry?.href.startsWith('/teams/') ? sundayTeamOf(entry.href.split('/')[2])?.key : undefined;
  if (!entry) return null;
  return <section className={styles.start} aria-label="내 업무 시작">
    <div><h2>{entry.title}</h2><p>{entry.description}</p><span className={styles.role}>{roleLabel}{viewOnly && teamKey ? ' · 팀 기록 조회 전용' : ''}</span></div>
    <Link href={entry.href} className={styles.action}>업무 열기<ArrowRight size={20} aria-hidden="true" /></Link>
  </section>;
}
