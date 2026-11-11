import { describe, expect, it } from "vitest";
import { nextPushId } from "./pushId";

const PUSH_ID = /^[-0-9A-Z_a-z]{20}$/;

describe("Firebase 푸시 ID", () => {
  it("20자이며 앞 8자가 시각을 64진수로 담는다", () => {
    const id = nextPushId(0, () => 0);
    expect(id).toMatch(PUSH_ID);
    expect(id.slice(0, 8)).toBe("--------");
    // firebase 12.15 SDK 의 push() 가 같은 시각(1700000000000ms)에 만든 ID 의 앞 8자와 같다.
    expect(nextPushId(1_700_000_000_000).slice(0, 8)).toBe("-NjEtLV-");
  });

  it("시각 순서대로 정렬되고, 같은 밀리초 안에서도 만든 순서를 지킨다", () => {
    const ids = [nextPushId(1000), nextPushId(1000), nextPushId(1000), nextPushId(1001), nextPushId(2_000_000)];
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    ids.forEach((id) => expect(id).toMatch(PUSH_ID));
  });

  it("같은 밀리초에 무작위 부분이 끝자리에서 올림된다", () => {
    const first = nextPushId(5000, () => 0.5);
    const second = nextPushId(5000);
    expect(first.slice(0, 8)).toBe(second.slice(0, 8));
    expect(second > first).toBe(true);
    expect(second.slice(8, 19)).toBe(first.slice(8, 19));
  });
});
