"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { subscribeToAttendanceByYear, subscribeToClassesByYear } from "@/lib/db/students";
import { escapeHtml, printAsPDF } from "@/lib/exportUtils";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { saveSeatingPlan, subscribeToSeatingPlans } from "./db";
import {
  FIXED_SEATS,
  FRONT_ROWS,
  MAX_ROWS,
  MAX_SECTIONS,
  SEATS_PER_ROW,
  assignedKeys,
  attendanceAverage,
  blockStartRow,
  classKeysForService,
  defaultSections,
  isFrontBlock,
  isOverCapacity,
  planKey,
  previousSunday,
  recentSundays,
  remainingRows,
  resizeSections,
  rowsForAverage,
  seatLabel,
  sundayCellKey,
  sundayOf,
  totalRowsUsed,
  usedRows,
  type SeatSection,
  type SeatingPlans,
  type WorshipService,
} from "./worshipSeating";

const SERVICES: WorshipService[] = ["1", "2"];

// `.input`은 @layer 밖 규칙이라 width·font-size·padding이 Tailwind 유틸리티를 이긴다.
// 폭은 감싼 div로 주고, 한두 자리 숫자 칸의 글꼴·여백은 인라인 style로만 눌러야 한다
// (기본 좌우 패딩 14px씩이면 콘텐츠 폭이 14px밖에 안 남아 숫자가 잘린다).
const NUMBER_INPUT: React.CSSProperties = { fontSize: 12, paddingLeft: 6, paddingRight: 6, textAlign: "center" };
type AttendanceYear = Record<string, Record<string, Record<string, string>>>;
type ClassesYear = Record<string, { teacher?: string; students?: Record<string, unknown> }>;

export default function WorshipSeatingTab({ canEdit }: { canEdit: boolean }) {
  const [week, setWeek] = useState(() => sundayOf(new Date()));
  const [service, setService] = useState<WorshipService>("1");
  const [plans, setPlans] = useState<SeatingPlans>({});
  const [draft, setDraft] = useState<SeatSection[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassesYear>({});
  const [attendance, setAttendance] = useState<AttendanceYear>({});
  const { fail, ok, message: loadError } = useLoadErrors(`worship|${week}|${service}`);

  const year = Number(week.slice(0, 4));

  useEffect(() => {
    const unsubs = [
      subscribeToSeatingPlans((value) => { setPlans(value); ok("자리 배치"); }, fail("자리 배치")),
      subscribeToClassesByYear(year, (value) => { setClasses(value as ClassesYear); ok("반 명단"); }, fail("반 명단")),
      subscribeToAttendanceByYear(year, (value) => { setAttendance(value); ok("출석 기록"); }, fail("출석 기록")),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [fail, ok, year]);

  // 저장본이 곧 화면이다. 편집 중에만 draft가 화면을 대신한다(구독 echo가 입력을 덮지 않게).
  const saved = plans[planKey(week, service)];
  const sections = draft ?? saved ?? defaultSections();
  const dirty = draft !== null;

  // 지난 3주. 해가 바뀌는 주는 다른 연도 노드라 빼고 계산한다(근거 없으면 1줄).
  const cellKeys = useMemo(
    () => recentSundays(week).filter((day) => day.slice(0, 4) === week.slice(0, 4)).map(sundayCellKey),
    [week],
  );

  const averageFor = useCallback(
    (key: string) => (key.startsWith("fixed:") ? null : attendanceAverage(attendance[key], cellKeys)),
    [attendance, cellKeys],
  );

  const available = useMemo(() => {
    const used = assignedKeys(sections);
    const classOptions = classKeysForService(Object.keys(classes), service);
    return [...classOptions, ...FIXED_SEATS.map((seat) => seat.key)].filter((key) => !used.has(key));
  }, [classes, sections, service]);

  const edit = useCallback((next: SeatSection[]) => { setDraft(next); setNotice(null); }, []);

  const patchSection = (index: number, patch: (section: SeatSection) => SeatSection) =>
    edit(sections.map((section, i) => (i === index ? patch(section) : section)));

  const addBlock = (sectionIndex: number, key: string) => {
    if (!key) return;
    patchSection(sectionIndex, (section) => ({
      ...section,
      blocks: [...section.blocks, { key, rows: rowsForAverage(averageFor(key)) }],
    }));
  };

  const removeBlock = (sectionIndex: number, blockIndex: number) =>
    patchSection(sectionIndex, (section) => ({
      ...section,
      blocks: section.blocks.filter((_, i) => i !== blockIndex),
    }));

  const setBlockRows = (sectionIndex: number, blockIndex: number, rows: number) =>
    patchSection(sectionIndex, (section) => ({
      ...section,
      blocks: section.blocks.map((block, i) => (i === blockIndex ? { ...block, rows } : block)),
    }));

  const recalcAll = () => {
    edit(sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) =>
        block.key.startsWith("fixed:") ? block : { ...block, rows: rowsForAverage(averageFor(block.key)) }),
    })));
    setNotice("지난 3주 출석으로 줄 수를 다시 계산했습니다. 저장해야 반영됩니다.");
  };

  const loadPreviousWeek = () => {
    const previous = plans[planKey(previousSunday(week), service)];
    if (!previous) { setNotice("지난주 배치가 없습니다."); return; }
    setDraft(previous.map((section) => ({ ...section, blocks: section.blocks.map((block) => ({ ...block })) })));
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
    const maxRows = Math.max(...sections.map((s) => s.totalRows), 1);
    const grid: string[][] = Array.from({ length: maxRows }, () => sections.map(() => ""));
    sections.forEach((section, si) => {
      section.blocks.forEach((block, bi) => {
        const start = blockStartRow(section, bi);
        for (let r = 0; r < block.rows; r++) {
          const row = start - 1 + r;
          if (row < maxRows) grid[row][si] = r === 0 ? `${seatLabel(block.key)} (${block.rows})` : "〃";
        }
      });
    });
    const html = `<h1>${escapeHtml(`주일 자리 배치 ${week} ${service}부`)}</h1>
      <div class="subtitle">${escapeHtml(`분단 ${sections.length}개 · 사용 ${totalRowsUsed(sections)}줄 · 한 줄 의자 ${SEATS_PER_ROW}개`)}</div>
      <table><thead><tr><th>줄</th>${sections.map((s) => `<th>${escapeHtml(s.label)}</th>`).join("")}</tr></thead>
      <tbody>${grid.map((row, i) =>
        `<tr><td>${i + 1}줄</td>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    if (!printAsPDF(html, `주일자리배치_${week}_${service}부`, true)) {
      setActionError("인쇄 창이 차단됐습니다. 브라우저의 팝업 차단을 해제해주세요.");
    }
  };

  const anyOver = sections.some(isOverCapacity);

  return (
    <section className="card card-body">
      {loadError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 로드 오류: {loadError}</div>}
      {actionError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" aria-live="polite">{notice}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="worship-week" className="mb-1 block text-xs font-semibold text-slate-500">주일</label>
          <div className="w-40"><input id="worship-week" type="date" className="input" value={week}
            onChange={(event) => { if (!event.target.value) return; setWeek(sundayOf(new Date(`${event.target.value}T12:00:00Z`))); setDraft(null); }} /></div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold text-slate-500">예배</span>
          <div className="flex gap-1" role="group" aria-label="예배 부 선택">
            {SERVICES.map((value) => (
              <button key={value} type="button" onClick={() => { setService(value); setDraft(null); }}
                aria-pressed={service === value} className={service === value ? "btn-primary" : "btn-secondary"}>{value}부</button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="worship-sections" className="mb-1 block text-xs font-semibold text-slate-500">분단 수</label>
          <div className="w-24"><input id="worship-sections" type="number" min={1} max={MAX_SECTIONS} className="input" disabled={!canEdit} value={sections.length}
            onChange={(event) => edit(resizeSections(sections, Math.min(MAX_SECTIONS, Math.max(1, Number(event.target.value) || 1)), sections[0]?.totalRows ?? 6))} /></div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={recalcAll} disabled={!canEdit}>출석으로 줄 수 계산</button>
          <button type="button" className="btn-secondary" onClick={loadPreviousWeek} disabled={!canEdit}>지난주 불러오기</button>
          <button type="button" className="btn-secondary" onClick={print}>PDF 인쇄</button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={!canEdit || !dirty || saving}>
            {saving ? "저장 중…" : dirty ? "저장" : "저장됨"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        줄 수는 <strong>지난 3주 출석 평균 + 담임 1명</strong>을 한 줄 의자 {SEATS_PER_ROW}개로 나눠 올림합니다. 위 {FRONT_ROWS}줄이 앞자리입니다. 사용 {totalRowsUsed(sections)}줄
        {dirty && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">저장하지 않은 변경</span>}
      </p>
      {anyOver && <p className="mt-1 text-xs font-semibold text-red-600">줄 수가 분단 용량을 넘은 분단이 있습니다. 반을 옮기거나 분단 줄 수를 늘려주세요.</p>}

      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-max items-start gap-3">
          {sections.map((section, sectionIndex) => (
            <div key={section.id} className={`w-48 shrink-0 rounded-xl border bg-white p-2 ${isOverCapacity(section) ? "border-red-300" : "border-slate-200"}`}>
              <div className="mb-2 flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-slate-600">{section.label}</span>
                {/* .input은 @layer 밖이라 width:100%가 w-* 유틸리티를 이긴다. 폭은 감싼 div로 준다. */}
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  줄
                  <span className="block w-14">
                    <input type="number" min={1} max={MAX_ROWS} aria-label={`${section.label} 줄 수`}
                      className="input" style={NUMBER_INPUT} disabled={!canEdit} value={section.totalRows}
                      onChange={(event) => patchSection(sectionIndex, (s) => ({ ...s, totalRows: Math.min(MAX_ROWS, Math.max(1, Number(event.target.value) || 1)) }))} />
                  </span>
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {section.blocks.map((block, blockIndex) => {
                  const average = averageFor(block.key);
                  return (
                    <div key={`${block.key}:${blockIndex}`}
                      style={{ minHeight: block.rows * 30 }}
                      className={`flex flex-col justify-center rounded-lg border px-2 py-1 ${isFrontBlock(section, blockIndex) ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex items-center gap-1">
                        <span className="w-8 shrink-0 text-[10px] text-slate-400">{blockStartRow(section, blockIndex)}줄</span>
                        <strong className="min-w-0 flex-1 truncate text-xs text-slate-800">{seatLabel(block.key)}</strong>
                        <span className="block w-14 shrink-0">
                          <input type="number" min={1} max={MAX_ROWS} aria-label={`${seatLabel(block.key)} 줄 수`}
                            className="input" style={NUMBER_INPUT} disabled={!canEdit} value={block.rows}
                            onChange={(event) => setBlockRows(sectionIndex, blockIndex, Math.min(MAX_ROWS, Math.max(1, Number(event.target.value) || 1)))} />
                        </span>
                        <button type="button" aria-label={`${seatLabel(block.key)} 빼기`} disabled={!canEdit}
                          onClick={() => removeBlock(sectionIndex, blockIndex)}
                          className="shrink-0 rounded px-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">✕</button>
                      </div>
                      {average !== null && (
                        <span className="pl-9 text-[10px] text-slate-400">3주 평균 {average.toFixed(1)}명</span>
                      )}
                    </div>
                  );
                })}

                {section.blocks.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-[11px] text-slate-400">반을 추가하세요</p>
                )}
              </div>

              <select aria-label={`${section.label}에 반 추가`} className="input mt-2 text-xs" disabled={!canEdit} value=""
                onChange={(event) => { addBlock(sectionIndex, event.target.value); event.target.value = ""; }}>
                <option value="">반 추가…</option>
                {available.map((key) => <option key={key} value={key}>{seatLabel(key)}</option>)}
              </select>
              <p className={`mt-1 text-center text-[10px] ${remainingRows(section) < 0 ? "font-semibold text-red-600" : "text-slate-400"}`}>
                {usedRows(section)} / {section.totalRows}줄
              </p>
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
