import { describe, expect, it } from "vitest";
import { parseBusStaff, parseBusStaffNames, mergeBusStaffNames } from "./busStaff";

// 루트 CLAUDE.md 실수 규칙 9(★ 실제 사고): sf 꼬리표·직함 처리를 화면마다 새로 짜서
// 같은 사람이 두 명으로 보였다. 규칙 11의 "버스 파싱 오염"도 이 경로다 —
// 큐싯 안내문(“5분 간격으로 순차 이동”)이 스탭 이름으로 잡혀 인원이 부풀었다.
// 규칙은 parseBusStaff만 쓰라고 하지만 테스트가 없었다(2026-08-09 신설).

describe("parseBusStaff — 이름 추출", () => {
  it("쉼표·슬래시·줄바꿈으로 나눈다", () => {
    expect(parseBusStaffNames("박세원, 이선주/주예원\n오유은")).toEqual(["박세원", "이선주", "주예원", "오유은"]);
  });

  it("선탑·동승 라벨을 떼어낸다", () => {
    expect(parseBusStaffNames("선탑: 박세원, 동승: 이선주")).toEqual(["박세원", "이선주"]);
    expect(parseBusStaffNames("선탑/동승 박세원")).toEqual(["박세원"]);
  });

  it("sf 꼬리표를 떼어 같은 사람을 하나로 만든다", () => {
    expect(parseBusStaffNames("박세원sf, 박세원")).toEqual(["박세원"]);
  });

  it("직함을 떼고 이름만 남긴다", () => {
    expect(parseBusStaffNames("박세원목사님, 이선주전도사님")).toEqual(["박세원", "이선주"]);
  });

  it("직함을 떼면 한 글자만 남는 성씨 표기는 이름으로 인정하지 않는다", () => {
    // "김목사님" → "김" (1글자) — 사람 이름으로 확정할 수 없으므로 rejected로 보낸다
    const result = parseBusStaff("김목사님, 이전도사님");
    expect(result.names).toEqual([]);
    expect(result.rejected).toEqual(["김", "이"]);
  });

  it("괄호·대괄호 보조 설명을 제거한다", () => {
    expect(parseBusStaffNames("박세원(1호차), 이선주[인솔]")).toEqual(["박세원", "이선주"]);
  });

  it("중복은 공백·대소문자 무시하고 한 번만 남는다", () => {
    expect(parseBusStaffNames("박 세원, 박세원, 박세원sf")).toEqual(["박 세원"]);
  });
});

describe("parseBusStaff — 오염 차단 (규칙 11)", () => {
  it("안내 문장은 이름으로 잡지 않는다", () => {
    const result = parseBusStaff("박세원, 5분 간격으로 순차적으로 이동, 카톡방에 인원보고");
    expect(result.names).toEqual(["박세원"]);
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.suspicious).toBe(true);
  });

  it("'스탭 3명' 같은 인원 표기는 이름이 아니다", () => {
    expect(parseBusStaffNames("스탭 3명, 박세원")).toEqual(["박세원"]);
  });

  it("숫자·영문만 있는 토큰은 버린다", () => {
    expect(parseBusStaffNames("1, 2호차, abc, 박세원")).toEqual(["박세원"]);
  });

  it("한 글자이거나 지나치게 긴 토큰은 버린다", () => {
    expect(parseBusStaffNames("김")).toEqual([]);
    expect(parseBusStaffNames("가나다라마바사아자차카타파하가")).toEqual([]);
  });

  it("깨끗한 입력은 suspicious가 아니다", () => {
    const result = parseBusStaff("박세원, 이선주");
    expect(result.rejected).toEqual([]);
    expect(result.suspicious).toBe(false);
  });

  it("이름이 9명을 넘으면 의심으로 표시한다", () => {
    const many = ["가가", "나나", "다다", "라라", "마마", "바바", "사사", "아아", "자자"].join(",");
    expect(parseBusStaff(many).suspicious).toBe(true);
  });

  it("빈 입력은 빈 결과", () => {
    expect(parseBusStaff(undefined).names).toEqual([]);
    expect(parseBusStaff("").names).toEqual([]);
  });
});

describe("mergeBusStaffNames", () => {
  it("여러 출처를 합치되 중복은 한 번만 남긴다", () => {
    expect(mergeBusStaffNames(["박세원", "이선주"], ["이선주", "주예원"], undefined))
      .toEqual(["박세원", "이선주", "주예원"]);
  });

  it("공백 차이는 같은 사람으로 본다", () => {
    expect(mergeBusStaffNames(["박 세원"], ["박세원"])).toEqual(["박 세원"]);
  });
});
