import Link from "next/link";
import type { HomeAction } from "./homeActions";
import styles from "./HomeAgendaSummary.module.css";

export default function HomeAgendaSummary({ actions }: { actions: HomeAction[] }) {
  return <div className={styles.agenda} aria-label="다음 공유 사역 일정">
    <h2>다음 공유 일정</h2>
    {actions.length === 0 ? <p>예정된 일정이 없습니다.</p> : <ul>{actions.map((item) => {
      const content = <><span><strong>{item.title}</strong><small>{item.meta}</small></span><span>{item.dayLabel}</span></>;
      return <li key={item.id}>{item.href ? <Link href={item.href} prefetch={false} className={styles.row}>{content}</Link> : <div className={styles.row}>{content}</div>}</li>;
    })}</ul>}
  </div>;
}
