import { describe, it, expect } from "vitest";
import { normalizeName, stripSuffix, findStudent } from "./studentMatcher";
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
});
