import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLodgingMapResult, findRoomMapLocation } from "@/lib/lodgingMap";
import { detectLodgingBuilding, fileLabel } from "@/lib/lodgingPdf";
import { Group, Room, Student } from "@/lib/types";

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
  it("PDF 본문 또는 파일명에서 장소별 건물명을 자동 선택한다", () => {
    const rooms = [
      room({ dong: "새빛 생활관" }),
      room({ id: "room-201", dong: "은혜관", roomNumber: "201" }),
    ];
    expect(detectLodgingBuilding("새빛 생활관 1층 101 102", "도면.pdf", rooms)).toBe("새빛 생활관");
    expect(detectLodgingBuilding("", "은혜관_배치도.pdf", rooms)).toBe("은혜관");
    expect(fileLabel("은혜관_배치도.pdf")).toBe("은혜관 배치도");
  });

  it("실행에는 숙소 안내, 기획에는 배치도 관리를 분리해 노출한다", () => {
    const source = readFileSync(new URL("../src/app/retreat/[id]/IguardClient.tsx", import.meta.url), "utf8");
    expect(source).toContain('{ key: "lodging", label: "숙소 안내", icon: "🗺️" }');
    expect(source).toContain('{ key: "lodgingmap", label: "배치도 관리" }');
    expect(source).toContain('view === "lodging"');
    expect(source).toContain('mode="view"');
    expect(source).toContain('mode="manage"');
    expect(source).toContain("grid-cols-5");
  });

  it("건물명과 호실 번호로 본관 층 도면을 찾는다", () => {
    const location = findRoomMapLocation(room({ roomNumber: "215호" }));
    expect(location?.building.id).toBe("main");
    expect(location?.page.id).toBe("main-2f");
    expect(location?.hotspot.roomNumber).toBe("215");
  });

  it("별관 숙소의 6개 호실을 4구역 간이 배치도에 모두 연결한다", () => {
    const roomNumbers = ["101", "102", "103", "201", "202", "203"];
    const locations = roomNumbers.map(roomNumber => findRoomMapLocation(room({ dong: "별관 숙소(VIP)", roomNumber })));

    expect(locations.every(location => location?.building.id === "annex")).toBe(true);
    expect(locations.every(location => location?.page.id === "annex-all")).toBe(true);
    expect(locations[0]?.page.image).toBeUndefined();
    expect(locations[0]?.page.schematicZones).toHaveLength(4);
    expect(new Set(locations.map(location => location?.hotspot.roomNumber))).toEqual(new Set(roomNumbers));
  });

  it("별관·VIP 축약 건물명도 별관 간이 배치도로 인식한다", () => {
    expect(findRoomMapLocation(room({ dong: "별관", roomNumber: "101" }))?.building.id).toBe("annex");
    expect(findRoomMapLocation(room({ dong: "VIP", roomNumber: "203호" }))?.building.id).toBe("annex");
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

  it("수련회별 PDF를 올리고 호실 핀을 저장하는 사용자 배치도를 지원한다", () => {
    const view = readFileSync(new URL("../src/app/retreat/[id]/CustomLodgingMap.tsx", import.meta.url), "utf8");
    const paths = readFileSync(new URL("../src/lib/paths.ts", import.meta.url), "utf8");
    const storage = readFileSync(new URL("../src/lib/lodgingMapStorage.ts", import.meta.url), "utf8");

    expect(view).toContain('accept="application/pdf,.pdf"');
    expect(view).toContain("saveIguardLodgingHotspot");
    expect(view).toContain("summarizeLodgingRoom");
    expect(view).toContain("onSelect(summary, event.currentTarget)");
    expect(paths).toContain("iguardLodgingMaps");
    expect(view).toContain("analyzeLodgingPdf");
    expect(view).not.toContain("배치도 이름 (예:");
    expect(storage).toContain("uploadBytesResumable");
    expect(storage).toContain("업로드 시간이 초과");
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

  it("숙박 학생의 조를 전역 조 번호로 중복 없이 요약하고 제외 학생의 조는 빼준다", () => {
    const students = {
      "2_a": { ...student("2_a", "학생A", 3), buNum: 2 },
      "2_b": { ...student("2_b", "학생B", 3), buNum: 2 },
    };
    const groups: Group[] = [
      { id: "one", name: "1조", bu: "1부", teachers: [], leader: "", studentIds: [] },
      { id: "two", name: "2조", bu: "1부", teachers: [], leader: "", studentIds: [] },
      { id: "three", name: "1조", bu: "2부", teachers: [], leader: "", studentIds: ["2_a"] },
      { id: "four", name: "2조", bu: "2부", teachers: [], leader: "", studentIds: ["2_b"] },
    ];
    const result = buildLodgingMapResult(
      [room({ studentIds: ["2_a", "2_b"] })],
      students,
      { "2_b": { type: "당일참석", day: 2 } },
      {},
      groups,
    );

    expect(result.mapped[0].groupLabels).toEqual(["3조"]);
    expect(result.mapped[0].studentNames).toEqual(["학생A"]);
  });

  it("도면에 없는 건물·호실은 임의 배치하지 않고 미매칭으로 남긴다", () => {
    const unknown = room({ id: "unknown", dong: "다른 숙소", roomNumber: "999", studentIds: ["1_a"] });
    const result = buildLodgingMapResult([unknown], { "1_a": student("1_a", "학생A", 1) }, {}, {});
    expect(result.mapped).toHaveLength(0);
    expect(result.unmatched.map(item => item.id)).toEqual(["unknown"]);
  });
});
