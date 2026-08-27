"use client";

// 방학 중 사역 홈 — 행정(/retreats)과 이가드(/field)가 **같은 화면**을 쓴다.
// 다른 것은 카드에서 들어가는 곳뿐이다: mode="admin" → 행정 화면, mode="field" → 현장 화면.
// 데이터 로딩·권한 게이트는 각 라우트가 담당하고, 여기서는 화면만 그린다.

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight, LockKey, X } from "@phosphor-icons/react";
import RetreatCalendarPanel from "@/app/RetreatCalendarPanel";
import type { Retreat } from "@/lib/types";
import { canAccessArea, canCreateRetreat, canEditArea, type MinistryRoles } from "./accessPolicy";
import NewRetreatButton from "./NewRetreatButton";
import { useViewMode } from "@/context/ViewModeContext";

export type VacationMode = "admin" | "field";

type Props = {
  mode: VacationMode;
  roles: MinistryRoles;
  retreats: Retreat[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated?: () => void | Promise<void>;
  /** 행정 모드에서만 — 수련회 삭제 */
  onDelete?: (id: string, name: string) => void;
  /** 현장 모드에서만 — 수련회별 PIN 잠금 여부 */
  lockedIds?: Set<string>;
  /** 화면 우측 상단의 전역 도구 슬롯 (폼 가이드 / 잠금 관리자 / 현장 관리자) */
  headerActions?: ReactNode;
  /** 캘린더 아래 슬롯 (행정 브레인스토밍) */
  footer?: ReactNode;
  loadError?: string | null;
  onRetry?: () => void;
  emptyLogo?: ReactNode;
};

export default function VacationHome({
  mode, roles, retreats, selectedId, onSelect, onCreated, onDelete,
  lockedIds, headerActions, footer, loadError, onRetry, emptyLogo,
}: Props) {
  const router = useRouter();
  const { isMobileView } = useViewMode();
  const canCreate = canCreateRetreat(roles);
  const entryHref = (id: string) => (mode === "admin" ? `/retreat/${id}` : `/retreat/${id}/field`);
  const entryLabel = mode === "admin" ? "행정 화면" : "현장 화면";
  const selected = retreats.find((retreat) => retreat.id === selectedId);

  return (
    <main className="page-container max-w-7xl">
      {headerActions && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {headerActions}
        </div>
      )}

      {loadError && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>⚠ {loadError}</span>
          {onRetry && <button onClick={onRetry} className="btn-secondary btn-sm justify-center">다시 불러오기</button>}
        </div>
      )}

      {isMobileView && retreats.length > 0 && selected ? (
        <div className="vacation-mobile-home">
          <label className="vacation-mobile-select">
            <span>수련회 선택</span>
            <select className="input" value={selected.id} onChange={(event) => onSelect(event.target.value)}>
              {retreats.map((retreat) => <option key={retreat.id} value={retreat.id}>{retreat.year}년 {retreat.name}</option>)}
            </select>
          </label>

          <section className="vacation-mobile-primary">
            <p>{selected.year}년 수련회</p>
            <h1>{selected.name}</h1>
            {mode === "field" ? (
              <>
                <span>지금 해야 할 일은 개인 큐카드에서 바로 확인합니다.</span>
                <button type="button" onClick={() => router.push(`/retreat/${selected.id}/field?view=cue`)} className="btn-primary">개인 큐카드 열기</button>
              </>
            ) : (
              <>
                <span>신청 명단과 편성, 물품, 비용을 관리합니다.</span>
                <button type="button" onClick={() => router.push(`/retreat/${selected.id}`)} className="btn-primary">수련회 행정 열기</button>
              </>
            )}
          </section>

          {mode === "field" && (
            <section className="vacation-mobile-actions" aria-label="현장 바로가기">
              <h2>현장 바로가기</h2>
              <div>
                <button type="button" onClick={() => router.push(`/retreat/${selected.id}/field?view=board`)}><strong>포스트 현황</strong><span>배치와 현재 위치</span></button>
                <button type="button" onClick={() => router.push(`/retreat/${selected.id}/field?view=check`)}><strong>인원체크</strong><span>조·버스·전체 확인</span></button>
                <button type="button" onClick={() => router.push(`/retreat/${selected.id}/field?view=rooms`)}><strong>조별 정보</strong><span>조원과 담당 스탭</span></button>
                <button type="button" onClick={() => router.push(`/retreat/${selected.id}/field?view=lodging`)}><strong>숙소 안내</strong><span>호실과 배치 확인</span></button>
              </div>
              {canAccessArea("retreat-admin", roles) && <button type="button" className="vacation-mobile-admin-link" onClick={() => router.push(`/retreat/${selected.id}`)}>수련회 행정 보기 →</button>}
            </section>
          )}

          {mode === "admin" && canAccessArea("retreat-field", roles) && (
            <button type="button" className="vacation-mobile-field-link" onClick={() => router.push(`/retreat/${selected.id}/field`)}>이가드 현장으로 이동 →</button>
          )}

          <details className="vacation-mobile-calendar">
            <summary>공유 준비 일정 보기</summary>
            <RetreatCalendarPanel retreat={selected} retreats={retreats} canEditPeriods={canEditArea("retreat-admin", roles)} />
          </details>
        </div>
      ) : retreats.length === 0 ? (
        <div className="card mx-auto max-w-md p-16 text-center">
          {emptyLogo && <div className="mb-4 flex justify-center">{emptyLogo}</div>}
          <p className="font-medium text-slate-500">아직 수련회가 없습니다</p>
          <p className="mb-5 mt-1 text-sm text-slate-400">&apos;새 수련회&apos; 버튼으로 시작하세요!</p>
          {canCreate && <NewRetreatButton hrefAfterCreate={entryHref} onCreated={onCreated} />}
        </div>
      ) : (
        <div className="flex flex-col items-stretch gap-7 md:flex-row md:items-start">
          {/* 왼쪽: 수련회 목록 */}
          <div className="w-full md:w-72 md:shrink-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><p className="section-kicker">RETREATS</p><h2 className="mt-1 text-lg font-bold text-slate-800">수련회 목록</h2></div>
              {canCreate && (
                <NewRetreatButton
                  hrefAfterCreate={entryHref}
                  onCreated={onCreated}
                  className="btn-primary px-2 py-1 text-xs"
                />
              )}
            </div>

            {/* 모바일: 선택 상자 + 선택된 수련회 카드 */}
            <div className="md:hidden">
              <select
                aria-label="수련회 선택"
                className="input h-11 w-full bg-white text-sm font-semibold text-slate-800"
                value={selectedId ?? ""}
                onChange={(event) => onSelect(event.target.value)}
              >
                {retreats.map((retreat) => (
                  <option key={retreat.id} value={retreat.id}>{retreat.year}년 {retreat.name}</option>
                ))}
              </select>
              {selected && (
                <div className="mt-3 rounded-lg p-3"
                  style={{ background: "var(--color-primary-glow)", border: "1px solid var(--color-primary-ring)" }}>
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ background: "var(--color-badge-bg)", color: "var(--color-primary)", border: "1px solid var(--color-badge-border)" }}>
                      {selected.year}년
                    </span>
                    {mode === "admin" && onDelete && (
                      <button onClick={() => onDelete(selected.id, selected.name)}
                        className="compact-icon-control -m-2 text-slate-400 transition-colors hover:text-red-500" aria-label={`${selected.name} 삭제`}><X aria-hidden="true" size={18} weight="bold" /></button>
                    )}
                  </div>
                  <div className="font-bold leading-snug text-slate-800">{selected.name}</div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button onClick={() => router.push(entryHref(selected.id))}
                      className="text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
                      {entryLabel} <ArrowRight aria-hidden="true" className="inline" size={13} weight="bold" />
                    </button>
                    {mode === "field" && lockedIds?.has(selected.id) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><LockKey aria-hidden="true" size={12} weight="bold" />PIN</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 데스크톱: 카드 목록 */}
            <div className="hidden space-y-2 md:block">
              {retreats.map((retreat) => {
                const isSelected = selectedId === retreat.id;
                return (
                  <article
                    key={retreat.id}
                    className="card group relative transition-[border-color,box-shadow,transform] duration-150"
                    data-hover
                    style={{
                      borderColor: isSelected ? "var(--color-primary)" : "var(--color-border)",
                      boxShadow: isSelected ? "0 4px 16px var(--color-primary-glow)" : "",
                    }}
                  >
                    <Link
                      href={entryHref(retreat.id)}
                      onMouseEnter={() => onSelect(retreat.id)}
                      className="block rounded-[inherit] p-[18px] focus-visible:outline-offset-[-3px]"
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-2 pr-8">
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ background: "var(--color-primary-glow)", color: "var(--color-primary)", border: "1px solid var(--color-primary-ring)" }}>
                          {retreat.year}년
                        </span>
                        {mode === "field" && lockedIds?.has(retreat.id) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><LockKey aria-hidden="true" size={11} weight="bold" />PIN</span>
                        )}
                      </div>
                      <h3 className="mb-2 truncate text-sm font-bold leading-tight text-slate-800">{retreat.name}</h3>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-400">
                          {retreat.createdAt ? `${new Date(retreat.createdAt).toLocaleDateString("ko-KR")} 생성` : ""}
                        </p>
                        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-primary)" }}>{entryLabel}<ArrowRight aria-hidden="true" size={13} weight="bold" /></span>
                      </div>
                    </Link>
                    {mode === "admin" && onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(retreat.id, retreat.name)}
                        className="compact-icon-control absolute right-2 top-2 text-slate-300 opacity-0 transition-[color,opacity,background-color] hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={`${retreat.name} 삭제`}
                      ><X aria-hidden="true" size={17} weight="bold" /></button>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          {/* 오른쪽: 준비 일정 — 행정·이가드가 공유하는 전역 캘린더 */}
          <div className="w-full min-w-0 flex-1">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-slate-800">
                준비 일정 <span className="text-xs font-normal text-slate-400">(공유)</span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                날짜를 클릭해 일정을 추가하세요 - 모든 수련회·행정·이가드와 공유됩니다.
                {selected ? ` 새 기간 추가 대상: ${selected.name}` : ""}
              </p>
            </div>
            <RetreatCalendarPanel
              retreat={selected}
              retreats={retreats}
              canEditPeriods={canEditArea("retreat-admin", roles)}
            />
            {footer}
          </div>
        </div>
      )}
    </main>
  );
}
