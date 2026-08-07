"use client";

// 방학 중 사역 홈 — 행정(/retreats)과 이가드(/field)가 **같은 화면**을 쓴다.
// 다른 것은 카드에서 들어가는 곳뿐이다: mode="admin" → 행정 화면, mode="field" → 현장 화면.
// 데이터 로딩·권한 게이트는 각 라우트가 담당하고, 여기서는 화면만 그린다.

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import RetreatCalendarPanel from "@/app/RetreatCalendarPanel";
import type { Retreat } from "@/lib/types";
import { canEditPortalArea, type MinistryRole } from "./accessPolicy";
import NewRetreatButton from "./NewRetreatButton";

export type VacationMode = "admin" | "field";

type Props = {
  mode: VacationMode;
  role: MinistryRole;
  retreats: Retreat[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated?: () => void | Promise<void>;
  /** 행정 모드에서만 — 수련회 삭제 */
  onDelete?: (id: string, name: string) => void;
  /** 현장 모드에서만 — 수련회별 PIN 잠금 여부 */
  lockedIds?: Set<string>;
  /** 우측 상단 슬롯 (폼 가이드 / 현장 관리자) */
  headerActions?: ReactNode;
  /** 캘린더 아래 슬롯 (행정 브레인스토밍) */
  footer?: ReactNode;
  loadError?: string | null;
  onRetry?: () => void;
  emptyLogo?: ReactNode;
};

export default function VacationHome({
  mode, role, retreats, selectedId, onSelect, onCreated, onDelete,
  lockedIds, headerActions, footer, loadError, onRetry, emptyLogo,
}: Props) {
  const router = useRouter();
  const canCreate = canEditPortalArea("retreat-admin", role);
  const entryHref = (id: string) => (mode === "admin" ? `/retreat/${id}` : `/retreat/${id}/field`);
  const entryLabel = mode === "admin" ? "행정 화면 →" : "현장 화면 →";
  const selected = retreats.find((retreat) => retreat.id === selectedId);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {loadError && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>⚠ {loadError}</span>
          {onRetry && <button onClick={onRetry} className="btn-secondary btn-sm justify-center">다시 불러오기</button>}
        </div>
      )}

      {retreats.length === 0 ? (
        <div className="card mx-auto max-w-md p-16 text-center">
          {emptyLogo && <div className="mb-4 flex justify-center">{emptyLogo}</div>}
          <p className="font-medium text-slate-500">아직 수련회가 없습니다</p>
          <p className="mb-5 mt-1 text-sm text-slate-400">&apos;새 수련회&apos; 버튼으로 시작하세요!</p>
          {canCreate && <NewRetreatButton hrefAfterCreate={entryHref} onCreated={onCreated} />}
        </div>
      ) : (
        <div className="flex flex-col items-stretch gap-6 md:flex-row md:items-start">
          {/* 왼쪽: 수련회 목록 */}
          <div className="w-full md:w-72 md:shrink-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-700">수련회 목록</h2>
              <div className="flex items-center gap-1.5">
                {headerActions}
                {canCreate && (
                  <NewRetreatButton
                    hrefAfterCreate={entryHref}
                    onCreated={onCreated}
                    className="btn-primary px-2 py-1 text-xs"
                  />
                )}
              </div>
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
                        className="text-lg leading-none text-slate-300 transition-colors hover:text-red-400" aria-label="삭제">×</button>
                    )}
                  </div>
                  <div className="font-bold leading-snug text-slate-800">{selected.name}</div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button onClick={() => router.push(entryHref(selected.id))}
                      className="text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
                      {entryLabel}
                    </button>
                    {mode === "field" && lockedIds?.has(selected.id) && (
                      <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-700">🔒 PIN</span>
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
                  <div
                    key={retreat.id}
                    onClick={() => router.push(entryHref(retreat.id))}
                    onMouseEnter={() => onSelect(retreat.id)}
                    className="card group cursor-pointer p-4 transition-all duration-150"
                    style={{
                      borderColor: isSelected ? "var(--color-primary)" : "var(--color-border)",
                      boxShadow: isSelected ? "0 4px 16px var(--color-primary-glow)" : "",
                    }}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: "var(--color-primary-glow)", color: "var(--color-primary)", border: "1px solid var(--color-primary-ring)" }}>
                        {retreat.year}년
                      </span>
                      <span className="flex items-center gap-1.5">
                        {mode === "field" && lockedIds?.has(retreat.id) && (
                          <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700">🔒 PIN</span>
                        )}
                        {mode === "admin" && onDelete && (
                          <button
                            onClick={(event) => { event.stopPropagation(); onDelete(retreat.id, retreat.name); }}
                            className="text-lg leading-none text-slate-200 opacity-0 transition-colors hover:text-red-400 group-hover:opacity-100"
                            aria-label="삭제"
                          >×</button>
                        )}
                      </span>
                    </div>
                    <h3 className="mb-2 truncate text-sm font-bold leading-tight text-slate-800">{retreat.name}</h3>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-400">
                        {retreat.createdAt ? `${new Date(retreat.createdAt).toLocaleDateString("ko-KR")} 생성` : ""}
                      </p>
                      <span className="text-xs font-medium" style={{ color: "var(--color-primary)" }}>{entryLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 오른쪽: 준비 일정 — 행정·이가드가 공유하는 전역 캘린더 */}
          <div className="w-full min-w-0 flex-1">
            <div className="mb-3">
              <h2 className="text-base font-bold text-slate-700">
                준비 일정 <span className="text-xs font-normal text-slate-400">(공유)</span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                날짜를 클릭해 일정을 추가하세요 — 모든 수련회·행정·이가드와 공유됩니다.
                {selected ? ` 새 기간 추가 대상: ${selected.name}` : ""}
              </p>
            </div>
            <RetreatCalendarPanel
              retreat={selected}
              retreats={retreats}
              canEditPeriods={canEditPortalArea("retreat-admin", role)}
            />
            {footer}
          </div>
        </div>
      )}
    </main>
  );
}
