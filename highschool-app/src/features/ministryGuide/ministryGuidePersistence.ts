import type { Milestone } from "@/lib/types";
import type { MinistryGuideSection, MonthlyMinistry } from "./ministryGuideContent";

export const MINISTRY_GUIDE_SOURCE_PREFIX = "ministry-guide";
const MONTH_SOURCE = `${MINISTRY_GUIDE_SOURCE_PREFIX}-month`;
const SECTION_META_SOURCE = `${MINISTRY_GUIDE_SOURCE_PREFIX}-section-meta`;
const SECTION_PRINCIPLES_SOURCE = `${MINISTRY_GUIDE_SOURCE_PREFIX}-principles`;
const SECTION_CHECKLIST_SOURCE = `${MINISTRY_GUIDE_SOURCE_PREFIX}-checklist`;

export type MinistryGuideOverrides = {
  monthly: Record<number, MonthlyMinistry>;
  sections: Record<string, MinistryGuideSection>;
};

export function isMinistryGuideMilestone(value: Pick<Milestone, "sourceSite">): boolean {
  return value.sourceSite?.startsWith(MINISTRY_GUIDE_SOURCE_PREFIX) === true;
}

function parseNote<T>(note: unknown): T | null {
  if (typeof note !== "string") return null;
  try {
    const parsed = JSON.parse(note) as T;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function parseMinistryGuideOverrides(records: Milestone[]): MinistryGuideOverrides {
  const monthly: MinistryGuideOverrides["monthly"] = {};
  const sectionParts: Record<string, Partial<MinistryGuideSection>> = {};

  for (const record of records) {
    if (record.sourceSite === MONTH_SOURCE) {
      const value = parseNote<MonthlyMinistry>(record.note);
      if (value && Number.isInteger(value.month) && typeof value.curriculum === "string" && Array.isArray(value.focus)) {
        monthly[value.month] = { month: value.month, curriculum: value.curriculum, focus: value.focus.filter((item): item is string => typeof item === "string") };
      }
      continue;
    }

    if (record.sourceSite === SECTION_META_SOURCE) {
      const value = parseNote<Pick<MinistryGuideSection, "id" | "category" | "title" | "summary" | "sourceNote" | "caution">>(record.note);
      if (value?.id) sectionParts[value.id] = { ...sectionParts[value.id], ...value };
    } else if (record.sourceSite === SECTION_PRINCIPLES_SOURCE) {
      const value = parseNote<{ id: string; principles: string[] }>(record.note);
      if (value?.id && Array.isArray(value.principles)) sectionParts[value.id] = { ...sectionParts[value.id], principles: value.principles.filter((item): item is string => typeof item === "string") };
    } else if (record.sourceSite === SECTION_CHECKLIST_SOURCE) {
      const value = parseNote<{ id: string; checklist: string[] }>(record.note);
      if (value?.id && Array.isArray(value.checklist)) sectionParts[value.id] = { ...sectionParts[value.id], checklist: value.checklist.filter((item): item is string => typeof item === "string") };
    }
  }

  return { monthly, sections: sectionParts as Record<string, MinistryGuideSection> };
}

export function applyMinistryGuideOverrides(
  monthlyDefaults: MonthlyMinistry[],
  sectionDefaults: MinistryGuideSection[],
  overrides: MinistryGuideOverrides,
) {
  return {
    monthly: monthlyDefaults.map((item) => overrides.monthly[item.month] ?? item),
    sections: sectionDefaults.map((item) => ({ ...item, ...(overrides.sections[item.id] ?? {}) })),
  };
}

function note(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized.length > 500) throw new Error("한 항목의 내용은 500자 이내로 줄여 주세요.");
  return serialized;
}

function baseRecord(sourceSite: string, title: string, noteValue: string, now: number) {
  return { title: title.slice(0, 120), targetDate: "2099-12-31", done: false, note: noteValue, sourceSite, createdAt: now, updatedAt: now };
}

export function monthlyMinistryRecord(item: MonthlyMinistry, now = Date.now()) {
  return {
    id: `mg_month_${String(item.month).padStart(2, "0")}`,
    value: baseRecord(MONTH_SOURCE, `월별 사역 흐름 ${item.month}월`, note(item), now),
  };
}

export function ministryGuideSectionRecords(section: MinistryGuideSection, now = Date.now()) {
  const safeId = section.id.replace(/[^a-z0-9-]/gi, "-");
  return [
    {
      id: `mg_section_${safeId}_meta`,
      value: baseRecord(SECTION_META_SOURCE, `부서 운영 가이드 ${section.title}`, note({
        id: section.id,
        category: section.category,
        title: section.title,
        summary: section.summary,
        sourceNote: section.sourceNote,
        ...(section.caution ? { caution: section.caution } : {}),
      }), now),
    },
    {
      id: `mg_section_${safeId}_principles`,
      value: baseRecord(SECTION_PRINCIPLES_SOURCE, `${section.title} 운영 원칙`, note({ id: section.id, principles: section.principles }), now),
    },
    {
      id: `mg_section_${safeId}_checklist`,
      value: baseRecord(SECTION_CHECKLIST_SOURCE, `${section.title} 체크리스트`, note({ id: section.id, checklist: section.checklist }), now),
    },
  ];
}
