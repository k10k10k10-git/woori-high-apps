import { describe, it, expect } from "vitest";
import { runAutoAssign, scoreGroups, RuleFlags, ConflictPair, ClassUnit } from "./autoAssignUtils";
import { Group, Participant, TeacherAttendance } from "@/lib/types";

// ── 헬퍼 ──────────────────────────────────────────────────────────────
// 1부 참가자 1명 (홀수반=남, 짝수반=여 — buildClassUnits 규칙과 일치)
function mkP(studentId: string, name: string, grade: number, cls: number): Participant {
  return { name, gender: cls % 2 === 0 ? "여" : "남", grade, class: cls, bu: "1부", studentId, registeredAt: "" };
}

// 1부 반 담당 교사 1명 (classKey는 "N학년 M반" — parseClassKey 규칙과 일치)
function mkT(name: string, grade: number, cls: number, status: TeacherAttendance["status"] = "전참"): TeacherAttendance {
  return { id: name, name, bu: "1부", classKey: `${grade}학년 ${cls}반`, status };
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
  opts: {
    studentConflicts?: ConflictPair[]; classConflicts?: ConflictPair[];
    teacherConflicts?: ConflictPair[]; teachers?: TeacherAttendance[];
  } = {},
) {
  const empty: string[] = Array(groupCount).fill("");
  const pinned: (string | null)[] = Array(groupCount).fill(null);
  return runAutoAssign(
    groupCount, 0, rules,
    opts.studentConflicts ?? [], opts.teacherConflicts ?? [], [], opts.classConflicts ?? [],
    participants, opts.teachers ?? [], {},
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

  it("교사 고려 관계: 두 교사는 같은 조에 들어가지 않는다", () => {
    // 1학년1반(s1,T1) ↔ 1학년3반(s3,T3) 교사 분리 — 두 반이 다른 조로 가야 함
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s2: mkP("s2", "나", 1, 2),
      s3: mkP("s3", "다", 1, 3), s4: mkP("s4", "라", 1, 4),
    };
    const groups = run(2, participants, mkRules({ applyConflicts: true, assignTeachers: true }), {
      teachers: [mkT("T1", 1, 1), mkT("T3", 1, 3)],
      teacherConflicts: [{ a: "T1", b: "T3" }],
    });
    expect(groupOf(groups, "s1")!.id).not.toBe(groupOf(groups, "s3")!.id);
  });

  it("최대 인원: 어떤 조도 maxGroupSize를 넘지 않는다", () => {
    // 반 4개(각 2명) → 8명, 조 2, 상한 4 → 조당 정확히 2반
    const participants: Record<string, Participant> = {
      a1: mkP("a1", "가", 1, 1), a2: mkP("a2", "각", 1, 1),
      b1: mkP("b1", "나", 1, 2), b2: mkP("b2", "낙", 1, 2),
      c1: mkP("c1", "다", 1, 3), c2: mkP("c2", "닥", 1, 3),
      d1: mkP("d1", "라", 1, 4), d2: mkP("d2", "락", 1, 4),
    };
    const groups = run(2, participants, mkRules({ maxGroupSize: 4 }));
    groups.forEach(g => expect(g.studentIds.length).toBeLessThanOrEqual(4));
  });

  it("남녀 혼성: 학생이 있는 조는 남·여 반을 모두 포함한다", () => {
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s2: mkP("s2", "나", 1, 2),
      s3: mkP("s3", "다", 1, 3), s4: mkP("s4", "라", 1, 4),
    };
    const groups = run(2, participants, mkRules({ mixGender: true }));
    groups.filter(g => g.studentIds.length > 0).forEach(g => {
      const parities = new Set(g.studentIds.map(sid => participants[sid].class % 2));
      expect(parities.has(0)).toBe(true); // 짝수반=여
      expect(parities.has(1)).toBe(true); // 홀수반=남
    });
  });

  it("동성 구성: 한 조에 두 성별이 섞이지 않는다", () => {
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s2: mkP("s2", "나", 1, 2),
      s3: mkP("s3", "다", 1, 3), s4: mkP("s4", "라", 1, 4),
    };
    const groups = run(2, participants, mkRules({ sameGender: true }));
    groups.filter(g => g.studentIds.length > 0).forEach(g => {
      const parities = new Set(g.studentIds.map(sid => participants[sid].class % 2));
      expect(parities.size).toBe(1);
    });
  });

  it("전참 교사 보장: 학생이 있는 각 조에 전참 교사가 1명 이상 있다", () => {
    // 전참 반 2개(class1,3) + 부분참 반 2개(class2,4), 조 2 → 각 조가 전참 반 1개씩 확보 가능
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s2: mkP("s2", "나", 1, 2),
      s3: mkP("s3", "다", 1, 3), s4: mkP("s4", "라", 1, 4),
    };
    const teachers = [mkT("T1", 1, 1, "전참"), mkT("T2", 1, 2, "부분참"), mkT("T3", 1, 3, "전참"), mkT("T4", 1, 4, "부분참")];
    const statusOf = new Map(teachers.map(t => [t.name, t.status]));
    const groups = run(2, participants, mkRules({ requireFullTimer: true, assignTeachers: true }), { teachers });
    groups.filter(g => g.studentIds.length > 0).forEach(g => {
      expect(g.teachers.some(tn => statusOf.get(tn) === "전참")).toBe(true);
    });
  });
});

// ── scoreGroups 직접 회귀 (#1: 교사↔교사 고려 관계가 최종 판정에서 누락됐던 버그) ──
describe("scoreGroups — 교사 고려 관계 하드 판정", () => {
  const bu = "1부";
  const mkU = (grade: number, cls: number, sid: string, name: string): ClassUnit => ({
    key: `${bu}_${grade}_${cls}`, bu, grade, classNum: cls,
    gender: cls % 2 === 0 ? "여" : "남", studentIds: [sid], names: [name],
  });
  const mkG = (id: string, studentIds: string[]): Group => ({
    id, name: id, bu, teachers: [], leader: "", staff: "", studentIds,
  });
  const units = [mkU(1, 1, "s1", "가"), mkU(1, 2, "s2", "나")];
  const teachers = [mkT("T1", 1, 1), mkT("T2", 1, 2)];
  const rules = mkRules({ applyConflicts: true });
  const conflict: ConflictPair[] = [{ a: "T1", b: "T2" }];

  it("두 교사 반이 같은 조면 하드 페널티", () => {
    const groups = [mkG("gA", ["s1", "s2"]), mkG("gB", [])];
    const score = scoreGroups(groups, units, [], conflict, [], [], rules, teachers);
    expect(score).toBeLessThanOrEqual(-1_000_000);
  });

  it("두 교사 반이 다른 조면 페널티 없음", () => {
    const groups = [mkG("gA", ["s1"]), mkG("gB", ["s2"])];
    const score = scoreGroups(groups, units, [], conflict, [], [], rules, teachers);
    expect(score).toBe(0);
  });
});
