import { describe, it, expect } from "vitest";
import { roomLabel, sortRooms } from "./roomLabel";

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

describe("sortRooms", () => {
  it("각 동 안에서 호수 숫자순 (99<101<110<307)", () => {
    const rooms = [
      { dong: "숙소동", roomNumber: "307" },
      { dong: "숙소동", roomNumber: "110" },
      { dong: "숙소동", roomNumber: "99" },
      { dong: "숙소동", roomNumber: "101" },
    ];
    expect(sortRooms(rooms).map(r => r.roomNumber)).toEqual(["99", "101", "110", "307"]);
  });

  it("동별로 묶인다 (같은 동끼리 연속으로 모임)", () => {
    const rooms = [
      { dong: "숙소동", roomNumber: "307" },
      { dong: "HRD센터", roomNumber: "201" },
      { dong: "숙소동", roomNumber: "101" },
      { dong: "HRD센터", roomNumber: "105" },
    ];
    const dongs = sortRooms(rooms).map(r => r.dong);
    // 동이 뒤섞이지 않고 한 번만 전환 = 두 건물이 각각 뭉쳐 있음
    const transitions = dongs.filter((d, i) => i > 0 && d !== dongs[i - 1]).length;
    expect(transitions).toBe(1);
  });

  it("동 없는(단일 건물) 방은 앞쪽에 모여 호수 숫자순", () => {
    const rooms = [
      { roomNumber: "201" },
      { dong: "A동", roomNumber: "101" },
      { roomNumber: "102" },
    ];
    expect(sortRooms(rooms).map(r => `${r.dong ?? ""}${r.roomNumber}`)).toEqual(["102", "201", "A동101"]);
  });
});
