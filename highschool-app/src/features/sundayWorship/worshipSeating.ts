import type { Milestone } from "@/lib/types";

// ────────────────────────────────────────────────────────────────
// 주일 예배팀 자리 배치 — 격자 모델과 저장 인코딩
//
// Rules를 바꾸지 않기 위해 사역 가이드와 같은 방식으로 prepMilestones에
// sourceSite 접두사를 붙인 조각으로 저장한다(일정 구독은 이 조각을 필터링한다).
// note는 500자 제한이 있으므로 **분단 하나 = 레코드 하나**로 쪼갠다.
//
// 격자: 분단(section) 여러 개 × 분단별 줄(row) 여러 개, 한 줄에 반 하나.
// 인접은 같은 분단의 위아래(앞뒤)와 인접 분단의 같은 줄(좌우)이다.
// ────────────────────────────────────────────────────────────────

export const WORSHIP_SOURCE_PREFIX = "sunday-worship";
const SEATING_SOURCE = `${WORSHIP_SOURCE_PREFIX}-seating`;

/** 예배 부 — 출석부 classKey(`part-grade-class`)의 앞자리와 같은 값을 쓴다. */
export type WorshipService = "1" | "2";

/** 반 명단에서 계산되지 않아 직접 입력하는 고정석. */
export const FIXED_SEATS = [
  { key: "fixed:new-friend", label: "새친구" },
  { key: "fixed:parent", label: "학부모석" },
  { key: "fixed:enroll", label: "학세입 대상자" },
] as const;

export type SeatCell = { key: string; count: number } | null;
export type SeatSection = { id: string; label: string; cells: SeatCell[] };

export const MAX_SECTIONS = 10;
export const MAX_ROWS = 20;

export function isWorshipMilestone(value: Pick<Milestone, "sourceSite">): boolean {
  return value.sourceSite?.startsWith(WORSHIP_SOURCE_PREFIX) === true;
}

/** 주어진 날짜가 속한 주의 주일(그 주 일요일) — KST 기준 YYYY-MM-DD. */
export function sundayOf(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate() - kst.getUTCDay();
  const sunday = new Date(Date.UTC(y, m, d));
  return sunday.toISOString().slice(0, 10);
}

/** 이전 주일 — "지난주 불러오기"가 찾아갈 주차. */
export function previousSunday(week: string): string {
  const [y, m, d] = week.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 7));
  return prev.toISOString().slice(0, 10);
}

/** `1-3-5` → `3학년 5반`. 고정석 키는 그 이름을 그대로 돌려준다. */
export function seatLabel(key: string): string {
  const fixed = FIXED_SEATS.find((seat) => seat.key === key);
  if (fixed) return fixed.label;
  const parts = key.split("-");
  if (parts.length !== 3) return key;
  return `${parts[1]}학년 ${parts[2]}반`;
}

/** 그 부에 속한 반만 남긴다 — classKey 앞자리가 예배 부와 같다. */
export function classKeysForService(classKeys: string[], service: WorshipService): string[] {
  return classKeys
    .filter((key) => key.split("-")[0] === service)
    .sort((a, b) => {
      const [, ag, ac] = a.split("-").map(Number);
      const [, bg, bc] = b.split("-").map(Number);
      return ag - bg || ac - bc;
    });
}

export function emptySection(index: number, rows: number): SeatSection {
  return {
    id: `s${index + 1}`,
    label: `${index + 1}분단`,
    cells: Array.from({ length: rows }, () => null),
  };
}

export function defaultSections(sectionCount = 6, rows = 5): SeatSection[] {
  return Array.from({ length: sectionCount }, (_, index) => emptySection(index, rows));
}

/** 줄 수를 바꾼다. 줄여도 남는 배정은 버리지 않고 잘린 뒤쪽만 사라진다. */
export function resizeSection(section: SeatSection, rows: number): SeatSection {
  const next = Array.from({ length: rows }, (_, i) => section.cells[i] ?? null);
  return { ...section, cells: next };
}

/** 분단 개수를 바꾼다. 늘리면 빈 분단이 붙고, 줄이면 뒤에서 잘린다. */
export function resizeSections(sections: SeatSection[], count: number, defaultRows: number): SeatSection[] {
  if (count <= sections.length) return sections.slice(0, count);
  const added = Array.from({ length: count - sections.length }, (_, i) =>
    emptySection(sections.length + i, sections[0]?.cells.length ?? defaultRows),
  );
  return [...sections, ...added];
}

/** 이미 어딘가에 배정된 반 키 — 같은 반을 두 자리에 놓지 않도록 화면이 쓴다. */
export function assignedKeys(sections: SeatSection[]): Set<string> {
  const used = new Set<string>();
  for (const section of sections) {
    for (const cell of section.cells) {
      if (cell) used.add(cell.key);
    }
  }
  return used;
}

export function totalSeated(sections: SeatSection[]): number {
  return sections.reduce(
    (sum, section) => sum + section.cells.reduce((inner, cell) => inner + (cell?.count ?? 0), 0),
    0,
  );
}

// ── 저장 인코딩 ───────────────────────────────────────────────

export function seatingRecordId(week: string, service: WorshipService, sectionIndex: number): string {
  return `ws_${week.replace(/-/g, "")}_${service}_${String(sectionIndex + 1).padStart(2, "0")}`;
}

type EncodedSection = { w: string; v: WorshipService; i: number; l: string; c: ([string, number] | 0)[] };

function encode(section: SeatSection, week: string, service: WorshipService, index: number): string {
  const payload: EncodedSection = {
    w: week,
    v: service,
    i: index,
    l: section.label.slice(0, 20),
    c: section.cells.map((cell) => (cell ? [cell.key, cell.count] : 0)),
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > 500) throw new Error("한 분단의 줄 수를 줄여 주세요. 저장 한도를 넘었습니다.");
  return serialized;
}

/** 한 부의 배치 전체를 레코드 목록으로. 분단이 줄었으면 남은 레코드를 지우도록 null을 함께 낸다. */
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
    if (typeof parsed.w !== "string" || !Array.isArray(parsed.c)) return null;
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

/** prepMilestones 전체에서 자리 배치 조각만 골라 주차·부별로 모은다. */
export function parseSeatingPlans(records: Milestone[]): SeatingPlans {
  const buckets: Record<string, { index: number; section: SeatSection }[]> = {};

  for (const record of records) {
    if (record.sourceSite !== SEATING_SOURCE) continue;
    const parsed = decode(record.note);
    if (!parsed) continue;
    const key = planKey(parsed.w, parsed.v);
    const cells: SeatCell[] = parsed.c.map((cell) =>
      Array.isArray(cell) && typeof cell[0] === "string" ? { key: cell[0], count: Number(cell[1]) || 0 } : null,
    );
    (buckets[key] ??= []).push({
      index: Number(parsed.i) || 0,
      section: { id: `s${(Number(parsed.i) || 0) + 1}`, label: parsed.l || `${(Number(parsed.i) || 0) + 1}분단`, cells },
    });
  }

  const plans: SeatingPlans = {};
  for (const [key, list] of Object.entries(buckets)) {
    plans[key] = list.sort((a, b) => a.index - b.index).map((item) => item.section);
  }
  return plans;
}
