import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLodgingMapResult, findRoomMapLocation } from "@/lib/lodgingMap";
import { Room, Student } from "@/lib/types";

const room = (overrides: Partial<Room> = {}): Room => ({
  id: "room-101",
  dong: "본관 숙소동",
  roomNumber: "101",
  capacity: 10,
  type: "남",
  studentIds: [],
  teachers: [],
  ...overrides,
});

const student = (id: string, name: string, cls: number): Student => ({
  id,
  name,
  num: 1,
  grade: 2,
  class: cls,
  buNum: 1,
});

describe("숙소 배정도 매칭", () => {
  it("실행 영역과 모바일 5열 탭에 숙소 배정도를 노출한다", () => {
    const source = readFileSync(new URL("../src/app/retreat/[id]/IguardClient.tsx", import.meta.url), "utf8");
    expect(source).toContain('{ key: "lodgingmap", label: "숙소 배정도", icon: "🗺️" }');
    expect(source).toContain('view === "lodgingmap"');
    expect(source).toContain("grid-cols-5");
  });

  it("건물명과 호실 번호로 본관 층 도면을 찾는다", () => {
    const location = findRoomMapLocation(room({ roomNumber: "215호" }));
    expect(location?.building.id).toBe("main");
    expect(location?.page.id).toBe("main-2f");
    expect(location?.hotspot.roomNumber).toBe("215");
  });

  it("본관 2층의 홀수 호실과 우측 호실을 실제 도면 방 중앙에 배치한다", () => {
    expect(findRoomMapLocation(room({ roomNumber: "211" }))?.hotspot.top).toBeCloseTo(61.2, 1);
    expect(findRoomMapLocation(room({ roomNumber: "217" }))?.hotspot.top).toBeCloseTo(61.2, 1);
    expect(findRoomMapLocation(room({ roomNumber: "216" }))?.hotspot.top).toBeCloseTo(77.7, 1);
    expect(findRoomMapLocation(room({ roomNumber: "214" }))?.hotspot.top).toBeCloseTo(88.5, 1);
  });

  it("호실 상세를 하단 카드가 아니라 선택 배지 옆 팝오버로 표시한다", () => {
    const source = readFileSync(new URL("../src/app/retreat/[id]/LodgingMapView.tsx", import.meta.url), "utf8");
    expect(source).toContain("createPortal");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('className="fixed z-[100]');
    expect(source).toContain('aria-controls={active ? "lodging-room-popover" : undefined}');
  });

  it("HRD처럼 건물명이 포괄적이면 방 정원으로 핵심관·인재관을 구분한다", () => {
    expect(findRoomMapLocation(room({ dong: "HRD", roomNumber: "304", capacity: 3 }))?.building.id).toBe("hrd-core");
    expect(findRoomMapLocation(room({ dong: "HRD센터", roomNumber: "304", capacity: 2 }))?.building.id).toBe("hrd-talent");
  });

  it("취소·당일참석은 숙박 인원에서 빼고 반과 교사를 요약한다", () => {
    const students = {
      "1_a": student("1_a", "학생A", 3),
      "1_b": student("1_b", "학생B", 4),
      "1_c": student("1_c", "학생C", 5),
    };
    const result = buildLodgingMapResult(
      [room({ studentIds: ["1_a", "1_b", "1_c"], teachers: ["담임"] })],
      students,
      { "1_b": { type: "당일참석", day: 1 } },
      { "1_c": "red" },
    );

    expect(result.unmatched).toHaveLength(0);
    expect(result.mapped).toHaveLength(1);
    expect(result.mapped[0].classLabels).toEqual(["1부 2학년 3반"]);
    expect(result.mapped[0].studentNames).toEqual(["학생A"]);
    expect(result.mapped[0].teacherNames).toEqual(["담임"]);
    expect(result.mapped[0].peopleCount).toBe(2);
  });

  it("도면에 없는 건물·호실은 임의 배치하지 않고 미매칭으로 남긴다", () => {
    const unknown = room({ id: "unknown", dong: "다른 숙소", roomNumber: "999", studentIds: ["1_a"] });
    const result = buildLodgingMapResult([unknown], { "1_a": student("1_a", "학생A", 1) }, {}, {});
    expect(result.mapped).toHaveLength(0);
    expect(result.unmatched.map(item => item.id)).toEqual(["unknown"]);
  });
});
