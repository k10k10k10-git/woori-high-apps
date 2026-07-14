import { describe, it, expect } from "vitest";
import { calculateEvenGroupCountsForMaxSize, ensureEvenCombinedGroupCounts, ensureEvenScopedGroupCount, improveGroupsByWholeUnitMoves, mergeAutoAssignedGroups, runAutoAssign, scoreGroups, validateClassRelations, RuleFlags, ConflictPair, ClassUnit, LeaderEntry } from "./autoAssignUtils";
import { Group, Participant, TeacherAttendance } from "@/lib/types";

// ── 헬퍼 ──────────────────────────────────────────────────────────────
// 1부 참가자 1명 (홀수반=남, 짝수반=여 — buildClassUnits 규칙과 일치)
function mkP(studentId: string, name: string, grade: number, cls: number, bu = "1부"): Participant {
  return { name, gender: cls % 2 === 0 ? "여" : "남", grade, class: cls, bu, studentId, registeredAt: "" };
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
    studentConflicts?: ConflictPair[]; classConflicts?: ConflictPair[]; classAffinities?: ConflictPair[];
    teacherConflicts?: ConflictPair[]; teachers?: TeacherAttendance[]; pinned?: (string | null)[];
    leaders?: LeaderEntry[];
  } = {},
) {
  const pinned: (string | null)[] = opts.pinned ?? Array(groupCount).fill(null);
  const leaders: LeaderEntry[] = opts.leaders ?? pinned.map(key => {
    if (!key) return { name: "", grade: "", cls: "", studentId: "", mode: "withClass" };
    const [, grade, cls] = key.split("_");
    const match = Object.values(participants).find(p => p.grade === Number(grade) && p.class === Number(cls));
    return {
      name: match?.name ?? "",
      grade,
      cls,
      studentId: match?.studentId ?? "",
      mode: "withClass",
    };
  });
  return runAutoAssign(
    groupCount, 0, rules,
    opts.studentConflicts ?? [], opts.teacherConflicts ?? [], [], opts.classConflicts ?? [], opts.classAffinities ?? [],
    participants, opts.teachers ?? [], {},
    leaders, [],
  );
}

const groupOf = (groups: ReturnType<typeof run>, sid: string) =>
  groups.find(g => g.studentIds.includes(sid));

describe("1·2부 합산 조 수 짝수 보정", () => {
  it("조당 최대 12명 자동 계산은 11+10을 화면 표시 전 12+10으로 보정한다", () => {
    expect(calculateEvenGroupCountsForMaxSize({
      maxGroupSize: 12,
      maxGroups1: 25,
      maxGroups2: 25,
      studentCount1bu: 123,
      studentCount2bu: 111,
    })).toEqual({ groupCount1bu: 12, groupCount2bu: 10 });
  });

  it("합계가 홀수면 더 붐비고 상한 여유가 있는 부서의 조를 하나 늘린다", () => {
    expect(ensureEvenCombinedGroupCounts({
      groupCount1bu: 10, groupCount2bu: 9,
      maxGroups1: 25, maxGroups2: 25,
      studentCount1bu: 123, studentCount2bu: 111,
    })).toEqual({ groupCount1bu: 10, groupCount2bu: 10 });
  });

  it("양쪽 모두 상한이면 덜 붐비는 부서의 조를 하나 줄인다", () => {
    expect(ensureEvenCombinedGroupCounts({
      groupCount1bu: 10, groupCount2bu: 9,
      maxGroups1: 10, maxGroups2: 9,
      studentCount1bu: 100, studentCount2bu: 108,
    })).toEqual({ groupCount1bu: 9, groupCount2bu: 9 });
  });

  it("학생이 없는 부서는 합계와 보정 대상에서 제외한다", () => {
    expect(ensureEvenCombinedGroupCounts({
      groupCount1bu: 9, groupCount2bu: 10,
      maxGroups1: 12, maxGroups2: 0,
      studentCount1bu: 90, studentCount2bu: 0,
    })).toEqual({ groupCount1bu: 10, groupCount2bu: 0 });
  });

  it("자동배정 핵심 함수도 홀수 입력을 짝수 개 조로 보정한다", () => {
    const participants = {
      a1: mkP("a1", "가", 1, 1),
      a2: mkP("a2", "나", 1, 2),
      b1: mkP("b1", "다", 1, 1, "2부"),
    };
    const groups = runAutoAssign(
      2, 1, mkRules({}), [], [], [], [], [], participants, [], {}, [], [],
    );
    expect(groups).toHaveLength(2);
    expect(groups.length % 2).toBe(0);
  });
});

describe("부서별 자동 조편성", () => {
  const group = (id: string, bu: "1부" | "2부", studentIds: string[]): Group => ({
    id, name: id, bu, teachers: [], leader: "", staff: "", studentIds,
  });

  it("1부만 다시 편성할 때 현재 2부 조 수를 유지하며 합산 짝수를 맞춘다", () => {
    expect(ensureEvenScopedGroupCount({
      requestedCount: 11,
      maxGroups: 12,
      studentCount: 123,
      preservedOtherGroupCount: 10,
    })).toBe(12);
  });

  it("증가할 수 없으면 선택 부서 조 수를 하나 줄이고 반대 부서는 건드리지 않는다", () => {
    expect(ensureEvenScopedGroupCount({
      requestedCount: 11,
      maxGroups: 11,
      studentCount: 123,
      preservedOtherGroupCount: 10,
    })).toBe(10);
  });

  it("1부만 실행하면 결과에 2부 조를 새로 만들지 않는다", () => {
    const participants: Record<string, Participant> = {
      oneA: mkP("oneA", "일부가", 1, 1, "1부"),
      oneB: mkP("oneB", "일부나", 1, 2, "1부"),
      twoA: mkP("twoA", "이부가", 1, 1, "2부"),
      twoB: mkP("twoB", "이부나", 1, 2, "2부"),
    };
    const groups = runAutoAssign(
      2, 2, mkRules({}), [], [], [], [], [], participants, [], {}, [], [], "1부", 2,
    );

    expect(groups).toHaveLength(2);
    expect(groups.every(item => item.bu === "1부")).toBe(true);
    expect(groups.flatMap(item => item.studentIds).sort()).toEqual(["oneA", "oneB"]);
  });

  it("2부만 실행하면 결과에 1부 조를 새로 만들지 않는다", () => {
    const participants: Record<string, Participant> = {
      oneA: mkP("oneA", "일부가", 1, 1, "1부"),
      oneB: mkP("oneB", "일부나", 1, 2, "1부"),
      twoA: mkP("twoA", "이부가", 1, 1, "2부"),
      twoB: mkP("twoB", "이부나", 1, 2, "2부"),
    };
    const groups = runAutoAssign(
      2, 2, mkRules({}), [], [], [], [], [], participants, [], {}, [], [], "2부", 2,
    );

    expect(groups).toHaveLength(2);
    expect(groups.every(item => item.bu === "2부")).toBe(true);
    expect(groups.flatMap(item => item.studentIds).sort()).toEqual(["twoA", "twoB"]);
  });

  it("1부 결과를 적용해도 현재 2부의 교사·조장·학생 수정 내용은 그대로 보존한다", () => {
    const currentOne = group("old-one", "1부", ["old-1"]);
    const currentTwo = {
      ...group("keep-two", "2부", ["keep-2"]),
      teachers: ["유지교사"],
      leader: "유지조장",
      gbs: "유지장소",
    };
    const generatedOne = group("new-one", "1부", ["new-1"]);

    const merged = mergeAutoAssignedGroups([currentOne, currentTwo], [generatedOne], "1부");

    expect(merged).toEqual([generatedOne, currentTwo]);
    expect(merged.find(item => item.bu === "2부")).toBe(currentTwo);
  });
});

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

  it("조 수만큼 배정 가능한 반 묶음이 있으면 모든 조에 최소 한 반이 들어간다", () => {
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s2: mkP("s2", "나", 1, 2),
      s3: mkP("s3", "다", 1, 3), s4: mkP("s4", "라", 1, 4),
    };
    const groups = run(4, participants, mkRules({ balanceSize: true }));
    expect(groups).toHaveLength(4);
    groups.forEach(group => expect(group.studentIds.length).toBeGreaterThan(0));
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

describe("runAutoAssign — 파송 조장", () => {
  const emptyLeader = (): LeaderEntry => ({ name: "", grade: "", cls: "", studentId: "", mode: "withClass" });

  it("체크하지 않은 조장은 기본으로 본인 반 전체와 목표 조에 고정된다", () => {
    const participants: Record<string, Participant> = {
      leader: mkP("leader", "조장", 1, 1),
      mate: mkP("mate", "반친구", 1, 1),
      other: mkP("other", "다른반", 1, 2),
    };
    const leaders = [
      emptyLeader(),
      { name: "조장", grade: "1", cls: "1", studentId: "leader", mode: "withClass" as const },
    ];
    const groups = run(2, participants, mkRules({ pinLeaders: true }), { leaders });
    expect(groupOf(groups, "leader")?.name).toBe("2조");
    expect(groupOf(groups, "mate")?.name).toBe("2조");
  });

  it("파송 체크한 조장만 본인 반에서 분리되고 본인 반은 파송 조에 들어가지 않는다", () => {
    const participants: Record<string, Participant> = {
      leader: mkP("leader", "파송조장", 1, 1),
      mate1: mkP("mate1", "반친구1", 1, 1),
      mate2: mkP("mate2", "반친구2", 1, 1),
      other: mkP("other", "다른반", 1, 2),
    };
    const leaders = [
      emptyLeader(),
      { name: "파송조장", grade: "1", cls: "1", studentId: "leader", mode: "sent" as const },
    ];
    const groups = run(2, participants, mkRules({ pinLeaders: true, balanceSize: true }), { leaders });
    const sentGroup = groupOf(groups, "leader")!;
    expect(sentGroup.name).toBe("2조");
    expect(sentGroup.leader).toBe("파송조장");
    expect(groupOf(groups, "mate1")?.id).toBe(groupOf(groups, "mate2")?.id);
    expect(groupOf(groups, "mate1")?.id).not.toBe(sentGroup.id);
    expect(groups.filter(g => g.studentIds.includes("leader"))).toHaveLength(1);
  });

  it("같은 반 조장 중 한 명만 파송이면 본인반 동반 조장과 반은 함께, 파송 조장만 다른 조", () => {
    const participants: Record<string, Participant> = {
      withClass: mkP("withClass", "동반조장", 1, 1),
      sent: mkP("sent", "파송조장", 1, 1),
      mate: mkP("mate", "반친구", 1, 1),
      other: mkP("other", "다른반", 1, 2),
    };
    const leaders: LeaderEntry[] = [
      { name: "동반조장", grade: "1", cls: "1", studentId: "withClass", mode: "withClass" },
      { name: "파송조장", grade: "1", cls: "1", studentId: "sent", mode: "sent" },
    ];
    const groups = run(2, participants, mkRules({ pinLeaders: true }), { leaders });
    expect(groupOf(groups, "withClass")?.name).toBe("1조");
    expect(groupOf(groups, "mate")?.name).toBe("1조");
    expect(groupOf(groups, "sent")?.name).toBe("2조");
  });

  it("혼성 규칙에서도 파송 조장만 있는 조에 실제 반이 최소 하나 배정된다", () => {
    const participants: Record<string, Participant> = {
      withClass: mkP("withClass", "동반조장", 1, 1),
      female1: mkP("female1", "여학생1", 1, 2),
      female2: mkP("female2", "여학생2", 1, 2),
      female3: mkP("female3", "여학생3", 1, 2),
      sent: mkP("sent", "파송조장", 1, 3),
      sentMate: mkP("sentMate", "파송반친구", 1, 3),
      otherFemale: mkP("otherFemale", "다른여학생", 1, 4),
      otherMale: mkP("otherMale", "다른남학생", 1, 5),
    };
    const leaders: LeaderEntry[] = [
      { name: "동반조장", grade: "1", cls: "1", studentId: "withClass", mode: "withClass" },
      { name: "파송조장", grade: "1", cls: "3", studentId: "sent", mode: "sent" },
    ];

    const groups = run(2, participants, mkRules({ pinLeaders: true, mixGender: true, balanceSize: true }), { leaders });
    const sentGroup = groupOf(groups, "sent")!;
    const nonLeaderStudents = sentGroup.studentIds.filter(id => id !== "sent");

    expect(sentGroup.name).toBe("2조");
    expect(nonLeaderStudents.length).toBeGreaterThan(0);
    expect(nonLeaderStudents.some(id => participants[id].class !== 3)).toBe(true);
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
    const score = scoreGroups(groups, units, [], conflict, [], [], [], rules, teachers);
    expect(score).toBeLessThanOrEqual(-1_000_000);
  });

  it("두 교사 반이 다른 조면 페널티 없음", () => {
    const groups = [mkG("gA", ["s1"]), mkG("gB", ["s2"])];
    const score = scoreGroups(groups, units, [], conflict, [], [], [], rules, teachers);
    expect(score).toBe(0);
  });

  it("붙임 관계: 두 반이 서로 다른 조면 하드 페널티 (방어망)", () => {
    const groups = [mkG("gA", ["s1"]), mkG("gB", ["s2"])];
    const affinity: ConflictPair[] = [{ a: "1부_1_1", b: "1부_1_2" }];
    const score = scoreGroups(groups, units, [], [], [], [], affinity, rules, []);
    expect(score).toBeLessThanOrEqual(-1_000_000);
  });

  it("파송 조장의 성별은 동성 판정에 포함하되 반 개수에는 포함하지 않는다", () => {
    const femaleUnit: ClassUnit = {
      key: "1부_1_2", bu, grade: 1, classNum: 2, gender: "여",
      studentIds: ["female"], names: ["여학생"],
    };
    const groups = [mkG("gA", ["sent-leader", "female"])];
    const sameGenderRules = mkRules({ sameGender: true });
    const withoutLeaderGender = scoreGroups(groups, [femaleUnit], [], [], [], [], [], sameGenderRules, []);
    const withLeaderGender = scoreGroups(
      groups, [femaleUnit], [], [], [], [], [], sameGenderRules, [],
      [{ groupIdx: 0, unitKey: "1부_1_1", gender: "남" }],
    );

    expect(withoutLeaderGender).toBe(0);
    expect(withLeaderGender).toBeLessThanOrEqual(-1_000_000);
  });

  it("혼성 조의 파송 조장에게는 본인 외 같은 성별 반이 최소 하나 필요하다", () => {
    const femaleUnit: ClassUnit = {
      key: "1부_1_2", bu, grade: 1, classNum: 2, gender: "여",
      studentIds: ["female"], names: ["여학생"],
    };
    const malePeerUnit: ClassUnit = {
      key: "1부_2_3", bu, grade: 2, classNum: 3, gender: "남",
      studentIds: ["male-peer"], names: ["남학생"],
    };
    const mixRules = mkRules({ mixGender: true });
    const sentLeader = [{ groupIdx: 0, unitKey: "1부_1_1", gender: "남" as const }];
    const leaderOnlyGender = scoreGroups(
      [mkG("gA", ["sent-leader", "female"])], [femaleUnit],
      [], [], [], [], [], mixRules, [], sentLeader,
    );
    const withMalePeer = scoreGroups(
      [mkG("gA", ["sent-leader", "female", "male-peer"])], [femaleUnit, malePeerUnit],
      [], [], [], [], [], mixRules, [], sentLeader,
    );

    expect(leaderOnlyGender).toBeLessThanOrEqual(-1_000_000);
    expect(withMalePeer).toBe(0);
  });
});

describe("자동배정 후 반 묶음 이동 보정", () => {
  const makeUnit = (key: string, gender: ClassUnit["gender"], count: number): ClassUnit => ({
    key, bu: "1부", grade: 1, classNum: Number(key.split("_").at(-1)), gender,
    studentIds: Array.from({ length: count }, (_, i) => `${key}_${i}`),
    names: Array.from({ length: count }, (_, i) => `${key}학생${i}`),
  });

  it("고정 반은 유지하면서 4명 조에 이동 가능한 반을 보태 인원 편차를 줄인다", () => {
    const fixedSmall = makeUnit("1부_1_1", "남", 4);
    const fixedLarge = makeUnit("1부_1_3", "남", 4);
    const movableMale = makeUnit("1부_2_5", "남", 3);
    const movableFemale = makeUnit("1부_2_6", "여", 4);
    const units = [fixedSmall, fixedLarge, movableMale, movableFemale];
    const groups: Group[] = [
      { id: "g1", name: "1조", bu: "1부", teachers: [], leader: "조장1", staff: "", studentIds: [...fixedSmall.studentIds] },
      { id: "g2", name: "2조", bu: "1부", teachers: [], leader: "조장2", staff: "", studentIds: [...fixedLarge.studentIds, ...movableMale.studentIds, ...movableFemale.studentIds] },
    ];

    const improved = improveGroupsByWholeUnitMoves(
      groups, units, [], [], [], [], [],
      mkRules({ minTwoClasses: true, mixGender: true, balanceSize: true, maxGroupSize: 12 }),
      [], [fixedSmall.key, fixedLarge.key], [],
    );

    expect(improved.map(group => group.studentIds.length).sort((a, b) => a - b)).toEqual([7, 8]);
    expect(improved[0].studentIds).toEqual(expect.arrayContaining(fixedSmall.studentIds));
    expect(improved[1].studentIds).toEqual(expect.arrayContaining(fixedLarge.studentIds));
    improved.forEach(group => expect(group.studentIds.length).toBeLessThanOrEqual(12));
  });
});

// ── 반 붙임(결합) 관계 — 번들 배정으로 구조 보장 ──────────────────────
describe("runAutoAssign — 반 붙임 관계", () => {
  it("붙임 쌍은 항상 같은 조에 배정된다", () => {
    // 남학생 반 4개(1·3·5·7반), 조 2 — 1반+5반 결합
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s3: mkP("s3", "나", 1, 3),
      s5: mkP("s5", "다", 1, 5), s7: mkP("s7", "라", 1, 7),
    };
    const groups = run(2, participants, mkRules({ applyConflicts: true, balanceSize: true }), {
      classAffinities: [{ a: "1부_1_1", b: "1부_1_5" }],
    });
    expect(groupOf(groups, "s1")!.id).toBe(groupOf(groups, "s5")!.id);
  });

  it("붙임으로 배정 가능한 번들이 줄면 조 수도 번들 수로 제한해 빈 조를 만들지 않는다", () => {
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s2: mkP("s2", "나", 1, 2),
      s3: mkP("s3", "다", 1, 3), s4: mkP("s4", "라", 1, 4),
    };
    const groups = run(4, participants, mkRules({ applyConflicts: true }), {
      classAffinities: [{ a: "1부_1_1", b: "1부_1_2" }, { a: "1부_1_3", b: "1부_1_4" }],
    });
    expect(groups).toHaveLength(2);
    groups.forEach(group => expect(group.studentIds.length).toBeGreaterThan(0));
  });

  it("연쇄 붙임(A+B, B+C)은 세 반 모두 한 조가 된다", () => {
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s3: mkP("s3", "나", 1, 3),
      s5: mkP("s5", "다", 1, 5), s7: mkP("s7", "라", 1, 7),
    };
    const groups = run(2, participants, mkRules({ applyConflicts: true, balanceSize: true }), {
      classAffinities: [{ a: "1부_1_1", b: "1부_1_3" }, { a: "1부_1_3", b: "1부_1_5" }],
    });
    const g1 = groupOf(groups, "s1")!.id;
    expect(groupOf(groups, "s3")!.id).toBe(g1);
    expect(groupOf(groups, "s5")!.id).toBe(g1);
  });

  it("붙임과 분리가 공존: A+B는 함께, A−C는 따로", () => {
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s3: mkP("s3", "나", 1, 3), s5: mkP("s5", "다", 1, 5),
    };
    const groups = run(2, participants, mkRules({ applyConflicts: true }), {
      classAffinities: [{ a: "1부_1_1", b: "1부_1_3" }],
      classConflicts: [{ a: "1부_1_1", b: "1부_1_5" }],
    });
    expect(groupOf(groups, "s1")!.id).toBe(groupOf(groups, "s3")!.id);
    expect(groupOf(groups, "s1")!.id).not.toBe(groupOf(groups, "s5")!.id);
  });

  it("조장 반 고정 시 붙임 반이 고정 조를 따라간다", () => {
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s3: mkP("s3", "나", 1, 3),
      s5: mkP("s5", "다", 1, 5), s7: mkP("s7", "라", 1, 7),
    };
    // 1반을 2번째 조(idx 1)에 고정 + 1반↔5반 붙임 → 5반도 2번째 조
    const groups = run(2, participants, mkRules({ applyConflicts: true, pinLeaders: true }), {
      classAffinities: [{ a: "1부_1_1", b: "1부_1_5" }],
      pinned: [null, "1부_1_1"],
    });
    const g1 = groupOf(groups, "s1")!;
    expect(g1.name).toBe("2조");
    expect(groupOf(groups, "s5")!.id).toBe(g1.id);
  });

  it("고려 관계 반영이 꺼져 있으면 붙임도 무시된다 (기존 동작 보존)", () => {
    // 반 2개·조 2·인원 균등 → 붙임이 무시되면 반드시 분리 배치
    const participants: Record<string, Participant> = {
      s1: mkP("s1", "가", 1, 1), s3: mkP("s3", "나", 1, 3),
    };
    const groups = run(2, participants, mkRules({ applyConflicts: false, balanceSize: true }), {
      classAffinities: [{ a: "1부_1_1", b: "1부_1_3" }],
    });
    expect(groupOf(groups, "s1")!.id).not.toBe(groupOf(groups, "s3")!.id);
  });
});

// ── validateClassRelations — 모순 입력 사전 차단 ──────────────────────
describe("validateClassRelations", () => {
  const mkU = (bu: string, grade: number, cls: number, count = 1): ClassUnit => ({
    key: `${bu}_${grade}_${cls}`, bu, grade, classNum: cls,
    gender: cls % 2 === 0 ? "여" : "남",
    studentIds: Array.from({ length: count }, (_, i) => `s${cls}_${i}`),
    names: Array.from({ length: count }, (_, i) => `n${cls}_${i}`),
  });
  const units = [mkU("1부", 1, 1), mkU("1부", 1, 2), mkU("1부", 1, 3), mkU("2부", 1, 1)];

  it("같은 쌍이 붙임+분리에 있으면 모순", () => {
    const errors = validateClassRelations(units,
      [{ a: "1부_1_1", b: "1부_1_3" }], [{ a: "1부_1_3", b: "1부_1_1" }], mkRules({}));
    expect(errors.some(e => e.includes("동시에"))).toBe(true);
  });

  it("연쇄 붙임 묶음 안의 분리 쌍도 모순으로 잡는다", () => {
    // 1반+2반, 2반+3반 결합 → 1·2·3반 한 묶음인데 1반−3반 분리
    const errors = validateClassRelations(units,
      [{ a: "1부_1_1", b: "1부_1_3" }],
      [{ a: "1부_1_1", b: "1부_1_2" }, { a: "1부_1_2", b: "1부_1_3" }],
      mkRules({}));
    expect(errors.some(e => e.includes("묶음"))).toBe(true);
  });

  it("동성 규칙 + 남녀 혼성 묶음은 모순", () => {
    const errors = validateClassRelations(units,
      [], [{ a: "1부_1_1", b: "1부_1_2" }], mkRules({ sameGender: true }));
    expect(errors.some(e => e.includes("동성"))).toBe(true);
  });

  it("묶음 인원이 조당 최대를 초과하면 실현 불가", () => {
    const bigUnits = [mkU("1부", 1, 1, 5), mkU("1부", 1, 3, 5)];
    const errors = validateClassRelations(bigUnits,
      [], [{ a: "1부_1_1", b: "1부_1_3" }], mkRules({ maxGroupSize: 8 }));
    expect(errors.some(e => e.includes("초과"))).toBe(true);
  });

  it("서로 다른 부의 반 붙임은 불가", () => {
    const errors = validateClassRelations(units,
      [], [{ a: "1부_1_1", b: "2부_1_1" }], mkRules({}));
    expect(errors.some(e => e.includes("다른 부"))).toBe(true);
  });

  it("정상 입력이면 에러 없음", () => {
    const errors = validateClassRelations(units,
      [{ a: "1부_1_1", b: "1부_1_2" }], [{ a: "1부_1_1", b: "1부_1_3" }], mkRules({}));
    expect(errors).toEqual([]);
  });
});
