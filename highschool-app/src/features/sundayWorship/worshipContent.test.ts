import { describe, expect, it } from "vitest";
import type { Milestone } from "@/lib/types";
import {
  DEFAULT_WORSHIP_DOCS,
  MAX_DOC_CHUNKS,
  applyDocOverrides,
  docRecordId,
  docRecords,
  dutyKey,
  dutyRecordId,
  dutyRecords,
  parseDutyPlans,
  parseWorshipDocs,
  splitBody,
  type DutyRow,
} from "./worshipContent";
import { isWorshipMilestone } from "./worshipSeating";

const milestone = (over: Partial<Milestone>): Milestone => ({
  id: "m", title: "t", targetDate: "2099-12-31", done: false, ...over,
});

describe("예배 담당표", () => {
  const rows: DutyRow[] = [
    { label: "헌금위원", names: ["김하늘", "이바다", "박구름"] },
    { label: "안내", names: ["최나무"] },
  ];

  it("한 줄이 레코드 하나가 되고 id가 결정적이다", () => {
    expect(dutyRecords("2026-08-16", "1", rows, 2).map((r) => r.id))
      .toEqual(["wd_20260816_1_01", "wd_20260816_1_02"]);
    expect(dutyRecordId("2026-08-16", "2", 0)).toBe("wd_20260816_2_01");
  });

  it("줄이 줄면 남은 레코드를 지우도록 null을 낸다", () => {
    const records = dutyRecords("2026-08-16", "1", rows, 4);
    expect(records).toHaveLength(4);
    expect(records[2].value).toBeNull();
    expect(records[3].value).toBeNull();
  });

  it("저장한 담당표를 순서까지 그대로 되읽는다", () => {
    const records = dutyRecords("2026-08-16", "1", rows, 2);
    const plans = parseDutyPlans(records.map((r) => milestone({ id: r.id, ...(r.value as object) })));
    expect(plans[dutyKey("2026-08-16", "1")]).toEqual(rows);
  });

  it("빈 이름은 저장하지 않는다", () => {
    const records = dutyRecords("2026-08-16", "1", [{ label: "헌금위원", names: ["김하늘", "  ", ""] }], 1);
    const plans = parseDutyPlans(records.map((r) => milestone({ id: r.id, ...(r.value as object) })));
    expect(plans[dutyKey("2026-08-16", "1")][0].names).toEqual(["김하늘"]);
  });

  it("주차와 부가 다르면 서로 섞이지 않는다", () => {
    const first = dutyRecords("2026-08-16", "1", rows, 2);
    const second = dutyRecords("2026-08-16", "2", [rows[0]], 1);
    const plans = parseDutyPlans([...first, ...second].map((r) => milestone({ id: r.id, ...(r.value as object) })));
    expect(plans[dutyKey("2026-08-16", "1")]).toHaveLength(2);
    expect(plans[dutyKey("2026-08-16", "2")]).toHaveLength(1);
  });

  it("한 줄이 저장 한도를 넘으면 저장 전에 막는다", () => {
    const huge: DutyRow = { label: "헌금위원", names: Array.from({ length: 40 }, () => "홍길동열두자이름입니다") };
    expect(() => dutyRecords("2026-08-16", "1", [huge], 1)).toThrow(/줄을 나눠/);
  });
});

describe("예배 자료", () => {
  it("헌금 기도문 양식을 기본값으로 제공한다", () => {
    const doc = DEFAULT_WORSHIP_DOCS.find((item) => item.id === "offering-prayer");
    expect(doc?.title).toBe("헌금 기도문 양식");
    expect(doc?.body).toContain("감사 기도로 시작하기");
    expect(doc?.body).toContain("아멘");
  });

  it("긴 본문을 조각으로 나누고 합치면 원본이 된다", () => {
    const body = "가".repeat(800);
    const chunks = splitBody(body);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(body);
  });

  it("빈 본문도 조각 하나로 다룬다", () => {
    expect(splitBody("")).toEqual([""]);
  });

  it("저장한 문서를 조각까지 합쳐 그대로 되읽는다", () => {
    const doc = { id: "offering-prayer", title: "헌금 기도문 양식", body: "나".repeat(700) };
    const records = docRecords(doc, 3);
    const parsed = parseWorshipDocs(records.map((r) => milestone({ id: r.id, ...(r.value as object) })));
    expect(parsed["offering-prayer"]).toEqual(doc);
  });

  it("조각이 줄면 남은 레코드를 지우도록 null을 낸다", () => {
    const records = docRecords({ id: "d", title: "짧은 글", body: "짧다" }, 4);
    expect(records).toHaveLength(4);
    expect(records[1].value).toBeNull();
    expect(docRecordId("d", 0)).toBe("wdoc_d_01");
  });

  it("조각이 하나라도 비면 반쪽 문서를 만들지 않는다", () => {
    const records = docRecords({ id: "d", title: "긴 글", body: "다".repeat(700) }, 3);
    const withHole = records.filter((r) => r.value !== null).slice(0, 1);
    expect(parseWorshipDocs(withHole.map((r) => milestone({ id: r.id, ...(r.value as object) })))).toEqual({});
  });

  it("문서가 한도를 넘으면 저장 전에 막는다", () => {
    expect(() => docRecords({ id: "d", title: "t", body: "라".repeat(320 * (MAX_DOC_CHUNKS + 1)) }))
      .toThrow(/너무 깁니다/);
  });

  it("저장된 수정본이 기본 문서를 덮고 새 문서는 뒤에 붙는다", () => {
    const merged = applyDocOverrides(DEFAULT_WORSHIP_DOCS, {
      "offering-prayer": { id: "offering-prayer", title: "헌금 기도문", body: "고친 본문" },
      "notice": { id: "notice", title: "광고 순서", body: "새 문서" },
    });
    expect(merged[0]).toEqual({ id: "offering-prayer", title: "헌금 기도문", body: "고친 본문" });
    expect(merged.at(-1)?.id).toBe("notice");
  });

  it("수정본이 없으면 기본 문서를 그대로 쓴다", () => {
    expect(applyDocOverrides(DEFAULT_WORSHIP_DOCS, {})).toEqual(DEFAULT_WORSHIP_DOCS);
  });
});

describe("일정 목록과의 분리", () => {
  it("담당표·자료 조각도 예배팀 조각으로 걸러낸다", () => {
    const duty = dutyRecords("2026-08-16", "1", [{ label: "헌금위원", names: ["김하늘"] }], 1)[0];
    const doc = docRecords({ id: "d", title: "t", body: "b" }, 1)[0];
    expect(isWorshipMilestone(duty.value as Milestone)).toBe(true);
    expect(isWorshipMilestone(doc.value as Milestone)).toBe(true);
  });

  it("다른 화면의 조각은 담당표·자료로 읽지 않는다", () => {
    const others = [
      milestone({ id: "a", sourceSite: "move-guide", note: "메모" }),
      milestone({ id: "b", sourceSite: "ministry-guide-month", note: '{"month":3}' }),
      milestone({ id: "c", sourceSite: "sunday-worship-seating", note: '{"w":"2026-08-16","v":"1","i":0,"l":"1분단","t":6,"b":[]}' }),
    ];
    expect(parseDutyPlans(others)).toEqual({});
    expect(parseWorshipDocs(others)).toEqual({});
  });
});
