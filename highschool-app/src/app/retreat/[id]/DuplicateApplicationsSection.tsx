"use client";

import type { SyncDuplicateGroup } from "@/lib/types";

interface Props {
  duplicates: SyncDuplicateGroup[];
  expanded: boolean;
  isDesktop: boolean;
  onToggle: () => void;
  onChoose: (duplicateIndex: number, entryIndex: number) => void;
}

/** 구버전 Record 형태까지 읽되, 민감한 시트 원문은 데스크톱 상세에서만 사용한다. */
function rawPairsOf(raw: unknown): { h: string; v: string }[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return (raw as { h?: string; v?: string }[])
      .filter(pair => pair?.h)
      .map(pair => ({ h: pair.h!, v: pair.v ?? "" }));
  }
  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, string>)
      .filter(([header]) => header)
      .map(([header, value]) => ({ h: header, v: String(value ?? "") }));
  }
  return [];
}

function MobileDuplicateGroup({
  duplicate,
  duplicateIndex,
  onChoose,
}: {
  duplicate: SyncDuplicateGroup;
  duplicateIndex: number;
  onChoose: Props["onChoose"];
}) {
  const resolvedIndex = duplicate.resolvedIndex ?? 0;

  return (
    <section className="border-t border-purple-100 px-3 py-3" aria-labelledby={`duplicate-${duplicateIndex}-title`}>
      <div className="mb-2">
        <strong id={`duplicate-${duplicateIndex}-title`} className="text-sm text-purple-900">{duplicate.name}</strong>
        <span className="ml-2 text-xs text-purple-600">{duplicate.bu} · {duplicate.entries.length}회 신청</span>
      </div>
      <div className="grid gap-2">
        {duplicate.entries.map((entry, entryIndex) => {
          const selected = entryIndex === resolvedIndex;
          return (
            <label
              key={entryIndex}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 ${selected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}
            >
              <input
                type="radio"
                name={`dup-mobile-${duplicateIndex}`}
                checked={selected}
                disabled={!duplicate.participantKey}
                onChange={() => onChoose(duplicateIndex, entryIndex)}
                aria-label={`${duplicate.name}의 ${entryIndex + 1}번째 신청을 유지`}
                className="h-5 w-5 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <strong className="text-sm text-slate-800">{entryIndex + 1}번째 신청</strong>
                  <span className={`text-xs font-semibold ${selected ? "text-emerald-700" : "text-slate-500"}`}>{selected ? "유지" : "제거됨"}</span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  {entry.registeredAt || "신청일시 없음"} · {entry.bu} · {entry.grade > 0 ? `${entry.grade}학년 ${entry.class > 0 ? `${entry.class}반` : ""}` : "학년 미입력"}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">연락처와 원본 응답은 PC 상세 화면에서만 확인할 수 있습니다.</p>
    </section>
  );
}

function DesktopDuplicateGroup({
  duplicate,
  duplicateIndex,
  onChoose,
}: {
  duplicate: SyncDuplicateGroup;
  duplicateIndex: number;
  onChoose: Props["onChoose"];
}) {
  const resolvedIndex = duplicate.resolvedIndex ?? 0;
  const rawHeaders: string[] = [];
  duplicate.entries.forEach(entry => {
    rawPairsOf(entry.raw).forEach(({ h }) => {
      if (!rawHeaders.includes(h)) rawHeaders.push(h);
    });
  });

  return (
    <section className="border-t border-purple-100">
      <div className="bg-purple-50/50 px-4 py-2">
        <span className="text-sm font-bold text-purple-800">{duplicate.name}</span>
        <span className="ml-2 text-xs text-purple-500">{duplicate.bu} · {duplicate.entries.length}회 신청</span>
      </div>
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-purple-50/30">
              <th className="px-4 py-1.5 text-center font-medium text-purple-600">유지</th>
              <th className="px-4 py-1.5 text-left font-medium text-purple-600">#</th>
              <th className="whitespace-nowrap px-4 py-1.5 text-left font-medium text-purple-600">신청일시</th>
              <th className="px-4 py-1.5 text-left font-medium text-purple-600">성별</th>
              <th className="px-4 py-1.5 text-left font-medium text-purple-600">부</th>
              <th className="whitespace-nowrap px-4 py-1.5 text-left font-medium text-purple-600">학년/반</th>
              <th className="whitespace-nowrap px-4 py-1.5 text-left font-medium text-purple-600">상태</th>
              {rawHeaders.map(header => <th key={header} className="max-w-[220px] truncate px-4 py-1.5 text-left font-medium text-purple-600" title={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-50">
            {duplicate.entries.map((entry, entryIndex) => {
              const pairs = new Map<string, string>();
              rawPairsOf(entry.raw).forEach(({ h, v }) => {
                if (!pairs.has(h) || (!pairs.get(h) && v)) pairs.set(h, v);
              });
              const selected = entryIndex === resolvedIndex;
              return (
                <tr key={entryIndex} className={selected ? "bg-green-50/40" : "bg-white"}>
                  <td className="px-4 py-2 text-center"><input type="radio" name={`dup-${duplicateIndex}`} checked={selected} disabled={!duplicate.participantKey} onChange={() => onChoose(duplicateIndex, entryIndex)} aria-label={`${duplicate.name}의 ${entryIndex + 1}번째 신청을 유지`} /></td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-400">{entryIndex + 1}{selected && <span className="ml-1 font-semibold text-green-600">유지</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-700">{entry.registeredAt || "없음"}</td>
                  <td className="px-4 py-2 text-slate-500">{entry.gender || "없음"}</td>
                  <td className="whitespace-nowrap px-4 py-2"><span className={`tag ${entry.bu?.includes("1") ? "tag-green" : "tag-purple"}`}>{entry.bu}</span></td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">{entry.grade > 0 ? `${entry.grade}학년 ${entry.class > 0 ? `${entry.class}반` : ""}` : "없음"}</td>
                  <td className="whitespace-nowrap px-4 py-2">{!selected && <span className="font-medium text-red-400">제거됨</span>}</td>
                  {rawHeaders.map(header => {
                    const value = pairs.get(header) || "";
                    return <td key={header} className="max-w-[220px] truncate whitespace-nowrap px-4 py-2 text-slate-500" title={value}>{value || "없음"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DuplicateApplicationsSection({ duplicates, expanded, isDesktop, onToggle, onChoose }: Props) {
  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-purple-200">
      <button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 bg-purple-50 px-3 py-3 text-left sm:px-4" onClick={onToggle} aria-expanded={expanded}>
        <span className="min-w-0 text-sm font-semibold text-purple-700">
          중복 신청 {duplicates.length}명
          {duplicates.length === 0
            ? <span className="ml-2 text-xs font-normal text-green-600">중복 없음</span>
            : <span className="ml-2 text-xs font-normal text-purple-600">확인이 필요한 신청만 펼쳐 봅니다</span>}
        </span>
        <span className="shrink-0 text-xs font-semibold text-purple-600">{expanded ? "접기" : "펼치기"}</span>
      </button>
      {expanded && duplicates.map((duplicate, duplicateIndex) => isDesktop
        ? <DesktopDuplicateGroup key={`${duplicate.name}-${duplicateIndex}`} duplicate={duplicate} duplicateIndex={duplicateIndex} onChoose={onChoose} />
        : <MobileDuplicateGroup key={`${duplicate.name}-${duplicateIndex}`} duplicate={duplicate} duplicateIndex={duplicateIndex} onChoose={onChoose} />)}
    </section>
  );
}
