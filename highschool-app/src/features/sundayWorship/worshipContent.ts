import type { Milestone } from "@/lib/types";
import { WORSHIP_SOURCE_PREFIX, type WorshipService } from "./worshipSeating";

// ────────────────────────────────────────────────────────────────
// 예배 담당표와 예배 자료 — 자리 배치와 같은 저장 방식을 쓴다.
// prepMilestones에 sourceSite 접두사를 붙인 조각으로 넣고 note는 500자 제한이라 쪼갠다.
//
// 담당표는 학생 명단을 읽지 않고 **직접 입력한 이름만** 저장한다.
// 명단을 끌어오면 이 화면 하나 때문에 개인정보 공개 범위를 새로 정해야 한다.
// ────────────────────────────────────────────────────────────────

const DUTY_SOURCE = `${WORSHIP_SOURCE_PREFIX}-duty`;
const DOC_SOURCE = `${WORSHIP_SOURCE_PREFIX}-doc`;

const NOTE_LIMIT = 500;
/** 문서 본문을 나눠 담는 조각 크기. 인코딩 여유를 빼고 잡는다. */
const DOC_CHUNK = 320;

export const MAX_DUTY_ROWS = 12;
export const MAX_DUTY_NAMES = 12;

// ── 예배 담당표 ───────────────────────────────────────────────

/** 한 줄 = 역할 하나(헌금위원·안내 등)와 그 담당자들. 줄 이름은 직접 붙인다. */
export type DutyRow = { label: string; names: string[] };
export type DutyPlans = Record<string, DutyRow[]>;

export function dutyKey(week: string, service: WorshipService): string {
  return `${week}|${service}`;
}

export function dutyRecordId(week: string, service: WorshipService, rowIndex: number): string {
  return `wd_${week.replace(/-/g, "")}_${service}_${String(rowIndex + 1).padStart(2, "0")}`;
}

type EncodedDuty = { w: string; v: WorshipService; i: number; l: string; n: string[] };

export function dutyRecords(
  week: string,
  service: WorshipService,
  rows: DutyRow[],
  previousRowCount = MAX_DUTY_ROWS,
  now = Date.now(),
): { id: string; value: unknown }[] {
  const records = rows.map((row, index) => {
    const payload: EncodedDuty = {
      w: week, v: service, i: index,
      l: row.label.slice(0, 30),
      n: row.names.map((name) => name.trim().slice(0, 20)).filter(Boolean),
    };
    const note = JSON.stringify(payload);
    if (note.length > NOTE_LIMIT) throw new Error("한 줄에 담당자가 너무 많습니다. 줄을 나눠 주세요.");
    return {
      id: dutyRecordId(week, service, index),
      value: {
        title: `주일 예배 담당 ${week} ${service}부 ${payload.l}`.slice(0, 120),
        targetDate: "2099-12-31", done: false, note,
        sourceSite: DUTY_SOURCE, createdAt: now, updatedAt: now,
      },
    };
  });
  for (let index = rows.length; index < previousRowCount; index++) {
    records.push({ id: dutyRecordId(week, service, index), value: null as never });
  }
  return records;
}

export function parseDutyPlans(records: Milestone[]): DutyPlans {
  const buckets: Record<string, { index: number; row: DutyRow }[]> = {};
  for (const record of records) {
    if (record.sourceSite !== DUTY_SOURCE || typeof record.note !== "string") continue;
    let parsed: EncodedDuty;
    try { parsed = JSON.parse(record.note) as EncodedDuty; } catch { continue; }
    if (!parsed || typeof parsed.w !== "string" || !Array.isArray(parsed.n)) continue;
    if (parsed.v !== "1" && parsed.v !== "2") continue;
    const index = Number(parsed.i) || 0;
    (buckets[dutyKey(parsed.w, parsed.v)] ??= []).push({
      index,
      row: { label: parsed.l || "담당", names: parsed.n.filter((name): name is string => typeof name === "string") },
    });
  }
  const plans: DutyPlans = {};
  for (const [key, list] of Object.entries(buckets)) {
    plans[key] = list.sort((a, b) => a.index - b.index).map((item) => item.row);
  }
  return plans;
}

// ── 예배 자료 ─────────────────────────────────────────────────

export type WorshipDoc = { id: string; title: string; body: string };

/**
 * 사진으로 돌던 헌금 기도문 양식. 이미지가 아니라 글로 두면 복사·인쇄가 되고
 * 문구도 그 자리에서 고칠 수 있다. 저장된 수정본이 있으면 그것이 이긴다.
 */
export const DEFAULT_WORSHIP_DOCS: WorshipDoc[] = [
  {
    id: "offering-prayer",
    title: "헌금 기도문 양식",
    body: [
      "1. 감사 기도로 시작하기",
      "이번 한 주 동안 하나님께 감사했던 부분을 기도로 고백해주세요.",
      "예시) 이번 한 주 하나님의 사랑을 경험하게 해주셔서 감사드립니다.",
      "예시) 오늘 하루도 하나님께 예배드릴 수 있게 해주셔서 감사드립니다.",
      "",
      "2. 예배 기도",
      "오늘 드리는 예배를 위해 기도해주세요.",
      "",
      "3. 교역자 기도",
      "말씀을 전하시는 목사님 또는 전도사님을 위해 기도해주세요.",
      "",
      "4. 마무리 기도",
      "예수님의 이름으로 기도드렸습니다. 아멘",
    ].join("\n"),
  },
];

export function docRecordId(docId: string, chunkIndex: number): string {
  return `wdoc_${docId.replace(/[^a-z0-9-]/gi, "-")}_${String(chunkIndex + 1).padStart(2, "0")}`;
}

type EncodedDoc = { d: string; t: string; i: number; n: number; c: string };

export function splitBody(body: string, size = DOC_CHUNK): string[] {
  if (body.length === 0) return [""];
  const chunks: string[] = [];
  for (let at = 0; at < body.length; at += size) chunks.push(body.slice(at, at + size));
  return chunks;
}

export const MAX_DOC_CHUNKS = 12;

export function docRecords(doc: WorshipDoc, previousChunkCount = MAX_DOC_CHUNKS, now = Date.now()) {
  const chunks = splitBody(doc.body);
  if (chunks.length > MAX_DOC_CHUNKS) throw new Error("문서가 너무 깁니다. 내용을 줄이거나 나눠 주세요.");
  const records = chunks.map((chunk, index) => {
    const payload: EncodedDoc = { d: doc.id, t: doc.title.slice(0, 60), i: index, n: chunks.length, c: chunk };
    return {
      id: docRecordId(doc.id, index),
      value: {
        title: `예배 자료 ${payload.t}`.slice(0, 120),
        targetDate: "2099-12-31", done: false, note: JSON.stringify(payload),
        sourceSite: DOC_SOURCE, createdAt: now, updatedAt: now,
      },
    };
  });
  for (let index = chunks.length; index < previousChunkCount; index++) {
    records.push({ id: docRecordId(doc.id, index), value: null as never });
  }
  return records;
}

/** 저장된 수정본을 기본 문서 위에 덮는다. 조각이 하나라도 비면 그 문서는 기본값을 쓴다. */
export function parseWorshipDocs(records: Milestone[]): Record<string, WorshipDoc> {
  const parts: Record<string, { title: string; total: number; chunks: Record<number, string> }> = {};
  for (const record of records) {
    if (record.sourceSite !== DOC_SOURCE || typeof record.note !== "string") continue;
    let parsed: EncodedDoc;
    try { parsed = JSON.parse(record.note) as EncodedDoc; } catch { continue; }
    if (!parsed || typeof parsed.d !== "string" || typeof parsed.c !== "string") continue;
    const entry = (parts[parsed.d] ??= { title: parsed.t || parsed.d, total: Number(parsed.n) || 1, chunks: {} });
    entry.title = parsed.t || entry.title;
    entry.total = Number(parsed.n) || entry.total;
    entry.chunks[Number(parsed.i) || 0] = parsed.c;
  }

  const docs: Record<string, WorshipDoc> = {};
  for (const [id, entry] of Object.entries(parts)) {
    const ordered: string[] = [];
    for (let index = 0; index < entry.total; index++) {
      const chunk = entry.chunks[index];
      if (chunk === undefined) { ordered.length = 0; break; }
      ordered.push(chunk);
    }
    if (ordered.length === 0 && entry.total > 0) continue;
    docs[id] = { id, title: entry.title, body: ordered.join("") };
  }
  return docs;
}

export function applyDocOverrides(defaults: WorshipDoc[], overrides: Record<string, WorshipDoc>): WorshipDoc[] {
  const merged = defaults.map((doc) => overrides[doc.id] ?? doc);
  const extra = Object.values(overrides).filter((doc) => !defaults.some((base) => base.id === doc.id));
  return [...merged, ...extra];
}
