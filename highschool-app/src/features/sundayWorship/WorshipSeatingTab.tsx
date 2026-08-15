"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { subscribeClassesByYear } from "@/features/semester/db";
import type { ClassInfo } from "@/features/semester/types";
import { escapeHtml, printAsPDF } from "@/lib/exportUtils";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { saveSeatingPlan, subscribeToSeatingPlans } from "./db";
import {
  FIXED_SEATS,
  MAX_ROWS,
  MAX_SECTIONS,
  assignedKeys,
  classKeysForService,
  defaultSections,
  planKey,
  previousSunday,
  resizeSection,
  resizeSections,
  seatLabel,
  sundayOf,
  totalSeated,
  type SeatSection,
  type SeatingPlans,
  type WorshipService,
} from "./worshipSeating";

const SERVICES: WorshipService[] = ["1", "2"];

export default function WorshipSeatingTab({ canEdit }: { canEdit: boolean }) {
  const [week, setWeek] = useState(() => sundayOf(new Date()));
  const [service, setService] = useState<WorshipService>("1");
  const [plans, setPlans] = useState<SeatingPlans>({});
  const [draft, setDraft] = useState<SeatSection[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const { fail, ok, message: loadError } = useLoadErrors(`worship|${week}|${service}`);

  const year = String(new Date().getFullYear());

  useEffect(() => {
    const unsubs = [
      subscribeToSeatingPlans((value) => { setPlans(value); ok("자리 배치"); }, fail("자리 배치")),
      subscribeClassesByYear(year, (value) => { setClasses(value); ok("반 명단"); }, fail("반 명단")),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [fail, ok, year]);

  // 저장본이 곧 화면이다. 편집 중에만 draft가 화면을 대신한다(구독 echo가 입력을 덮지 않게).
  const saved = plans[planKey(week, service)];
  const sections = draft ?? saved ?? defaultSections();
  const dirty = draft !== null;

  const rosterCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const info of classes) map[info.classKey] = Object.keys(info.students ?? {}).length;
    return map;
  }, [classes]);

  const available = useMemo(() => {
    const used = assignedKeys(sections);
    const classOptions = classKeysForService(classes.map((info) => info.classKey), service);
    return [...classOptions, ...FIXED_SEATS.map((seat) => seat.key)].filter((key) => !used.has(key));
  }, [classes, sections, service]);

  const edit = useCallback((next: SeatSection[]) => {
    setDraft(next);
    setNotice(null);
  }, []);

  const setCell = (sectionIndex: number, rowIndex: number, key: string) => {
    const next = sections.map((section, si) =>
      si !== sectionIndex ? section : {
        ...section,
        cells: section.cells.map((cell, ri) =>
          ri !== rowIndex ? cell : key ? { key, count: cell?.count ?? 0 } : null),
      });
    edit(next);
  };

  const setCount = (sectionIndex: number, rowIndex: number, count: number) => {
    const next = sections.map((section, si) =>
      si !== sectionIndex ? section : {
        ...section,
        cells: section.cells.map((cell, ri) => (ri !== rowIndex || !cell ? cell : { ...cell, count })),
      });
    edit(next);
  };

  const loadPreviousWeek = () => {
    const previous = plans[planKey(previousSunday(week), service)];
    if (!previous) {
      setNotice("지난주 배치가 없습니다.");
      return;
    }
    setDraft(previous.map((section) => ({ ...section, cells: [...section.cells] })));
    setNotice("지난주 배치를 불러왔습니다. 저장해야 반영됩니다.");
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setActionError(null);
    try {
      await saveSeatingPlan(week, service, draft);
      setDraft(null);
      setNotice("저장했습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const print = () => {
    const html = `<h1>${escapeHtml(`주일 자리 배치 ${week} ${service}부`)}</h1>
      <div class="subtitle">${escapeHtml(`분단 ${sections.length}개 · 배정 인원 ${totalSeated(sections)}`)}</div>
      <table><thead><tr><th>줄</th>${sections.map((section) => `<th>${escapeHtml(section.label)}</th>`).join("")}</tr></thead>
      <tbody>${Array.from({ length: Math.max(...sections.map((section) => section.cells.length), 0) }, (_, row) =>
        `<tr><td>${row + 1}줄</td>${sections.map((section) => {
          const cell = section.cells[row];
          return `<td>${cell ? `${escapeHtml(seatLabel(cell.key))} (${escapeHtml(cell.count)})` : ""}</td>`;
        }).join("")}</tr>`).join("")}</tbody></table>`;
    if (!printAsPDF(html, `주일자리배치_${week}_${service}부`, true)) {
      setActionError("인쇄 창이 차단됐습니다. 브라우저의 팝업 차단을 해제해주세요.");
    }
  };

  const maxRows = Math.max(...sections.map((section) => section.cells.length), 1);

  return (
    <section className="card card-body">
      {loadError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 로드 오류: {loadError}</div>}
      {actionError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" aria-live="polite">{notice}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="worship-week" className="mb-1 block text-xs font-semibold text-slate-500">주일</label>
          <div className="w-40"><input id="worship-week" type="date" className="input" value={week} onChange={(event) => { setWeek(sundayOf(new Date(`${event.target.value}T12:00:00Z`))); setDraft(null); }} /></div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold text-slate-500">예배</span>
          <div className="flex gap-1" role="group" aria-label="예배 부 선택">
            {SERVICES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setService(value); setDraft(null); }}
                aria-pressed={service === value}
                className={service === value ? "btn-primary" : "btn-secondary"}
              >{value}부</button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="worship-sections" className="mb-1 block text-xs font-semibold text-slate-500">분단 수</label>
          <div className="w-24"><input id="worship-sections" type="number" min={1} max={MAX_SECTIONS} className="input" disabled={!canEdit} value={sections.length}
            onChange={(event) => edit(resizeSections(sections, Math.min(MAX_SECTIONS, Math.max(1, Number(event.target.value) || 1)), maxRows))} /></div>
        </div>
        <div>
          <label htmlFor="worship-rows" className="mb-1 block text-xs font-semibold text-slate-500">분단별 줄 수</label>
          <div className="w-24"><input id="worship-rows" type="number" min={1} max={MAX_ROWS} className="input" disabled={!canEdit} value={maxRows}
            onChange={(event) => { const rows = Math.min(MAX_ROWS, Math.max(1, Number(event.target.value) || 1)); edit(sections.map((section) => resizeSection(section, rows))); }} /></div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={loadPreviousWeek} disabled={!canEdit}>지난주 불러오기</button>
          <button type="button" className="btn-secondary" onClick={print}>PDF 인쇄</button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={!canEdit || !dirty || saving}>
            {saving ? "저장 중…" : dirty ? "저장" : "저장됨"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        위에서 <strong>{Math.min(2, maxRows)}줄</strong>까지가 앞자리입니다. 배정 인원 {totalSeated(sections)}명
        {dirty && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">저장하지 않은 변경</span>}
      </p>

      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-max gap-3">
          {sections.map((section, sectionIndex) => (
            <div key={section.id} className="w-44 shrink-0 rounded-xl border border-slate-200 bg-white p-2">
              <p className="mb-2 text-center text-xs font-bold text-slate-600">{section.label}</p>
              <div className="flex flex-col gap-1.5">
                {section.cells.map((cell, rowIndex) => (
                  <div key={rowIndex} className={`rounded-lg border p-1.5 ${rowIndex < 2 ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex items-center gap-1">
                      <span className="w-7 shrink-0 text-[10px] text-slate-400">{rowIndex + 1}줄</span>
                      <select
                        aria-label={`${section.label} ${rowIndex + 1}줄 반`}
                        className="input min-w-0 flex-1 text-xs"
                        disabled={!canEdit}
                        value={cell?.key ?? ""}
                        onChange={(event) => setCell(sectionIndex, rowIndex, event.target.value)}
                      >
                        <option value="">비움</option>
                        {cell && <option value={cell.key}>{seatLabel(cell.key)}</option>}
                        {available.map((key) => <option key={key} value={key}>{seatLabel(key)}</option>)}
                      </select>
                    </div>
                    {/* 자리가 비어도 같은 높이를 차지한다 — 분단끼리 줄이 어긋나면 좌우 인접을 눈으로 못 읽는다. */}
                    <div className="mt-1 flex h-7 items-center gap-1 pl-7">
                      {cell && (
                        <>
                          <input
                            type="number"
                            min={0}
                            aria-label={`${seatLabel(cell.key)} 인원`}
                            className="input w-14 text-xs"
                            disabled={!canEdit}
                            value={cell.count}
                            onChange={(event) => setCount(sectionIndex, rowIndex, Math.max(0, Number(event.target.value) || 0))}
                          />
                          {rosterCount[cell.key] !== undefined && (
                            <span className="text-[10px] text-slate-400">명단 {rosterCount[cell.key]}명</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {available.length > 0 && (
        <p className="mt-4 text-xs text-slate-500">아직 자리가 없는 반: {available.map((key) => seatLabel(key)).join(", ")}</p>
      )}
    </section>
  );
}
