import { describe, it, expect } from "vitest";
import { roomLabel } from "./roomLabel";

describe("roomLabel", () => {
  it("동이 있으면 '동 호수'로 합쳐 표시", () => {
    expect(roomLabel({ dong: "5동", roomNumber: "1092호" })).toBe("5동 1092호");
  });

  it("동이 없으면(기존 단일 건물) 호수만", () => {
    expect(roomLabel({ roomNumber: "1092" })).toBe("1092");
    expect(roomLabel({ dong: "", roomNumber: "1092" })).toBe("1092");
    expect(roomLabel({ dong: null, roomNumber: "1092" })).toBe("1092");
  });

  it("동 앞뒤 공백은 정리", () => {
    expect(roomLabel({ dong: "  A동 ", roomNumber: "201호" })).toBe("A동 201호");
  });
});
