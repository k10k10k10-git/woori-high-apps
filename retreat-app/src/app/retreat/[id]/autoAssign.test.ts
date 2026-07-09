import { describe, it, expect } from "vitest";
import { runAutoAssign, RuleFlags, ConflictPair } from "./autoAssignUtils";
import { Participant, TeacherAttendance } from "@/lib/types";

// ── 헬퍼 ──────────────────────────────────────────────────────────────
// 1부 참가자 1명 (홀수반=남, 짝수반=여 — buildClassUnits 규칙과 일치)
function mkP(studentId: string, name: string, grade: number, cls: number): Participant {
  return { name, gender: cls % 2 === 0 ? "여" : "남", grade, class: cls, bu: "1부", studentId, registeredAt: "" };
}

function mkRules(over: Partial<RuleFlags>): RuleFlags {
  return {
    assignTeachers: false, requireFullTimer: false, pinLeaders: false, applyConflicts: false,
    mixGender: false, sameGender: false, balanceGrade: false, balanceSize: false,
    minTwoClasses: false, maxGroupSize: 0, ...over,
  };
}

function run(
  groupCount: number,
  participants: Record<string, Participant>,
  rules: RuleFlags,
  opts: { studentConflicts?: ConflictPair[]; classConflicts?: ConflictPair[] } = {},
) {
  const empty: string[] = Array(groupCount).fill("");
  const pinned: (string | null)[] = Array(groupCount).fill(null);
  return runAutoAssign(
    groupCount, 0, rules,
    opts.studentConflicts ?? [], [], [], opts.classConflicts ?? [],
    participants, [] as TeacherAttendance[], {},
    pinned, [], empty, empty,
  );
}

const groupOf = (groups: ReturnType<typeof run>, sid: string) =>
  groups.find(g => g.studentIds.includes(sid));

describe("runAutoAssign — 하드 제약", () => {
  it("학생 고려 관계: 두 학생은 절대 같은 조에 들어가지 않는다", () => {
    const participants = { s1: mkP("s1", "가", 1, 1), s2: mkP("s2", "나", 1, 2) };
    const groups = run(2, participants, mkRules({ applyConflicts: true }), {
      studentConflicts: [{ a: "가", b: "나" }],
    });
    const g1 = groupOf(groups, "s1"), g2 = groupOf(groups, "s2");
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();
    expect(g1!.id).not.toBe(g2!.id);
  });

  it("반 고려 관계: 두 반은 절대 같은 조에 들어가지 않는다", () => {
    // 1부 1학년 1반(s1) ↔ 1부 1학년 2반(s2) 분리
    const participants = { s1: mkP("s1", "가", 1, 1), s2: mkP("s2", "나", 1, 2) };
    const groups = run(2, participants, mkRules({ applyConflicts: true }), {
      classConflicts: [{ a: "1부_1_1", b: "1부_1_2" }],
    });
    const g1 = groupOf(groups, "s1"), g2 = groupOf(groups, "s2");
    expect(g1!.id).not.toBe(g2!.id);
  });

  it("최소 2반: 각 조는 서로 다른 반이 2개 이상이다 (반 4·조 2)", () => {
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s2: mkP("s2", "나", 1, 2),
      s3: mkP("s3", "다", 1, 3), s4: mkP("s4", "라", 1, 4),
    };
    const groups = run(2, participants, mkRules({ minTwoClasses: true }));
    groups.filter(g => g.studentIds.length > 0).forEach(g => {
      // 이 조에 속한 학생들의 서로 다른 반(unitKey) 개수
      const classes = new Set(g.studentIds.map(sid => participants[sid].class));
      expect(classes.size).toBeGreaterThanOrEqual(2);
    });
  });

  it("규칙 없이도 같은 반 학생은 항상 같은 조 (반 단위 배정 불변식)", () => {
    // 같은 반(1학년 1반) 두 학생은 분리 요청이 없으면 늘 함께
    const participants = { s1: mkP("s1", "가", 1, 1), s2: mkP("s2", "나", 1, 1) };
    const groups = run(2, participants, mkRules({}));
    expect(groupOf(groups, "s1")!.id).toBe(groupOf(groups, "s2")!.id);
  });
});
