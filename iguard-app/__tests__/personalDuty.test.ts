import { describe, expect, it } from "vitest";
import {
  dutyLabelsForStaff,
  dutyLinesForStaff,
  personalAssignmentLabel,
  withoutStructuredDutyLabels,
} from "@/lib/personalDuty";

describe("개인 담당 표시", () => {
  it("여러 담당자 명단에서 선택한 스탭의 실제 역할만 보여준다", () => {
    expect(dutyLabelsForStaff(
      ["[수련회장] 위 숙소 · 위 숙소: 이채희sf, 전예성sf", "숙소 총장: 김승혁sf"],
      "이채희",
    )).toEqual(["위 숙소"]);
  });

  it("개인 카드에서 다른 스탭 명단을 제거한다", () => {
    expect(personalAssignmentLabel(
      "[수련회장] 숙소 총장: 이채희sf, 전예성sf, 박세원sf",
      ["이채희", "전예성", "박세원"],
    )).toBe("[수련회장] 숙소 총장");
  });

  it("큐싯 담당에 이름이 있으면 스탭 명단에서도 같은 역할을 찾는다", () => {
    const block = {
      id: "registration",
      day: 1,
      start: "14:00",
      end: "15:00",
      label: "등록",
      owner: "서약서 및 볼펜 준비: 김성훈sf, 김수현sf, 김현민sf",
    };

    const lines = dutyLinesForStaff(block, "김현민");
    expect(dutyLabelsForStaff(lines, "김현민")).toEqual(["서약서 및 볼펜 준비"]);
  });

  it("공백과 sf 표기가 달라도 큐싯 담당을 같은 스탭으로 찾는다", () => {
    const block = {
      id: "departure",
      day: 1,
      start: "15:00",
      label: "출발 및 도착",
      owner: "4호차: 김 현민 sf",
    };

    expect(dutyLabelsForStaff(dutyLinesForStaff(block, "김현민"), "김현민")).toEqual(["4호차"]);
  });

  it("구조화 동선과 같은 자유문구 담당만 중복 표시에서 제외한다", () => {
    expect(withoutStructuredDutyLabels(
      ["아래 숙소 층장", "선교팀 학생 인솔"],
      ["[수련회장] 아래 숙소 층장"],
    )).toEqual(["선교팀 학생 인솔"]);
  });

  it("화살표 표기가 달라도 구조화 구간과 같은 자유문구 경로는 제외한다", () => {
    expect(withoutStructuredDutyLabels(
      ["숙소-->강당 @", "5호차"],
      ["숙소 → 강당", "[수련회장] 숙소 층장"],
    )).toEqual(["5호차"]);
  });

  it("자유문구 경로는 읽기 쉬운 화살표로 정리한다", () => {
    const block = {
      id: "dinner",
      day: 1,
      start: "17:40",
      end: "19:30",
      label: "저녁 식사",
      owner: "숙소-->강당 @ 이채희sf",
    };

    expect(dutyLabelsForStaff(dutyLinesForStaff(block, "이채희"), "이채희"))
      .toEqual(["숙소 → 강당"]);
  });
});
