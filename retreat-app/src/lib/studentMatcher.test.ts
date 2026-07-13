import { describe, it, expect } from "vitest";
import { normalizeName, stripSuffix, findStudent, resolveStudentKey } from "./studentMatcher";
import type { Participant, Student } from "./types";

// ── helpers ──────────────────────────────────────────────────
function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    name: "홍길동",
    gender: "남",
    grade: 1,
    class: 1,
    bu: "1부",
    registeredAt: "2024-01-01",
    ...overrides,
  };
}

function makeStudent(overrides: Partial<Student> & { id: string; name: string }): Student {
  return {
    num: 1,
    grade: 1,
    class: 1,
    birth: "2010-01-01",
    phone: "010-0000-0000",
    pPhone: "010-0000-0001",
    addr: "서울",
    photo: "",
    school: "중학교",
    ...overrides,
  };
}

function studentsRecord(...list: Student[]): Record<string, Student> {
  const rec: Record<string, Student> = {};
  for (const s of list) rec[s.id] = s;
  return rec;
}

// ── normalizeName ────────────────────────────────────────────
describe("normalizeName", () => {
  it("removes leading digits (학번)", () => {
    expect(normalizeName("217이예준")).toBe("이예준");
  });

  it("removes whitespace", () => {
    expect(normalizeName("전 진")).toBe("전진");
  });

  it("removes leading digits AND whitespace", () => {
    expect(normalizeName("123 김 철 수")).toBe("김철수");
  });

  it("returns name unchanged when no digits or spaces", () => {
    expect(normalizeName("이예준")).toBe("이예준");
  });

  it("handles empty string", () => {
    expect(normalizeName("")).toBe("");
  });
});

// ── stripSuffix ──────────────────────────────────────────────
describe("stripSuffix", () => {
  it("removes trailing uppercase letter after hangul", () => {
    expect(stripSuffix("김철수A")).toBe("김철수");
  });

  it("returns name unchanged when no suffix", () => {
    expect(stripSuffix("김철수")).toBe("김철수");
  });

  it("does not strip English names (no hangul before last char)", () => {
    expect(stripSuffix("JOHN")).toBe("JOHN");
  });

  it("removes only the last uppercase letter", () => {
    expect(stripSuffix("이예준B")).toBe("이예준");
  });

  it("does not remove lowercase suffix", () => {
    expect(stripSuffix("김철수a")).toBe("김철수a");
  });
});

// ── findStudent ──────────────────────────────────────────────
describe("findStudent", () => {
  it("matches exact name + grade + class (priority 1)", () => {
    const s = makeStudent({ id: "s1", name: "홍길동", grade: 1, class: 1, buNum: 1 });
    const p = makeParticipant({ name: "홍길동", grade: 1, class: 1, bu: "1부" });
    expect(findStudent(p, studentsRecord(s))).toEqual(s);
  });

  it("matches with normalized name + grade + class (priority 3)", () => {
    const s = makeStudent({ id: "s1", name: "이예준", grade: 2, class: 3, buNum: 1 });
    const p = makeParticipant({ name: "217이예준", grade: 2, class: 3, bu: "1부" });
    expect(findStudent(p, studentsRecord(s))).toEqual(s);
  });

  it("matches with stripped suffix + grade + class (priority 5)", () => {
    const s = makeStudent({ id: "s1", name: "김철수A", grade: 1, class: 2, buNum: 1 });
    const p = makeParticipant({ name: "김철수", grade: 1, class: 2, bu: "1부" });
    expect(findStudent(p, studentsRecord(s))).toEqual(s);
  });

  it("returns undefined when no match", () => {
    const s = makeStudent({ id: "s1", name: "박영희", grade: 1, class: 1, buNum: 1 });
    const p = makeParticipant({ name: "최민수", grade: 2, class: 2, bu: "1부" });
    expect(findStudent(p, studentsRecord(s))).toBeUndefined();
  });

  it("does not match duplicate names without grade/class", () => {
    const s1 = makeStudent({ id: "s1", name: "홍길동", grade: 1, class: 1, buNum: 1 });
    const s2 = makeStudent({ id: "s2", name: "홍길동", grade: 2, class: 2, buNum: 1 });
    // grade=0 means unknown grade — should not match when duplicates exist
    const p = makeParticipant({ name: "홍길동", grade: 0, class: 0, bu: "1부" });
    expect(findStudent(p, studentsRecord(s1, s2))).toBeUndefined();
  });

  it("filters by bu (1부 vs 2부)", () => {
    const s1 = makeStudent({ id: "s1", name: "홍길동", grade: 1, class: 1, buNum: 1 });
    const s2 = makeStudent({ id: "s2", name: "홍길동", grade: 1, class: 1, buNum: 2 });
    const p = makeParticipant({ name: "홍길동", grade: 1, class: 1, bu: "2부" });
    expect(findStudent(p, studentsRecord(s1, s2))).toEqual(s2);
  });

  it("falls back to name + grade when class is wrong", () => {
    const s = makeStudent({ id: "s1", name: "이영희", grade: 1, class: 1, buNum: 1 });
    const p = makeParticipant({ name: "이영희", grade: 1, class: 9, bu: "1부" });
    expect(findStudent(p, studentsRecord(s))?.id).toBe("s1");
  });

  it("falls back to name only when grade is wrong but name is unique", () => {
    const s = makeStudent({ id: "s1", name: "이영희", grade: 1, class: 1, buNum: 1 });
    const p = makeParticipant({ name: "이영희", grade: 3, class: 1, bu: "1부" });
    expect(findStudent(p, studentsRecord(s))?.id).toBe("s1");
  });

  it("matches suffix-duplicate names by class", () => {
    const s1 = makeStudent({ id: "s1", name: "박지민A", grade: 2, class: 1, buNum: 1 });
    const s2 = makeStudent({ id: "s2", name: "박지민B", grade: 2, class: 2, buNum: 1 });
    const p = makeParticipant({ name: "박지민", grade: 2, class: 1, bu: "1부" });
    expect(findStudent(p, studentsRecord(s1, s2))?.id).toBe("s1");
  });

  it("BUG-1: rejects suffix-duplicate names when class is also wrong (non-deterministic match)", () => {
    const s1 = makeStudent({ id: "s1", name: "박지민A", grade: 2, class: 1, buNum: 1 });
    const s2 = makeStudent({ id: "s2", name: "박지민B", grade: 2, class: 2, buNum: 1 });
    const p = makeParticipant({ name: "박지민", grade: 2, class: 9, bu: "1부" });
    expect(findStudent(p, studentsRecord(s1, s2))).toBeUndefined();
  });

  it("BUG-1: match rejection is independent of DB record order", () => {
    const s1 = makeStudent({ id: "s1", name: "박지민A", grade: 2, class: 1, buNum: 1 });
    const s2 = makeStudent({ id: "s2", name: "박지민B", grade: 2, class: 2, buNum: 1 });
    const p = makeParticipant({ name: "박지민", grade: 2, class: 9, bu: "1부" });
    const reversed = studentsRecord(s2, s1);
    expect(findStudent(p, reversed)).toBeUndefined();
  });

  it("matches when DB name has a student-number prefix but form name is clean", () => {
    const s = makeStudent({ id: "s1", name: "215최수아", grade: 3, class: 4, buNum: 1 });
    const p = makeParticipant({ name: "최수아", grade: 3, class: 4, bu: "1부" });
    expect(findStudent(p, studentsRecord(s))?.id).toBe("s1");
  });

  it("matches when DB name has internal whitespace but form name does not", () => {
    const s = makeStudent({ id: "s1", name: "한 별", grade: 1, class: 2, buNum: 1 });
    const p = makeParticipant({ name: "한별", grade: 1, class: 2, bu: "1부" });
    expect(findStudent(p, studentsRecord(s))?.id).toBe("s1");
  });

  it("searches across all bu when participant has no bu info", () => {
    const s = makeStudent({ id: "s1", name: "이영희", grade: 1, class: 1, buNum: 1 });
    const p = makeParticipant({ name: "이영희", grade: 1, class: 1, bu: "" });
    expect(findStudent(p, studentsRecord(s))?.id).toBe("s1");
  });

  it("matches by name only when grade/class are both unfilled (0) and name is unique", () => {
    const s = makeStudent({ id: "s1", name: "이영희", grade: 1, class: 1, buNum: 1 });
    const p = makeParticipant({ name: "이영희", grade: 0, class: 0, bu: "1부" });
    expect(findStudent(p, studentsRecord(s))?.id).toBe("s1");
  });

  it("disambiguates same-bu duplicate names by grade", () => {
    const s1 = makeStudent({ id: "s1", name: "정다은", grade: 1, class: 1, buNum: 1 });
    const s2 = makeStudent({ id: "s2", name: "정다은", grade: 2, class: 3, buNum: 1 });
    const p = makeParticipant({ name: "정다은", grade: 2, class: 3, bu: "1부" });
    expect(findStudent(p, studentsRecord(s1, s2))?.id).toBe("s2");
  });

  it("fails to match same-bu duplicate names when no disambiguating info is given", () => {
    const s1 = makeStudent({ id: "s1", name: "정다은", grade: 1, class: 1, buNum: 1 });
    const s2 = makeStudent({ id: "s2", name: "정다은", grade: 2, class: 3, buNum: 1 });
    const p = makeParticipant({ name: "정다은", grade: 0, class: 0, bu: "1부" });
    expect(findStudent(p, studentsRecord(s1, s2))).toBeUndefined();
  });
});

// ── resolveStudentKey (셀색상·부분참 키 해석) ──────────────────
describe("resolveStudentKey", () => {
  it("uses the stored studentId prefixed by bu", () => {
    const p = makeParticipant({ name: "김민하", grade: 3, class: 2, bu: "2부", studentId: "abc123" });
    expect(resolveStudentKey(p, {})).toBe("2_abc123");
  });

  // 회귀: 이미 "${buNum}_..." 형식으로 저장된 studentId에 접두를 또 붙이면
  // "2_2_abc" 이중접두가 되어 셀색상 키와 어긋나 주황 학생이 통째로 사라졌다(2026-07-13).
  it("does not double-prefix a studentId already in bu-prefixed form", () => {
    const p = makeParticipant({ name: "김민하", grade: 3, class: 2, bu: "2부", studentId: "2_abc123" });
    expect(resolveStudentKey(p, {})).toBe("2_abc123");
  });

  // 핵심 회귀: studentId가 null이어도(자동 매칭 실패) 반 명단에서 이름으로 찾아
  // 신청자 취합 셀색상과 동일한 키를 돌려줘야 부분참석 탭에 뜬다.
  it("falls back to findStudent when studentId is missing (2026-07-13 버그)", () => {
    const s = makeStudent({ id: "rid9", name: "김민하", grade: 3, class: 2, buNum: 2 });
    const p = makeParticipant({ name: "김민하", grade: 3, class: 2, bu: "2부", studentId: null });
    // ClassRosterTab이 색칠 때 쓰는 키(`${cls.buNum}_${student.id}`)와 일치해야 한다.
    expect(resolveStudentKey(p, studentsRecord(s))).toBe("2_rid9");
  });

  it("returns null when the participant cannot be matched to any roster student", () => {
    const p = makeParticipant({ name: "없는사람", grade: 3, class: 2, bu: "2부", studentId: null });
    expect(resolveStudentKey(p, {})).toBeNull();
  });
});
