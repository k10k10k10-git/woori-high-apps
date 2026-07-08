import { describe, expect, it } from "vitest";
import { parseBusStaff } from "../src/lib/busStaff";

describe("parseBusStaff", () => {
  it("normalizes sf suffixes", () => {
    expect(parseBusStaff("박혜원sf, 김동연sf").names).toEqual(["박혜원", "김동연"]);
  });

  it("keeps real names and rejects cue-sheet instruction fragments", () => {
    const parsed = parseBusStaff("부터, 간격으로, 이동, 시작, 카톡방에, 인원보고, 최현우sf, 김동연sf, 박혜원sf");
    expect(parsed.names).toEqual(["최현우", "김동연", "박혜원"]);
    expect(parsed.rejected).toEqual(expect.arrayContaining(["부터", "간격으로", "이동", "시작", "카톡방에", "인원보고"]));
    expect(parsed.suspicious).toBe(true);
  });

  it("rejects instruction-only values", () => {
    const parsed = parseBusStaff("선발대, 동선, 대기, 보고");
    expect(parsed.names).toEqual([]);
    expect(parsed.rejected.length).toBeGreaterThan(0);
  });

  it("allows spaced staff labels when they are not instruction phrases", () => {
    expect(parseBusStaff("정환이 친구").names).toEqual(["정환이 친구"]);
  });

  it("excludes staff count summaries from cue-sheet bus staff", () => {
    const parsed = parseBusStaff("스탭 0명, 최현우sf, 김동연sf, 박혜원sf");
    expect(parsed.names).toEqual(["최현우", "김동연", "박혜원"]);
    expect(parsed.rejected).toContain("스탭 0명");
  });
});
