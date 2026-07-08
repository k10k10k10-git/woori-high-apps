import { describe, it, expect } from "vitest";
import {
  parseCueSheetText, parseSheetUrl, normalizeTime, scheduleTimeError, venueForBlock,
  isValidTime, toMinutes, timeRangeLabel, parseNames, scheduleSortValue,
} from "@/app/retreat/[id]/scheduleUtils";

const HEADER = "구분\t시간\t내용\t담당\t기타";

describe("parseCueSheetText — 사양 D", () => {
  it("D1: 구분/시간/내용 헤더가 없으면 blocks 없음 + 안내 경고", () => {
    const r = parseCueSheetText("아무거나\t내용");
    expect(r.blocks).toHaveLength(0);
    expect(r.warnings.some(w => w.includes("헤더를 찾지 못했습니다"))).toBe(true);
  });

  it("D2: 시간 있는 행의 '둘째날' 단어는 날짜 구분으로 삼키지 않는다 (패턴 10 회귀)", () => {
    const raw = [
      HEADER,
      "기도회\t09:00~10:00\t둘째날 오전 프로그램\t\t",
      "둘째날\t\t\t\t",
      "집회\t10:00~11:00\t본집회\t\t",
    ].join("\n");
    const r = parseCueSheetText(raw);
    expect(r.blocks).toHaveLength(2);
    expect(r.blocks[0]).toMatchObject({ day: 1, start: "09:00", end: "10:00", label: "기도회" });
    expect(r.blocks[1]).toMatchObject({ day: 2, start: "10:00", label: "집회" });
    expect(r.dayCounts).toEqual({ 1: 1, 2: 1 });
  });

  it("D3: 시간 없는 후속 행은 직전 블록에 병합돼 사라지지 않는다", () => {
    const raw = [
      HEADER,
      "집회\t19:00~21:00\t저녁집회\t\t",
      "\t\t찬양 인도 순서 안내\t\t",
    ].join("\n");
    const r = parseCueSheetText(raw);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].detail).toContain("저녁집회");
    expect(r.blocks[0].detail).toContain("찬양 인도 순서 안내");
  });

  it("D4: 버스 선탑 줄에서 이름만 통과, '스탭 0명' 같은 조각은 제외 + 경고", () => {
    const raw = [
      HEADER,
      "이동\t10:00~11:00\t버스 이동\t\t1호차: 김철수sf, 스탭 0명",
    ].join("\n");
    const r = parseCueSheetText(raw);
    expect(r.busDrafts).toHaveLength(1);
    expect(r.busDrafts[0].busNo).toBe(1);
    expect(r.busDrafts[0].staff).toContain("김철수");
    expect(r.busDrafts[0].staff).not.toContain("스탭 0명");
    expect(r.warnings.some(w => w.includes("이름 아닌 조각 제외"))).toBe(true);
  });

  it("D5: 빈 입력이면 전용 경고", () => {
    const r = parseCueSheetText("");
    expect(r.warnings).toEqual(["붙여넣은 내용이 비어있습니다."]);
    expect(r.blocks).toHaveLength(0);
  });

  it("반복 헤더 행은 건너뛴다", () => {
    const raw = [
      HEADER,
      "집회\t09:00~10:00\t오전집회\t\t",
      HEADER,
      "식사\t12:00~13:00\t점심\t\t",
    ].join("\n");
    const r = parseCueSheetText(raw);
    expect(r.blocks).toHaveLength(2);
    expect(r.blocks[1].meal).toBe(true); // looksLikeMeal("식사"/"점심")
  });

  it("importStats가 detail/owner/notice 채워진 블록 수를 센다", () => {
    const raw = [
      HEADER,
      "집회\t09:00~10:00\t내용있음\t담당자: 김철수\t유의사항",
      "이동\t10:00~11:00\t\t\t",
    ].join("\n");
    const r = parseCueSheetText(raw);
    expect(r.importStats).toEqual({ detailCount: 1, ownerCount: 1, noticeCount: 1 });
  });
});

describe("parseSheetUrl", () => {
  it("edit URL에서 sheetId·gid 추출, gid 없으면 0", () => {
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/abc_DEF-123/edit#gid=456"))
      .toEqual({ sheetId: "abc_DEF-123", gid: "456" });
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/abc/edit"))
      .toEqual({ sheetId: "abc", gid: "0" });
    expect(parseSheetUrl("https://example.com/x")).toBeNull();
  });
});

describe("시간 유틸 (현재 동작 고정)", () => {
  it("normalizeTime: 9:30 → 09:30, 이상값은 원문 유지", () => {
    expect(normalizeTime("9:30")).toBe("09:30");
    expect(normalizeTime("abc")).toBe("abc");
  });

  it("isValidTime: 24시+ 표기(~35:59)까지 허용", () => {
    expect(isValidTime("24:30")).toBe(true);
    expect(isValidTime("36:00")).toBe(false);
    expect(isValidTime(undefined)).toBe(true); // 빈 값 허용
  });

  it("scheduleTimeError: 형식·순서 검증", () => {
    expect(scheduleTimeError("9시", "10:00")).toContain("HH:MM");
    expect(scheduleTimeError("10:00", "09:00")).toContain("늦어야");
    expect(scheduleTimeError("09:00", "~")).toBeNull();
    expect(scheduleTimeError("09:00", "10:00")).toBeNull();
  });

  it("toMinutes / timeRangeLabel / parseNames / scheduleSortValue", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(timeRangeLabel("09:00", "~")).toBe("09:00~");
    expect(parseNames("김철수, 이영희/박민수")).toEqual(["김철수", "이영희", "박민수"]);
    expect(scheduleSortValue(undefined)).toBe("99__99:99");
  });
});

describe("venueForBlock — 1일차 교회/수련회장 판정", () => {
  it("등록 블록은 교회, 출발 이후는 수련회장, 1일차 아니면 무조건 수련회장", () => {
    const blocks = [
      { day: 1 as const, start: "08:00", end: "09:00", label: "등록" },
      { day: 1 as const, start: "10:00", end: "11:00", label: "버스 출발" },
      { day: 1 as const, start: "12:00", end: "13:00", label: "도착" },
    ];
    expect(venueForBlock(blocks[0], blocks)).toBe("교회");
    expect(venueForBlock(blocks[2], blocks)).toBe("수련회장");
    expect(venueForBlock({ day: 2, start: "09:00", end: "10:00", label: "집회" }, blocks)).toBe("수련회장");
  });
});
