import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react';
import type { buildHomeEntry } from './homeEntry';
import styles from './HomeStart.module.css';
export function HomeStart({ entry, roleLabel }: { entry: ReturnType<typeof buildHomeEntry>; roleLabel: string }) {
  if (!entry) return null;
  return <section className={styles.start} aria-label="내 업무 시작">
    <div><h2>{entry.title}</h2><p>{entry.description}</p><span className={styles.role}>{roleLabel}</span></div>
    <Link href={entry.href} className={styles.action}>업무 열기<ArrowRight size={20} aria-hidden="true" /></Link>
    <details className={styles.guide}><summary>처음이라면 내 업무부터 확인하세요</summary><ol>{entry.steps.map(step => <li key={step}>{step}</li>)}</ol><Link href="/help/feedback">사용법 문의·문제 제보</Link></details>
  </section>;
}
