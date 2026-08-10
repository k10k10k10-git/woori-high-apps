"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSemesters } from "@/features/semester/db";
import type { Semester } from "@/features/semester/types";
import { getRetreats } from "@/lib/db";
import type { Retreat } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { canAccessPortalArea } from "./accessPolicy";
import { buildPortalSearchItems, filterPortalSearchItems } from "./portalSearchCatalog";

const AREA_LABEL = {
  home: "홈",
  semester: "학기",
  retreat: "행정",
  field: "현장",
  support: "도움",
} as const;

export default function PortalSearch() {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [retreats, setRetreats] = useState<Retreat[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (canAccessPortalArea("semester", role)) {
      void getSemesters().then(setSemesters).catch(() => setSemesters([]));
    }
    void getRetreats().then(setRetreats).catch(() => setRetreats([]));
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, role]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const items = useMemo(
    () => buildPortalSearchItems({ role, semesters, retreats }),
    [role, semesters, retreats],
  );
  const results = useMemo(() => filterPortalSearchItems(items, query), [items, query]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="portal-action" aria-label="통합 검색 열기">
        <span aria-hidden="true">⌕</span>
        <span className="hidden md:inline">검색</span>
        <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-on-dark-muted)] xl:inline">⌘K</kbd>
      </button>
      {open && (
        <div className="modal-backdrop fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/55 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={close}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="통합 검색"
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
              <span aria-hidden="true" className="text-lg text-slate-400">⌕</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="사역, 수련회, 조편성, 인원체크 검색"
                aria-label="검색어"
                className="min-h-11 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button type="button" onClick={close} className="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100">ESC</button>
            </div>
            <div className="max-h-[58vh] overflow-y-auto p-2.5">
              {results.length > 0 ? results.map((item) => (
                <Link key={item.id} href={item.href} onClick={close} className="group flex items-start gap-3 rounded-xl px-3.5 py-3 transition hover:bg-slate-50 focus-visible:bg-slate-50">
                  <span className="mt-0.5 min-w-11 rounded-md bg-slate-100 px-2 py-1 text-center text-[10px] font-bold text-slate-500">{AREA_LABEL[item.area]}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-slate-900">{item.label}</strong>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{item.description}</span>
                  </span>
                  <span aria-hidden="true" className="mt-2 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]">→</span>
                </Link>
              )) : (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-semibold text-slate-700">검색 결과가 없습니다.</p>
                  <p className="mt-1 text-xs text-slate-400">다른 탭 이름이나 수련회 이름으로 검색해 보세요.</p>
                </div>
              )}
            </div>
            <footer className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] text-slate-500">접근 권한이 있는 사역과 화면만 표시됩니다.</footer>
          </section>
        </div>
      )}
    </>
  );
}
