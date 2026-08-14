"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { buildSearchIndex, searchIndex, type SearchEntry, type SearchEntryKind, type SearchIndexInput } from "@/features/iguard/lib/personIndex";

const KIND_LABEL: Record<SearchEntryKind, string> = {
  student: "학생", teacher: "교사", staff: "스탭", group: "조", room: "숙소", bus: "버스",
};

const KIND_STYLE: Record<SearchEntryKind, string> = {
  student: "bg-blue-100 text-blue-700",
  teacher: "bg-emerald-100 text-emerald-700",
  staff: "bg-fuchsia-100 text-fuchsia-700",
  group: "bg-amber-100 text-amber-700",
  room: "bg-violet-100 text-violet-700",
  bus: "bg-sky-100 text-sky-700",
};

/** 취소·불참처럼 사람을 명단에서 빼는 배지는 눈에 띄게, 나머지는 차분하게. */
function badgeStyle(badge: string): string {
  if (badge === "취소" || badge === "불참") return "bg-red-100 text-red-700";
  if (badge === "자차") return "bg-orange-100 text-orange-700";
  return "bg-slate-100 text-slate-600";
}

export default function SearchOverlay({
  data,
  onClose,
  onJump,
}: {
  data: SearchIndexInput;
  onClose: () => void;
  onJump: (view: string) => void;
}) {
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const index = useMemo(() => buildSearchIndex(data), [data]);
  const results = useMemo(() => searchIndex(index, query), [index, query]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[90] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="전역 검색"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <MagnifyingGlass aria-hidden="true" className="shrink-0 text-slate-400" size={20} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="이름 · 초성(ㄱㅎㅁ) · 조 · 호실 · 호차"
          aria-label="이름, 초성, 조 번호, 호실, 호차로 검색"
          className="min-w-0 flex-1 rounded-lg bg-slate-100 px-3 py-2.5 text-base text-slate-800 outline-none placeholder:text-slate-400 focus:bg-slate-50 focus:ring-2 focus:ring-fuchsia-300"
        />
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
        >
          닫기
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
        <p className="sr-only" role="status" aria-live="polite">
          {query.trim() ? `검색 결과 ${results.length}건` : ""}
        </p>

        {!query.trim() && (
          <div className="mx-auto max-w-sm py-10 text-center text-sm leading-relaxed text-slate-400">
            <MagnifyingGlass aria-hidden="true" className="mx-auto mb-3" size={36} weight="regular" />
            <p className="mb-2 font-medium text-slate-500">이름만 알아도 바로 찾을 수 있어요</p>
            <p>학생·교사·스탭을 이름이나 초성으로,<br />조·호실·호차는 번호로 검색하세요.</p>
            <p className="mt-3 text-xs text-slate-400">예: <span className="font-mono">김현민</span> · <span className="font-mono">ㄱㅎㅁ</span> · <span className="font-mono">17조</span> · <span className="font-mono">305</span> · <span className="font-mono">2호차</span></p>
          </div>
        )}

        {query.trim() && results.length === 0 && (
          <div className="py-10 text-center text-sm text-slate-400">
            <p className="mb-1 font-medium text-slate-500">검색 결과가 없어요</p>
            <p>이름 일부나 초성으로 다시 검색해보세요.</p>
          </div>
        )}

        <ul className="mx-auto max-w-2xl space-y-2">
          {results.map(entry => (
            <li key={entry.id}>
              <ResultCard entry={entry} onJump={onJump} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ResultCard({ entry, onJump }: { entry: SearchEntry; onJump: (view: string) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLE[entry.kind]}`}>
          {KIND_LABEL[entry.kind]}
        </span>
        <span className="text-base font-bold text-slate-800">{entry.title}</span>
        {entry.badges.map(badge => (
          <span key={badge} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeStyle(badge)}`}>
            {badge}
          </span>
        ))}
      </div>

      <p className="mt-0.5 text-xs text-slate-500">{entry.subtitle}</p>

      {entry.facts.length > 0 && (
        <dl className="mt-2 space-y-1">
          {entry.facts.map(fact => (
            <div key={fact.label} className="flex gap-2 text-sm">
              <dt className="w-16 shrink-0 text-xs leading-5 text-slate-400">{fact.label}</dt>
              <dd className="min-w-0 flex-1 break-words text-slate-700">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {entry.jumpView && (
        <button
          type="button"
          onClick={() => onJump(entry.jumpView!)}
          className="mt-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
        >
          해당 화면으로 이동 →
        </button>
      )}
    </div>
  );
}
