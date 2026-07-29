import { describe, it, expect } from "vitest";
import {
  buildSearchIndex, searchIndex, toChosung, isChosungQuery,
  type SearchIndexInput, type SearchEntry,
} from "@/lib/personIndex";
import type { Group, Room, Student, Participant, TeacherAttendance, IguardStaff, IguardBus } from "@/lib/types";

const students: Record<string, Student> = {
  "1_101": { id: "1_101", name: "김현민", num: 1, grade: 1, class: 1, buNum: 1 },
  "1_102": { id: "1_102", name: "김현수", num: 2, grade: 1, class: 1, buNum: 1 },
  "1_103": { id: "1_103", name: "박세원", num: 3, grade: 2, class: 2, buNum: 1 },
  "1_104": { id: "1_104", name: "취소학생", num: 4, grade: 1, class: 1, buNum: 1 },
  "1_999": { id: "1_999", name: "미참가자", num: 9, grade: 3, class: 3, buNum: 1 },
};

const participants: Record<string, Participant> = {
  "1_101": { name: "김현민", gender: "남", grade: 1, class: 1, bu: "1부" },
  "1_102": { name: "김현수", gender: "여", grade: 1, class: 1, bu: "1부" },
  "1_103": { name: "박세원", gender: "남", grade: 2, class: 2, bu: "1부" },
  "1_104": { name: "취소학생", gender: "남", grade: 1, class: 1, bu: "1부" },
};

const groups: Group[] = [
  { id: "g1", name: "1조", bu: "1부", teachers: ["이교사"], leader: "김현민", studentIds: ["1_101", "1_102", "1_104"] },
  { id: "g2", name: "2조", bu: "1부", teachers: [], leader: "", studentIds: ["1_103"] },
];

const rooms: Room[] = [
  { id: "r1", dong: "별관", roomNumber: "201", capacity: 4, type: "남", studentIds: ["1_101", "1_104"], teachers: ["이교사"] },
  { id: "r2", roomNumber: "305", capacity: 3, type: "여", studentIds: ["1_102"] },
];

const adminTeachers: TeacherAttendance[] = [
  { id: "t1", name: "이교사", bu: "1부", classKey: "1-1-1", status: "전참", transport: "자차" },
  { id: "s1", name: "최스탭sf", bu: "스탭", classKey: "", status: "전참" },
];

const staff: IguardStaff[] = [
  { id: "s1", name: "최스탭sf", role: "층장" },
];

const buses: IguardBus[] = [
  { id: "b1", busNo: 1, day: 1, groupIds: ["g1", "g2"] },
];

function makeInput(overrides: Partial<SearchIndexInput> = {}): SearchIndexInput {
  return {
    groups, rooms, students, participants, adminTeachers, staff,
    groupStaff: { g1: ["s1"] },
    buses,
    movements: [],
    posts: [],
    partial: { "1_103": { type: "후발대" } },
    cellColors: { "1_104": "red" },
    ...overrides,
  };
}

function find(entries: SearchEntry[], id: string): SearchEntry {
  const entry = entries.find(e => e.id === id);
  if (!entry) throw new Error(`인덱스에 ${id}가 없다`);
  return entry;
}

function factValue(entry: SearchEntry, label: string): string | undefined {
  return entry.facts.find(f => f.label === label)?.value;
}

describe("toChosung / isChosungQuery", () => {
  it("완성형 한글을 초성으로 바꾼다", () => {
    expect(toChosung("김현민")).toBe("ㄱㅎㅁ");
    expect(toChosung("박세원")).toBe("ㅂㅅㅇ");
  });

  it("한글이 아닌 문자는 소문자로 보존한다", () => {
    expect(toChosung("2호차")).toBe("2ㅎㅊ");
    expect(toChosung("ABC")).toBe("abc");
  });

  it("초성만으로 된 질의를 판정한다", () => {
    expect(isChosungQuery("ㄱㅎㅁ")).toBe(true);
    expect(isChosungQuery("김현")).toBe(false);
    expect(isChosungQuery("")).toBe(false);
    expect(isChosungQuery("305")).toBe(false);
  });
});

describe("buildSearchIndex", () => {
  const index = buildSearchIndex(makeInput());

  it("조에도 방에도 없는 학생은 인덱스에 넣지 않는다", () => {
    expect(index.some(e => e.id === "student:1_999")).toBe(false);
  });

  it("학생 카드에 조·숙소·버스를 한 번에 담는다 (이름→숙소 한 번에 보기)", () => {
    const entry = find(index, "student:1_101");
    expect(entry.title).toBe("김현민");
    expect(factValue(entry, "조")).toBe("1조");
    expect(factValue(entry, "숙소")).toBe("별관 201호");
    expect(factValue(entry, "버스")).toBe("1일차 1호차");
  });

  it("숙소가 없으면 '배정 없음'으로 표시하고 빠뜨리지 않는다", () => {
    const entry = find(index, "student:1_103");
    expect(factValue(entry, "숙소")).toBe("배정 없음");
  });

  it("취소 학생과 부분참 학생에 배지를 붙인다", () => {
    expect(find(index, "student:1_104").badges).toContain("취소");
    expect(find(index, "student:1_103").badges).toContain("후발대");
  });

  it("취소 학생은 조·방 인원 수에서 제외한다 (다른 화면과 같은 기준)", () => {
    expect(factValue(find(index, "group:g1"), "학생")).toBe("2명");
    expect(factValue(find(index, "room:r1"), "학생")).toBe("김현민");
  });

  it("교사는 자차·담당 조를 표시하고, 스탭은 교사 항목으로 중복 생성하지 않는다", () => {
    const teacher = find(index, "teacher:t1");
    expect(teacher.badges).toContain("자차");
    expect(factValue(teacher, "담당 조")).toBe("1조");
    expect(index.some(e => e.id === "teacher:s1")).toBe(false);
    expect(index.some(e => e.id === "staff:s1")).toBe(true);
  });

  it("스탭의 담당 조는 groupStaff 배정에서 가져온다", () => {
    expect(factValue(find(index, "staff:s1"), "담당 조")).toBe("1조");
  });

  // 실제 피드백 사고 재발 방지: "2호차에 선생님 타는 명단에 올라가있는데 실제로는 자차 이동"
  it("🚌 자차·불참 교사에게 호차를 표시하지 않는다", () => {
    const teacher = find(index, "teacher:t1"); // 이교사 = 자차
    expect(teacher.badges).toContain("자차");
    expect(factValue(teacher, "버스")).toBe("단체버스 미탑승");
  });

  it("🚌 취소 학생에게 호차를 표시하지 않는다 (다른 화면과 동일 기준)", () => {
    const cancelled = find(index, "student:1_104");
    expect(cancelled.badges).toContain("취소");
    expect(factValue(cancelled, "버스")).toBeUndefined();
    // 취소가 아닌 같은 조 학생에게는 정상 표시된다
    expect(factValue(find(index, "student:1_101"), "버스")).toBe("1일차 1호차");
  });

  it("🔒 민감정보(연락처·주민번호)를 인덱스에 담지 않는다", () => {
    const withSensitive = buildSearchIndex(makeInput({
      students: {
        ...students,
        "1_101": { ...students["1_101"], phone: "010-1234-5678", pPhone: "010-8765-4321" },
      },
      adminTeachers: [{ ...adminTeachers[0], idNumber: "900101-1234567" }, adminTeachers[1]],
    }));
    const serialized = JSON.stringify(withSensitive);
    expect(serialized).not.toContain("010-1234-5678");
    expect(serialized).not.toContain("010-8765-4321");
    expect(serialized).not.toContain("900101-1234567");
  });
});

describe("searchIndex", () => {
  const index = buildSearchIndex(makeInput());

  it("빈 질의는 아무것도 반환하지 않는다", () => {
    expect(searchIndex(index, "")).toEqual([]);
    expect(searchIndex(index, "   ")).toEqual([]);
  });

  it("이름 일부로 찾는다", () => {
    const titles = searchIndex(index, "현민").map(e => e.title);
    expect(titles).toContain("김현민");
  });

  it("초성으로 찾는다 — 동명 초성은 모두 나온다", () => {
    const ids = searchIndex(index, "ㄱㅎ").map(e => e.id);
    expect(ids).toContain("student:1_101"); // 김현민
    expect(ids).toContain("student:1_102"); // 김현수
  });

  it("초성이 정확히 일치하면 더 위에 온다", () => {
    const results = searchIndex(index, "ㅂㅅㅇ");
    expect(results[0].title).toBe("박세원");
  });

  it("조 번호로 조를 바로 찾는다 (긴 목록 스크롤 대체)", () => {
    const ids = searchIndex(index, "2조").map(e => e.id);
    expect(ids).toContain("group:g2");
  });

  it("호실 번호로 방을 찾는다", () => {
    const ids = searchIndex(index, "305").map(e => e.id);
    expect(ids).toContain("room:r2");
  });

  it("호차로 버스를 찾는다", () => {
    const ids = searchIndex(index, "1호차").map(e => e.id);
    expect(ids).toContain("bus:b1");
  });

  it("sf 꼬리표가 붙은 스탭도 이름만으로 찾는다", () => {
    const ids = searchIndex(index, "최스탭").map(e => e.id);
    expect(ids).toContain("staff:s1");
  });

  it("같은 점수면 사람을 조·방·호차보다 먼저 보여준다", () => {
    const results = searchIndex(index, "김현");
    expect(results[0].kind).toBe("student");
  });

  it("limit을 넘지 않는다", () => {
    expect(searchIndex(index, "김", 1).length).toBe(1);
  });
});
