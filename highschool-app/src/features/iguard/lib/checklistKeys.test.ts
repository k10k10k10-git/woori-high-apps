import { describe, it, expect } from "vitest";
import { stableMemberId, memberCheckKeys, isMemberChecked } from "./checklistKeys";

describe("checklistKeys", () => {
  it("멤버 id에 인덱스가 들어가지 않는다", () => {
    expect(stableMemberId("teacher", "g_1", "조여준")).toBe("teacher:g_1:조여준");
    expect(stableMemberId("bus-staff", "-Owg1", "나선유")).toBe("bus-staff:-Owg1:나선유");
  });

  it("명단 순서가 바뀌어도 같은 키를 만든다 — 이번 버그의 핵심", () => {
    const before = ["김교사", "조여준"].map((n, i) => ({ i, id: stableMemberId("teacher", "g_1", n) }));
    // 김교사가 불참 처리돼 명단에서 빠지면 조여준의 인덱스는 1 → 0으로 밀린다
    const after = ["조여준"].map((n, i) => ({ i, id: stableMemberId("teacher", "g_1", n) }));
    expect(after[0].i).not.toBe(before[1].i);
    expect(after[0].id).toBe(before[1].id);
  });

  it("구형 인덱스 키로 저장된 체크도 인식한다", () => {
    const checked = new Set(["1:teacher:g_1:2:조여준"]);
    const id = stableMemberId("teacher", "g_1", "조여준");

    expect(isMemberChecked(checked, 1, id)).toBe(true);
    expect(memberCheckKeys(checked, 1, id)).toEqual(["1:teacher:g_1:2:조여준"]);
  });

  it("해제할 때 신형·구형 키를 모두 돌려준다 — 하나라도 남으면 체크가 되살아난다", () => {
    const id = stableMemberId("teacher", "g_1", "조여준");
    const checked = new Set(["1:teacher:g_1:조여준", "1:teacher:g_1:0:조여준", "1:teacher:g_1:5:조여준"]);

    expect(memberCheckKeys(checked, 1, id).sort()).toEqual(
      ["1:teacher:g_1:0:조여준", "1:teacher:g_1:5:조여준", "1:teacher:g_1:조여준"].sort(),
    );
  });

  it("다른 날짜·다른 조·다른 이름은 섞이지 않는다", () => {
    const checked = new Set([
      "3:teacher:g_1:0:조여준",   // 다른 날
      "1:teacher:g_2:0:조여준",   // 다른 조
      "1:teacher:g_1:0:조여진",   // 다른 이름
    ]);
    expect(isMemberChecked(checked, 1, stableMemberId("teacher", "g_1", "조여준"))).toBe(false);
  });

  it("인덱스 자리가 숫자가 아니면 구형 키로 보지 않는다", () => {
    const checked = new Set(["1:teacher:g_1:부장:조여준"]);
    expect(isMemberChecked(checked, 1, stableMemberId("teacher", "g_1", "조여준"))).toBe(false);
  });

  it("학생 키는 인덱스를 쓴 적이 없어 그대로 동작한다", () => {
    const checked = new Set(["1:student:2_S12_03"]);
    expect(isMemberChecked(checked, 1, "student:2_S12_03")).toBe(true);
    expect(isMemberChecked(checked, 3, "student:2_S12_03")).toBe(false);
  });
});
