"use client";

// 행정·프로그램·현장은 같은 수련회를 먼저 선택하고, 해당 수련회의 업무로 이동한다.
// 데이터 로딩·권한 게이트·저장은 기존 라우트가 담당한다.
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ArrowRight, CalendarBlank, CaretDown, Check, LockKey, X } from "@phosphor-icons/react";
import RetreatCalendarPanel from "@/app/RetreatCalendarPanel";
import type { Retreat } from "@/lib/types";
import { canAccessArea, canCreateRetreat, canEditArea, type MinistryRoles } from "./accessPolicy";
import NewRetreatButton from "./NewRetreatButton";
import RetreatAreaNav from "./RetreatAreaNav";
import { useViewMode } from "@/context/ViewModeContext";
import styles from "./VacationHome.module.css";

export type VacationMode = "admin" | "program" | "field";
type Period = { retreatId: string; startDate: string; endDate?: string };
type Props = {
  mode: VacationMode;
  roles: MinistryRoles;
  retreats: Retreat[];
  periods?: Period[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated?: () => void | Promise<void>;
  onDelete?: (id: string, name: string) => void;
  lockedIds?: Set<string>;
  headerActions?: ReactNode;
  footer?: ReactNode;
  loadError?: string | null;
  onRetry?: () => void;
  emptyLogo?: ReactNode;
};

function periodLabel(id: string, periods: Period[]) {
  const matching = periods.filter((period) => period.retreatId === id).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (matching.length === 0) return "기간 미등록";
  return matching.map(({ startDate, endDate }) => `${startDate.replaceAll("-", ".")}${endDate && endDate !== startDate ? ` – ${endDate.replaceAll("-", ".")}` : ""}`).join(" · ");
}

export default function VacationHome({
  mode, roles, retreats, periods = [], selectedId, onSelect, onCreated, onDelete,
  lockedIds, headerActions, footer, loadError, onRetry, emptyLogo,
}: Props) {
  const router = useRouter();
  const { isMobileView } = useViewMode();
  const canCreate = mode !== "program" && canCreateRetreat(roles);
  const selected = retreats.find((retreat) => retreat.id === selectedId);
  // 상세 화면에서 돌아오는 명시적 수련회 링크만 복원한다. 첫 방문의 임의 선택은 하지 않는다.
  useEffect(() => {
    if (selectedId) return;
    const requestedId = new URLSearchParams(window.location.search).get("retreat");
    if (requestedId && retreats.some((retreat) => retreat.id === requestedId)) onSelect(requestedId);
  }, [onSelect, retreats, selectedId]);
  const entryHref = (id: string) => `/events/${encodeURIComponent(id)}/${mode === "admin" ? "administration" : mode === "program" ? "programs" : "field"}`;

  return (
    <main className={`page-container max-w-7xl ${styles.page}`}>
      <header className={styles.heading}>
        <div><h1>수련회</h1><p>수련회를 선택하고 맡은 업무를 시작하세요.</p></div>
        <div className={styles.tools}>
          {headerActions}
          {canCreate && <NewRetreatButton hrefAfterCreate={entryHref} onCreated={onCreated} />}
        </div>
      </header>

      {loadError && <div role="alert" className={styles.error}>
        <span>{loadError}</span>
        {onRetry && <button onClick={onRetry} className="btn-secondary btn-sm">다시 불러오기</button>}
      </div>}

      {retreats.length === 0 ? (
        <section className={styles.empty}>
          {emptyLogo}
          <h2>아직 수련회가 없습니다</h2>
          <p>{canCreate ? "새 수련회를 만들면 행정·프로그램·현장 업무를 함께 준비할 수 있습니다." : "수련회가 등록되면 이곳에서 선택할 수 있습니다."}</p>
        </section>
      ) : <>
        <ol className={styles.steps} aria-label="수련회 업무 시작 순서">
          <li aria-current={!selected ? "step" : undefined}><span>{selected ? <Check size={14} weight="bold" aria-hidden="true" /> : "1"}</span>수련회 선택</li>
          <li className={styles.stepArrow} aria-hidden="true"><ArrowRight size={16} /></li>
          <li aria-current={selected ? "step" : undefined}><span>2</span>업무 선택</li>
        </ol>

        <div className={`${styles.workspace}${selected ? ` ${styles.hasSelection}` : ""}`}>
          <section className={styles.retreats} aria-label="수련회 목록">
            {selected && isMobileView ? <label className={styles.selector}>
              <span>선택한 수련회</span>
              <span className={styles.selectControl}>
                <select className="input" value={selected.id} onChange={(event) => onSelect(event.target.value)}>
                  {retreats.map((retreat) => <option key={retreat.id} value={retreat.id}>{retreat.year}년 {retreat.name}</option>)}
                </select>
                <CaretDown size={18} aria-hidden="true" />
              </span>
            </label> : <div className={styles.list}>
              {retreats.map((retreat) => <article key={retreat.id} className={styles.retreatRow} data-selected={selected?.id === retreat.id}>
                <button className={styles.retreatButton} type="button" aria-pressed={selected?.id === retreat.id} onClick={() => onSelect(retreat.id)}>
                  <div className={styles.retreatMeta}><span>{retreat.year}년</span>{lockedIds?.has(retreat.id) && <span><LockKey size={13} aria-hidden="true" />PIN 잠금</span>}</div>
                  <span className={styles.retreatName}>{retreat.name}</span>
                  <p>{periodLabel(retreat.id, periods)}</p>
                  <span className={styles.choose}>{selected?.id === retreat.id ? "선택한 수련회" : "업무 선택"}<ArrowRight size={17} aria-hidden="true" /></span>
                </button>
                {mode === "admin" && onDelete && <button type="button" className={styles.deleteButton} onClick={() => onDelete(retreat.id, retreat.name)} aria-label={`${retreat.name} 삭제`}><X aria-hidden="true" size={17} /></button>}
              </article>)}
            </div>}
          </section>

          {selected && <section className={styles.selected} aria-label={`${selected.name} 업무 선택`}>
            <header className={styles.selectedHeader}>
              <h2>{selected.name}</h2>
              <p><CalendarBlank size={17} aria-hidden="true" />{periodLabel(selected.id, periods)}</p>
              {lockedIds?.has(selected.id) && <span className={styles.pin}><LockKey size={14} aria-hidden="true" />현장 입장 시 PIN 확인</span>}
            </header>
            <RetreatAreaNav retreatId={selected.id} adminAllowed={canAccessArea("retreat-admin", roles)} fieldAllowed={canAccessArea("retreat-field", roles)} tone="surface" variant="choices" />
            {isMobileView && mode === "field" && <section className={styles.fieldActions} aria-label="현장 바로가기">
              <button type="button" onClick={() => router.push(`/events/${encodeURIComponent(selected.id)}/field?view=cue`)} className="btn-primary">개인 큐카드 열기</button>
              <div>
                <button type="button" onClick={() => router.push(`/events/${encodeURIComponent(selected.id)}/field?view=board`)}>포스트 현황</button>
                <button type="button" onClick={() => router.push(`/events/${encodeURIComponent(selected.id)}/field?view=check`)}>인원체크</button>
                <button type="button" onClick={() => router.push(`/events/${encodeURIComponent(selected.id)}/field?view=rooms`)}>조별 정보</button>
                <button type="button" onClick={() => router.push(`/events/${encodeURIComponent(selected.id)}/field?view=lodging`)}>숙소 안내</button>
              </div>
            </section>}
          </section>}
        </div>

        <details className={styles.sharedCalendar}>
          <summary><div><CalendarBlank size={21} aria-hidden="true" /><span>전체 수련회 준비 일정<small>모든 수련회에서 함께 쓰는 일정</small></span></div><CaretDown size={18} aria-hidden="true" /></summary>
          <div className={styles.calendarContent}>
            <p className={styles.calendarContext}>{selected ? <>새 수련회 기간 추가 대상: <strong>{selected.name}</strong>. 준비 일정은 전체 공용입니다.</> : "수련회를 먼저 선택하면 해당 수련회의 기간을 추가할 수 있습니다. 준비 일정은 전체 공용입니다."}</p>
            <RetreatCalendarPanel retreat={selected} retreats={retreats} canEditPeriods={canEditArea("retreat-admin", roles)} />
            {footer}
          </div>
        </details>
      </>}
    </main>
  );
}
