import { describe, expect, it } from "vitest";
import type { Room, TeacherAttendance } from "./types";
import {
  autoAssignRooms,
  classifyRoomAdult,
  makeExternalAdults,
  type RoomAutoAdult,
  type RoomAutoStudent,
} from "./roomAutoAssign";

function room(id: string, capacity: number, type: "남" | "여", dong = "본관"): Room {
  return { id, roomNumber: id, dong, capacity, type, studentIds: [], teachers: [] };
}

function students(count: number, classNum = 1, gender: "남" | "여" = "남"): RoomAutoStudent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `s${classNum}-${index + 1}`,
    name: `학생${classNum}-${index + 1}`,
    bu: "1부",
    grade: 1,
    classNum,
    gender,
  }));
}

function adult(id: string, category: RoomAutoAdult["category"], gender: "남" | "여" = "남", classKey?: string): RoomAutoAdult {
  return { id, name: id, gender, category, classKey };
}

describe("room auto assignment", () => {
  it("runs exactly 30 simulations and keeps one class in one building/capacity profile", () => {
    const result = autoAssignRooms({
      rooms: [
        room("A1", 3, "남"), room("A2", 3, "남"), room("A3", 3, "남"),
        room("B1", 2, "남", "별관"), room("B2", 2, "남", "별관"),
      ],
      students: students(7),
      adults: [adult("담임", "classTeacher", "남", "1부-1-1"), adult("스탭1", "staff"), adult("스탭2", "staff")],
      simulations: 30,
    });

    expect(result.simulationCount).toBe(30);
    expect(result.hardViolations).toEqual([]);
    expect(result.assignedStudentCount).toBe(7);
    expect(result.assignedAdultCount).toBe(3);
    const classRooms = result.rooms.filter(r => r.studentIds.length > 0);
    expect(new Set(classRooms.map(r => `${r.dong}|${r.capacity}`)).size).toBe(1);
    expect(classRooms.every(r => r.studentIds.every(id => id.startsWith("s1-")))).toBe(true);
    const teacherRoom = result.rooms.find(r => r.teachers?.includes("담임"));
    expect(teacherRoom?.studentIds.some(id => id.startsWith("s1-"))).toBe(true);
  });

  it("uses a different deterministic seed batch when rerunning the preview", () => {
    const input = {
      rooms: [room("M1", 4, "남")],
      students: students(4),
      adults: [],
      simulations: 30,
    };
    const first = autoAssignRooms({ ...input, seedOffset: 0 });
    const firstAgain = autoAssignRooms({ ...input, seedOffset: 0 });
    const rerun = autoAssignRooms({ ...input, seedOffset: 1 });

    expect(first.rooms[0].studentIds).toEqual(firstAgain.rooms[0].studentIds);
    expect(rerun.rooms[0].studentIds).not.toEqual(first.rooms[0].studentIds);
  });

  it("puts every class teacher in a room containing their own students", () => {
    const result = autoAssignRooms({
      rooms: [room("A1", 3, "남"), room("A2", 3, "남"), room("A3", 3, "남")],
      students: students(6),
      adults: [adult("1반담임", "classTeacher", "남", "1부-1-1")],
      simulations: 30,
    });

    expect(result.hardViolations).toEqual([]);
    const teacherRoom = result.rooms.find(r => r.teachers?.includes("1반담임"));
    expect(teacherRoom).toBeDefined();
    expect(teacherRoom?.studentIds.length).toBeGreaterThan(0);
    expect(teacherRoom?.studentIds.every(id => id.startsWith("s1-"))).toBe(true);
  });

  it("keeps staff lower-priority and only fills vacancies after the class profile is chosen", () => {
    const result = autoAssignRooms({
      rooms: [
        room("M10", 10, "남"),
        room("M3-1", 3, "남"), room("M3-2", 3, "남"), room("M3-3", 3, "남"),
      ],
      students: students(7),
      adults: [adult("스탭1", "staff"), adult("스탭2", "staff"), adult("스탭3", "staff")],
      simulations: 30,
    });

    expect(result.hardViolations).toEqual([]);
    expect(result.classRoomCount).toBe(3);
    expect(result.classRoomEmptyBedCount).toBe(2);
    expect(result.classRoomFillerCount).toBe(2);
    expect(result.usedRoomCount).toBe(4);
    expect(result.rooms.find(item => item.id === "M10")?.studentIds).toHaveLength(0);
    expect(result.rooms.find(item => item.id === "M10")?.teachers).toHaveLength(1);
  });

  it("can exclude general staff while keeping teachers and special adult roles", () => {
    const result = autoAssignRooms({
      rooms: [room("M1", 3, "남"), room("M2", 3, "남"), room("M3", 3, "남")],
      students: students(1),
      adults: [
        adult("일반교사", "teacher"),
        adult("일반스탭", "staff"),
        adult("교역자", "minister"),
        adult("음향", "audio"),
      ],
      includeStaff: false,
      simulations: 30,
    });

    expect(result.hardViolations).toEqual([]);
    expect(result.assignedAdultCount).toBe(3);
    expect(result.unassignedAdults).toEqual([]);
    expect(result.rooms.flatMap(item => item.teachers ?? [])).toEqual(expect.arrayContaining(["일반교사", "교역자", "음향"]));
    expect(result.rooms.flatMap(item => item.teachers ?? [])).not.toContain("일반스탭");
  });

  it("does not choose an oversized room when there are no staff fillers", () => {
    const result = autoAssignRooms({
      rooms: [
        room("M10", 10, "남"),
        room("M3-1", 3, "남"), room("M3-2", 3, "남"), room("M3-3", 3, "남"),
      ],
      students: students(7),
      adults: [],
      simulations: 30,
    });

    expect(result.hardViolations).toEqual([]);
    expect(result.usedRoomCount).toBe(3);
    expect(result.emptyBedCount).toBe(2);
    expect(result.classRoomFillerCount).toBe(0);
    expect(result.classRoomEmptyBedCount).toBe(2);
  });

  it("blocks a class teacher who cannot share a gender-matched room with their class", () => {
    const result = autoAssignRooms({
      rooms: [room("M1", 3, "남"), room("F1", 3, "여")],
      students: students(2, 1, "남"),
      adults: [adult("성별불일치담임", "classTeacher", "여", "1부-1-1")],
      simulations: 30,
    });

    expect(result.hardViolations.some(message => message.includes("담당 반") && message.includes("같은 성별"))).toBe(true);
    expect(result.unassignedAdults.map(item => item.name)).toContain("성별불일치담임");
  });

  it("includes the pinned room and expands the class only to rooms with the same profile", () => {
    const result = autoAssignRooms({
      rooms: [
        room("A1", 3, "남"), room("A2", 3, "남"), room("A3", 3, "남"),
        room("B1", 2, "남", "별관"), room("B2", 2, "남", "별관"),
      ],
      students: students(4),
      adults: [],
      classPins: [{ classKey: "1부-1-1", roomId: "A2" }],
      simulations: 30,
    });

    expect(result.hardViolations).toEqual([]);
    const pinnedRoom = result.rooms.find(item => item.id === "A2");
    expect(pinnedRoom?.studentIds.length).toBeGreaterThan(0);
    const usedClassRooms = result.rooms.filter(item => item.studentIds.length > 0);
    expect(new Set(usedClassRooms.map(item => `${item.dong}|${item.capacity}`))).toEqual(new Set(["본관|3"]));
  });

  it("blocks gender-conflicting and duplicate room pins", () => {
    const genderConflict = autoAssignRooms({
      rooms: [room("M1", 3, "남"), room("F1", 3, "여")],
      students: students(2), adults: [],
      classPins: [{ classKey: "1부-1-1", roomId: "F1" }], simulations: 30,
    });
    expect(genderConflict.hardViolations.some(message => message.includes("여자 방"))).toBe(true);

    const duplicate = autoAssignRooms({
      rooms: [room("M1", 3, "남"), room("M2", 3, "남")],
      students: [...students(2, 1), ...students(2, 2)], adults: [],
      classPins: [
        { classKey: "1부-1-1", roomId: "M1" },
        { classKey: "1부-1-2", roomId: "M1" },
      ],
      simulations: 30,
    });
    expect(duplicate.hardViolations.some(message => message.includes("같은 방을 지정"))).toBe(true);
  });

  it("keeps ministers, audio, and medical in exclusive rooms", () => {
    const adults = [
      adult("목사1", "minister"), adult("목사2", "minister"),
      adult("음향1", "audio"), adult("음향2", "audio"), adult("음향3", "audio"),
      adult("의료1", "medical", "여"), adult("일반스탭", "staff"),
    ];
    const result = autoAssignRooms({
      rooms: [
        room("M1", 3, "남"), room("M2", 3, "남"), room("M3", 3, "남"),
        room("F1", 1, "여"), room("F2", 2, "여"),
      ],
      students: [], adults, simulations: 30,
    });

    expect(result.hardViolations).toEqual([]);
    const ministerRoom = result.rooms.find(r => r.teachers?.includes("목사1"));
    const audioRoom = result.rooms.find(r => r.teachers?.includes("음향1"));
    const medicalRoom = result.rooms.find(r => r.teachers?.includes("의료1"));
    expect(ministerRoom?.teachers).toEqual(expect.arrayContaining(["목사1", "목사2"]));
    expect(audioRoom?.teachers).toEqual(expect.arrayContaining(["음향1", "음향2", "음향3"]));
    expect(medicalRoom?.teachers).toEqual(["의료1"]);
    expect(ministerRoom?.id).not.toBe(audioRoom?.id);
  });

  it("never exceeds capacity and reports missing gender as a blocker", () => {
    const result = autoAssignRooms({
      rooms: [room("M1", 2, "남")],
      students: students(1),
      adults: [{ id: "unknown", name: "성별미입력", gender: null, category: "staff" }],
      simulations: 30,
    });
    expect(result.hardViolations.some(message => message.includes("성별"))).toBe(true);
    expect(result.unassignedAdults.map(item => item.name)).toContain("성별미입력");
    expect(result.rooms.every(r => r.studentIds.length + (r.teachers?.length ?? 0) <= r.capacity)).toBe(true);
  });

  it("classifies actual teacher records and only creates missing external placeholders", () => {
    const teacher: TeacherAttendance = {
      id: "audio", name: "음향담당", bu: "스탭", classKey: "방송 음향", status: "전참", gender: "남",
    };
    expect(classifyRoomAdult(teacher).category).toBe("audio");
    expect(makeExternalAdults("audio", 3, "남", 1).map(item => item.name)).toEqual(["외부 음향 2", "외부 음향 3"]);
  });

  it("rejects simulation counts other than 30", () => {
    expect(() => autoAssignRooms({ rooms: [room("M1", 2, "남")], students: [], adults: [], simulations: 10 }))
      .toThrow(/30회/);
  });
});
