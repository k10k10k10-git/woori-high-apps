import type { Milestone } from "@/lib/types";

// ────────────────────────────────────────────────────────────────
// 주일 예배팀 자리 배치 — 격자 모델과 저장 인코딩
//
// Rules를 바꾸지 않기 위해 사역 가이드와 같은 방식으로 prepMilestones에
// sourceSite 접두사를 붙인 조각으로 저장한다(일정 구독은 이 조각을 필터링한다).
// note는 500자 제한이 있으므로 **분단 하나 = 레코드 하나**로 쪼갠다.
//
// 격자: 분단(section)마다 줄이 있고, **한 반이 여러 줄을 차지한다**.
// 배치도의 `1-5(2)`는 인원이 아니라 그 반이 쓰는 **줄 수**다.
// 인접은 같은 분단의 위아래(앞뒤)와 인접 분단의 같은 줄(좌우)이다.
// ────────────────────────────────────────────────────────────────

export const WORSHIP_SOURCE_PREFIX = "sunday-worship";
const SEATING_SOURCE = `${WORSHIP_SOURCE_PREFIX}-seating`;

/** 의자는 한 줄에 6개. 줄 수 계산의 분모다. */
export const SEATS_PER_ROW = 6;
/** 위에서 두 줄이 앞자리 — 회전 공평성의 기준. */
export const FRONT_ROWS = 2;

/** 예배 부 — 출석부 classKey(`part-grade-class`)의 앞자리와 같은 값을 쓴다. */
export type WorshipService = "1" | "2";

/** 반 명단에서 계산되지 않아 직접 입력하는 고정석. */
export const FIXED_SEATS = [
  { key: "fixed:new-friend", label: "새친구" },
  { key: "fixed:parent", label: "학부모석" },
  { key: "fixed:enroll", label: "학세입 대상자" },
] as const;

export type SeatBlock = { key: string; rows: number };
export type SeatSection = { id: string; label: string; totalRows: number; blocks: SeatBlock[] };

export const MAX_SECTIONS = 10;
export const MAX_ROWS = 20;

export function isWorshipMilestone(value: Pick<Milestone, "sourceSite">): boolean {
  return value.sourceSite?.startsWith(WORSHIP_SOURCE_PREFIX) === true;
}

// ── 주일 날짜 ────────────────────────────────────────────────

/** 주어진 날짜가 속한 주의 주일(그 주 일요일) — KST 기준 YYYY-MM-DD. */
export function sundayOf(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate() - kst.getUTCDay();
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

export function previousSunday(week: string): string {
  const [y, m, d] = week.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
}

/**
 * 출석부의 셀 키 — `{월 인덱스}-{그 달의 몇 번째 주일}` 둘 다 0부터.
 * 학생 출석부 앱의 evKey와 같은 규칙이라 바꾸면 출석을 못 읽는다.
 */
export function sundayCellKey(week: string): string {
  const [y, m, d] = week.split("-").map(Number);
  let index = 0;
  for (let day = 1; day < d; day++) {
    if (new Date(Date.UTC(y, m - 1, day)).getUTCDay() === 0) index++;
  }
  return `${m - 1}-${index}`;
}

/** 기준 주일 **직전**의 주일들 — "지난 3주"는 이번 주를 뺀 3개다. */
export function recentSundays(week: string, count = 3): string[] {
  const out: string[] = [];
  let cursor = week;
  for (let i = 0; i < count; i++) {
    cursor = previousSunday(cursor);
    out.push(cursor);
  }
  return out;
}

// ── 출석 기반 줄 수 계산 ──────────────────────────────────────

export type ClassAttendance = Record<string, Record<string, string>>;

/** 그 주일에 온 사람 수 — 출석(O)과 지각(T)을 센다. 결석·미입력은 뺀다. */
function presentOn(students: ClassAttendance, cellKey: string): number {
  let count = 0;
  for (const marks of Object.values(students)) {
    const mark = marks?.[cellKey];
    if (mark === "O" || mark === "T") count++;
  }
  return count;
}

/** 지난 주일들의 출석 평균. 기록이 하나도 없으면 null(계산 근거 없음). */
export function attendanceAverage(students: ClassAttendance | undefined, cellKeys: string[]): number | null {
  if (!students || cellKeys.length === 0) return null;
  const counts = cellKeys.map((key) => presentOn(students, key));
  if (counts.every((value) => value === 0)) return null;
  return counts.reduce((sum, value) => sum + value, 0) / counts.length;
}

/**
 * 필요한 줄 수 = 올림((출석 평균 + 반 선생님 1명) / 한 줄 의자 수).
 * 전체 명단으로 계산하면 허수가 많아 지난 3주 출석 평균을 쓴다.
 */
export function rowsForAverage(average: number | null, seatsPerRow = SEATS_PER_ROW): number {
  if (average === null) return 1;
  return Math.max(1, Math.ceil((average + 1) / seatsPerRow));
}

// ── 격자 ─────────────────────────────────────────────────────

export function usedRows(section: SeatSection): number {
  return section.blocks.reduce((sum, block) => sum + block.rows, 0);
}

export function remainingRows(section: SeatSection): number {
  return section.totalRows - usedRows(section);
}

export function isOverCapacity(section: SeatSection): boolean {
  return remainingRows(section) < 0;
}

/** 블록이 시작하는 줄 번호(1부터). 앞자리 판정과 화면의 줄 표시에 쓴다. */
export function blockStartRow(section: SeatSection, blockIndex: number): number {
  return section.blocks.slice(0, blockIndex).reduce((sum, block) => sum + block.rows, 1);
}

/** 위에서 두 줄과 겹치면 앞자리다. */
export function isFrontBlock(section: SeatSection, blockIndex: number): boolean {
  return blockStartRow(section, blockIndex) <= FRONT_ROWS;
}

export function emptySection(index: number, totalRows: number): SeatSection {
  return { id: `s${index + 1}`, label: `${index + 1}분단`, totalRows, blocks: [] };
}

export function defaultSections(sectionCount = 6, totalRows = 6): SeatSection[] {
  return Array.from({ length: sectionCount }, (_, index) => emptySection(index, totalRows));
}

export function resizeSections(sections: SeatSection[], count: number, defaultRows: number): SeatSection[] {
  if (count <= sections.length) return sections.slice(0, count);
  const added = Array.from({ length: count - sections.length }, (_, i) =>
    emptySection(sections.length + i, sections[0]?.totalRows ?? defaultRows),
  );
  return [...sections, ...added];
}

export function assignedKeys(sections: SeatSection[]): Set<string> {
  const used = new Set<string>();
  for (const section of sections) {
    for (const block of section.blocks) used.add(block.key);
  }
  return used;
}

export function totalRowsUsed(sections: SeatSection[]): number {
  return sections.reduce((sum, section) => sum + usedRows(section), 0);
}

// ── 저장 인코딩 ───────────────────────────────────────────────

export function seatingRecordId(week: string, service: WorshipService, sectionIndex: number): string {
  return `ws_${week.replace(/-/g, "")}_${service}_${String(sectionIndex + 1).padStart(2, "0")}`;
}

type EncodedSection = { w: string; v: WorshipService; i: number; l: string; t: number; b: [string, number][] };

function encode(section: SeatSection, week: string, service: WorshipService, index: number): string {
  const payload: EncodedSection = {
    w: week,
    v: service,
    i: index,
    l: section.label.slice(0, 20),
    t: section.totalRows,
    b: section.blocks.map((block) => [block.key, block.rows]),
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > 500) throw new Error("한 분단에 넣은 반이 너무 많습니다. 반을 다른 분단으로 옮겨 주세요.");
  return serialized;
}

export function seatingRecords(
  week: string,
  service: WorshipService,
  sections: SeatSection[],
  previousSectionCount = MAX_SECTIONS,
  now = Date.now(),
): { id: string; value: unknown }[] {
  const records = sections.map((section, index) => ({
    id: seatingRecordId(week, service, index),
    value: {
      title: `주일 자리 배치 ${week} ${service}부 ${section.label}`.slice(0, 120),
      targetDate: "2099-12-31",
      done: false,
      note: encode(section, week, service, index),
      sourceSite: SEATING_SOURCE,
      createdAt: now,
      updatedAt: now,
    },
  }));
  for (let index = sections.length; index < previousSectionCount; index++) {
    records.push({ id: seatingRecordId(week, service, index), value: null as never });
  }
  return records;
}

function decode(note: unknown): EncodedSection | null {
  if (typeof note !== "string") return null;
  try {
    const parsed = JSON.parse(note) as EncodedSection;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.w !== "string" || !Array.isArray(parsed.b)) return null;
    if (parsed.v !== "1" && parsed.v !== "2") return null;
    return parsed;
  } catch {
    return null;
  }
}

export type SeatingPlans = Record<string, SeatSection[]>;

export function planKey(week: string, service: WorshipService): string {
  return `${week}|${service}`;
}

export function parseSeatingPlans(records: Milestone[]): SeatingPlans {
  const buckets: Record<string, { index: number; section: SeatSection }[]> = {};

  for (const record of records) {
    if (record.sourceSite !== SEATING_SOURCE) continue;
    const parsed = decode(record.note);
    if (!parsed) continue;
    const index = Number(parsed.i) || 0;
    const blocks: SeatBlock[] = parsed.b
      .filter((block): block is [string, number] => Array.isArray(block) && typeof block[0] === "string")
      .map((block) => ({ key: block[0], rows: Math.max(1, Number(block[1]) || 1) }));
    (buckets[planKey(parsed.w, parsed.v)] ??= []).push({
      index,
      section: {
        id: `s${index + 1}`,
        label: parsed.l || `${index + 1}분단`,
        totalRows: Math.max(1, Number(parsed.t) || 1),
        blocks,
      },
    });
  }

  const plans: SeatingPlans = {};
  for (const [key, list] of Object.entries(buckets)) {
    plans[key] = list.sort((a, b) => a.index - b.index).map((item) => item.section);
  }
  return plans;
}

// ── 라벨 ─────────────────────────────────────────────────────

export function seatLabel(key: string): string {
  const fixed = FIXED_SEATS.find((seat) => seat.key === key);
  if (fixed) return fixed.label;
  const parts = key.split("-");
  if (parts.length !== 3) return key;
  return `${parts[1]}-${parts[2]}`;
}

export function classKeysForService(classKeys: string[], service: WorshipService): string[] {
  return classKeys
    .filter((key) => key.split("-")[0] === service)
    .sort((a, b) => {
      const [, ag, ac] = a.split("-").map(Number);
      const [, bg, bc] = b.split("-").map(Number);
      return ag - bg || ac - bc;
    });
}
