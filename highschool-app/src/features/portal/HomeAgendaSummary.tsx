import { CALENDAR_KIND_STYLE } from "./SharedMinistryCalendar";
import type { HomeAction } from "./homeActions";

export default function HomeAgendaSummary({ actions }: { actions: HomeAction[] }) {
  const next = actions[0];
  const remaining = Math.max(0, actions.length - 1);

  return (
    <div className="hero-agenda" aria-label="다음 공유 사역 일정">
      <p className="hero-agenda__title">다음 공유 일정</p>
      {next ? (
        <div className="hero-agenda__row mt-2">
          <span className={`hero-agenda__dot ${CALENDAR_KIND_STYLE[next.kind].dot}`} />
          <span className="min-w-0 flex-1">
            <strong className="block truncate">{next.title}</strong>
            <span className="mt-0.5 block truncate text-[10px] font-normal text-[var(--color-on-dark-muted)]">{next.meta}</span>
          </span>
          <span className="shrink-0 tabular-nums text-slate-300">{next.dayLabel}</span>
          {remaining > 0 && <span className="hero-agenda__count">+{remaining}</span>}
        </div>
      ) : (
        <p className="py-2 text-xs text-slate-300">예정된 일정이 없습니다.</p>
      )}
    </div>
  );
}
