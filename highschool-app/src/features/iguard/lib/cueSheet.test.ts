import { describe, expect, it } from "vitest";
import { parseCueSheetText, resolveOvernight, isValidTime, normalizeTime, normalizeEnd, toMinutes, staffDisplayText } from "./cueSheet";

// 루트 CLAUDE.md 실수 규칙 8(★ 실제 사고): 날짜 마커 검사를 시간 검사보다 먼저 하면
// "둘째날 오전 프로그램" 행이 통째로 사라진다. 문서는 scheduleUtils.test.ts의 D2가
// 이 순서를 지킨다고 적었지만 그 파일은 존재한 적이 없다(2026-08-09 신설).

function sheet(rows: string[][]): string {
  return rows.map(r => r.join("\t")).join("\n");
}

const HEADER = ["구분", "시간", "내용", "담당"];

describe("parseCueSheetText — 시간 검사가 날짜 마커보다 먼저다 (규칙 8)", () => {
  it("시간이 있는 행은 '둘째날'이 섞여 있어도 일정으로 남는다", () => {
    const raw = sheet([
      HEADER,
      ["기도회", "06:00~07:00", "둘째날 오전 프로그램 안내", "박세원"],
      ["아침", "07:00~08:00", "식사", "이선주"],
    ]);

    const parsed = parseCueSheetText(raw);

    // 순서를 뒤집으면 첫 행이 날짜 구분행으로 삼켜져 블록이 1개만 남는다
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks.map(b => b.label)).toEqual(["기도회", "아침"]);
    expect(parsed.blocks[0].day).toBe(1);
  });

  it("시간이 없는 '2일차' 행만 날짜 구분행으로 삼는다", () => {
    const raw = sheet([
      HEADER,
      ["", "09:00~10:00", "1일차 일정", ""],
      ["2일차", "", "", ""],
      ["", "09:00~10:00", "2일차 일정", ""],
    ]);

    const parsed = parseCueSheetText(raw);

    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0].day).toBe(1);
    expect(parsed.blocks[1].day).toBe(2);
  });

  it("헤더를 못 찾으면 블록 없이 안내만 돌려준다", () => {
    const parsed = parseCueSheetText("아무 표도 아닌 텍스트");
    expect(parsed.blocks).toEqual([]);
    expect(parsed.warnings.join(" ")).toContain("헤더를 찾지 못했습니다");
  });

  it("빈 입력은 안내만 돌려준다", () => {
    expect(parseCueSheetText("").blocks).toEqual([]);
  });
});

describe("parseCueSheetText — 자정 넘김", () => {
  it("저녁 일정 뒤 00시대로 되감기면 같은 일차의 24시+로 이어 붙인다", () => {
    const raw = sheet([
      HEADER,
      ["저녁집회", "20:00~22:00", "집회", ""],
      ["샐브", "00:30~01:30", "나눔", ""],
    ]);

    const parsed = parseCueSheetText(raw);

    expect(parsed.blocks).toHaveLength(2);
    const late = parsed.blocks[1];
    expect(late.day).toBe(1);          // 2일차로 넘기지 않는다
    expect(late.start).toBe("24:30");  // 24시+ 표기로 보존
    expect(late.end).toBe("25:30");
  });
});

describe("resolveOvernight", () => {
  it("끝이 시작보다 빠르면 끝에 24h를 더한다", () => {
    expect(resolveOvernight(1, "23:00", "01:00")).toMatchObject({ day: 1, start: "23:00", end: "25:00" });
  });

  it("preserveDay면 새벽 블록의 일차를 유지하고 시간만 +24h 한다", () => {
    expect(resolveOvernight(2, "00:30", "01:30", { preserveDay: true }))
      .toMatchObject({ day: 2, start: "24:30", end: "25:30" });
  });

  it("평범한 낮 시간대는 그대로 둔다", () => {
    expect(resolveOvernight(1, "12:00", "13:00")).toMatchObject({ day: 1, start: "12:00", end: "13:00", converted: false });
  });
});

describe("시간 파싱 보조", () => {
  it("빈 값은 통과시키고(선택 입력), 형식이 틀린 값만 거른다", () => {
    expect(isValidTime("09:30")).toBe(true);
    expect(isValidTime("24:30")).toBe(true);
    expect(isValidTime(undefined)).toBe(true); // 미입력은 검증 대상이 아니다
    expect(isValidTime("9:5")).toBe(false);
    expect(isValidTime("36:00")).toBe(false);
  });

  it("한 자리 시각은 두 자리로 맞추고, 열린 끝(~)은 그대로 둔다", () => {
    expect(normalizeTime("9:05")).toBe("09:05");
    expect(normalizeEnd("~")).toBe("~");
    expect(normalizeEnd(" 9:05 ")).toBe("09:05");
  });

  it("24시+ 표기도 분으로 환산한다", () => {
    expect(toMinutes("24:30")).toBe(24 * 60 + 30);
  });
});

describe("staffDisplayText", () => {
  it("스탭 구분용 sf 접미사만 화면 문구에서 숨긴다", () => {
    expect(staffDisplayText("서약서 배부: 김성훈sf, 박세원 SF")).toBe("서약서 배부: 김성훈, 박세원");
  });

  it("sf가 이름 접미사가 아니면 원문을 유지한다", () => {
    expect(staffDisplayText("SF 장비 확인")).toBe("SF 장비 확인");
  });
});
