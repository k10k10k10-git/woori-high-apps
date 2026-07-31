import { describe, expect, it } from "vitest";
import { uniqueMatchedParticipants, summarizeRoster } from "./rosterStats";
import type { Participant } from "./types";

const p = (over: Partial<Participant>): Participant => ({
  name: "학생", gender: "남", grade: 1, class: 1, bu: "1부", registeredAt: "2026-01-01", ...over,
});

describe("uniqueMatchedParticipants", () => {
  it("studentId가 없는 미매칭 신청자를 제외한다", () => {
    const result = uniqueMatchedParticipants([
      p({ name: "김가", studentId: "1_a" }),
      p({ name: "이나", studentId: null }),
      p({ name: "박다" }),               // studentId 자체가 없음
    ]);
    expect(result.map(x => x.name)).toEqual(["김가"]);
  });

  it("같은 studentId는 첫 항목만 남긴다", () => {
    const result = uniqueMatchedParticipants([
      p({ name: "먼저", studentId: "1_a", registeredAt: "2026-01-01" }),
      p({ name: "나중", studentId: "1_a", registeredAt: "2026-02-01" }),
    ]);
    expect(result.map(x => x.name)).toEqual(["먼저"]);
  });

  it("서로 다른 studentId는 모두 남긴다", () => {
    const result = uniqueMatchedParticipants([
      p({ studentId: "1_a" }), p({ studentId: "1_b" }), p({ studentId: "2_a" }),
    ]);
    expect(result).toHaveLength(3);
  });

  it("빈 입력은 빈 배열", () => {
    expect(uniqueMatchedParticipants([])).toEqual([]);
  });
});

describe("summarizeRoster", () => {
  it("총원과 남녀를 센다", () => {
    const result = summarizeRoster([
      p({ studentId: "1_a", gender: "남" }),
      p({ studentId: "1_b", gender: "여" }),
      p({ studentId: "1_c", gender: "남" }),
    ]);
    expect(result).toEqual({ total: 3, matched: 3, male: 2, female: 1 });
  });

  it("성별이 비어 있으면 남/여 어느 쪽에도 넣지 않는다 (반 홀짝 추론 금지)", () => {
    const result = summarizeRoster([
      p({ studentId: "1_a", gender: "" }),
      p({ studentId: "1_b", class: 3, gender: "미상" }),
    ]);
    expect(result).toEqual({ total: 2, matched: 2, male: 0, female: 0 });
  });

  it("빈 입력은 0으로 시작한다", () => {
    expect(summarizeRoster([])).toEqual({ total: 0, matched: 0, male: 0, female: 0 });
  });
});
