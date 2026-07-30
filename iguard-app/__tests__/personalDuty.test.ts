import { describe, expect, it } from "vitest";
import { dutyLabelsForStaff, personalAssignmentLabel } from "@/lib/personalDuty";

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
});
