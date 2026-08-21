import { describe, expect, it } from "vitest";
import {
  DAILY_MINISTRY_VERSES,
  MINISTRY_ENCOURAGEMENTS,
  dailyMinistryMessage,
  friendlyMinistryName,
  seoulDateKey,
} from "./dailyMinistryMessage";

describe("홈 일일 응원과 말씀", () => {
  it("사용자가 확정한 22개 응원 문구와 31개 말씀만 사용한다", () => {
    expect(MINISTRY_ENCOURAGEMENTS).toHaveLength(22);
    expect(DAILY_MINISTRY_VERSES).toHaveLength(31);
    expect(MINISTRY_ENCOURAGEMENTS).toContain("우리의 작은 섬김이 공동체를 든든히 세워요.");
    expect(MINISTRY_ENCOURAGEMENTS.join(" ")).not.toContain("오늘 심은 작은 수고");
    expect(MINISTRY_ENCOURAGEMENTS.join(" ")).not.toContain("지치지 말고 선한 일을");
    expect(MINISTRY_ENCOURAGEMENTS.join(" ")).not.toContain("보이지 않는 자리의 섬김");
  });

  it("같은 날짜에는 같은 조합이고 다음 날에는 두 문구가 모두 바뀐다", () => {
    expect(dailyMinistryMessage("2026-08-22")).toEqual(dailyMinistryMessage("2026-08-22"));
    const today = dailyMinistryMessage("2026-08-22");
    const tomorrow = dailyMinistryMessage("2026-08-23");
    expect(tomorrow.encouragement).not.toBe(today.encouragement);
    expect(tomorrow.verse).not.toEqual(today.verse);
  });

  it("한국 자정을 기준으로 날짜를 바꾼다", () => {
    expect(seoulDateKey(new Date("2026-08-21T14:59:59.000Z"))).toBe("2026-08-21");
    expect(seoulDateKey(new Date("2026-08-21T15:00:00.000Z"))).toBe("2026-08-22");
  });

  it("한국식 전체 이름은 이름만 부르고 판단하기 어려운 이름은 보존한다", () => {
    expect(friendlyMinistryName("김성훈")).toBe("성훈님");
    expect(friendlyMinistryName("남궁민수")).toBe("민수님");
    expect(friendlyMinistryName("성훈")).toBe("성훈님");
    expect(friendlyMinistryName("Alex Kim")).toBe("Alex Kim님");
    expect(friendlyMinistryName("성훈님")).toBe("성훈님");
    expect(friendlyMinistryName("")).toBe("선생님");
  });

  it("잘못된 날짜는 조용히 다른 문구로 바꾸지 않는다", () => {
    expect(() => dailyMinistryMessage("2026-02-30")).toThrow("존재하지 않는 날짜");
  });
});
