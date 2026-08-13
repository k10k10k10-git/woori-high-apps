import { Group, Participant, TeacherAttendance } from "@/lib/types";
import type { ConflictPair, LeaderEntry, RuleFlags } from "@/lib/autoAssignConfig";

export type { ConflictPair, LeaderEntry, RuleFlags } from "@/lib/autoAssignConfig";

// ── 타입 ─────────────────────────────────────────────────────────────

export interface ClassUnit {
  key: string;       // "1부_1_3" = 1부 1학년 3반
  classKey?: string; // 학생 단위 배정으로 쪼개져도 유지되는 원래 반 키
  bu: string;
  grade: number;
  classNum: number;
  gender: "남" | "여";  // 홀수반=남, 짝수반=여
  genders?: ("남" | "여")[]; // 학생 단위로 나눌 때 각 학생의 성별을 보존
  studentIds: string[];
  names: string[];
}

// ── 페널티 상수 ───────────────────────────────────────────────────────
// 이분법(위반/준수) 규칙은 전부 동일한 초강력 페널티로 통일한다 — "하나의 규칙도 어기지 않게".
// 이 페널티끼리 동일하므로 best-of-N은 하드 위반 '건수'를 최소화한다(동시에 못 지키면 덜 어기는 쪽 선택).
// 인원 균등·학년 분산은 이분법이 아닌 '정도(gradient)' 목표라 이 상수의 수천분의 1 규모로 유지 →
// 하드 제약을 절대 못 이긴다(항상 하드가 우선).
const HARD_PENALTY = 1_000_000;
// 최소 2반 규칙을 켰을 때 그리디를 유도하는 중간 가중치(반이 적게 든 조부터 채우게).
// 하드보다 훨씬 작고, 균등류 gradient보다 큼 → 하드는 못 이기되 균등류보단 우선.
const CLASS_SPREAD_GUIDE = 40_000;
// 전참 교사 보장(requireFullTimer)의 그리디 유도 가중치 — 판정은 하드(scoreGroups)지만
// 유도는 중간 가중치로 둔다. 균등류 gradient보다 크고 하드보다 훨씬 작아 하드를 못 이긴다.
// (과거 +5000은 gradient에 묻혀 유도가 약했다 → 빡빡한 입력에서 위반 잔존 확률↑.)
const FULLTIMER_SPREAD_GUIDE = 30_000;
// 아직 반이 하나도 없는 조를 먼저 채우는 유도값. 하드 제약보다 작아 고려 관계 등을 깨지 않지만,
// 일반 균등 점수보다 충분히 커 파송 조장만 있는 조에도 실제 반이 우선 배정되게 한다.
const EMPTY_GROUP_SPREAD_GUIDE = 80_000;
// 파송 조장이 조에서 유일한 동성 학생으로 남지 않도록 같은 성별 반을 먼저 붙이는 유도값.
// 최종 판정은 scoreGroups의 하드 규칙이며, 이 값은 큰순 그리디가 반대 성별 큰 반으로
// 정원을 먼저 채워버리는 상황을 줄인다.
const SENT_LEADER_PEER_GUIDE = 70_000;

export interface CombinedGroupCountInput {
  groupCount1bu: number;
  groupCount2bu: number;
  maxGroups1: number;
  maxGroups2: number;
  studentCount1bu: number;
  studentCount2bu: number;
}

export interface CombinedGroupCounts {
  groupCount1bu: number;
  groupCount2bu: number;
}

export type AutoAssignScope = "all" | "1부" | "2부";

export interface ScopedGroupCountInput {
  requestedCount: number;
  maxGroups: number;
  studentCount: number;
  preservedOtherGroupCount: number;
}

export interface MaxSizeGroupCountInput {
  maxGroupSize: number;
  maxGroups1: number;
  maxGroups2: number;
  studentCount1bu: number;
  studentCount2bu: number;
}

function unitClassKey(unit: ClassUnit) {
  return unit.classKey ?? unit.key;
}

interface ResolvedLeader {
  groupIdx: number;
  name: string;
  studentId: string;
  unitKey: string;
  gender: ClassUnit["gender"];
  mode: LeaderEntry["mode"];
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────

function hasConflict(a: string, b: string, pairs: ConflictPair[]) {
  return pairs.some(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
}

/** 1·2부 합산 조 수를 짝수로 맞춘다.
 * 홀수면 더 붐비는 부서의 조를 하나 늘리고, 양쪽 모두 상한이면
 * 덜 붐비는 부서의 조를 하나 줄여 총합만 1만큼 조정한다. */
export function ensureEvenCombinedGroupCounts({
  groupCount1bu, groupCount2bu, maxGroups1, maxGroups2, studentCount1bu, studentCount2bu,
}: CombinedGroupCountInput): CombinedGroupCounts {
  const rows = [
    {
      count: studentCount1bu > 0 ? Math.min(Math.max(1, groupCount1bu), Math.max(1, maxGroups1)) : 0,
      max: studentCount1bu > 0 ? Math.max(1, maxGroups1) : 0,
      students: studentCount1bu,
    },
    {
      count: studentCount2bu > 0 ? Math.min(Math.max(1, groupCount2bu), Math.max(1, maxGroups2)) : 0,
      max: studentCount2bu > 0 ? Math.max(1, maxGroups2) : 0,
      students: studentCount2bu,
    },
  ];

  if ((rows[0].count + rows[1].count) % 2 !== 0) {
    const canIncrease = rows
      .filter(row => row.count > 0 && row.count < row.max)
      .sort((a, b) => (b.students / b.count) - (a.students / a.count));
    if (canIncrease.length > 0) {
      canIncrease[0].count += 1;
    } else {
      const canDecrease = rows
        .filter(row => row.count > 1)
        .sort((a, b) => (a.students / a.count) - (b.students / b.count));
      if (canDecrease.length > 0) canDecrease[0].count -= 1;
    }
  }

  return {
    groupCount1bu: rows[0].count,
    groupCount2bu: rows[1].count,
  };
}

/** 한 부서만 다시 편성할 때 반대 부서 조 수는 건드리지 않고 합산 짝수를 맞춘다. */
export function ensureEvenScopedGroupCount({
  requestedCount, maxGroups, studentCount, preservedOtherGroupCount,
}: ScopedGroupCountInput): number {
  if (studentCount <= 0 || maxGroups <= 0) return 0;
  let count = Math.min(Math.max(1, requestedCount), Math.max(1, maxGroups));
  if ((count + Math.max(0, preservedOtherGroupCount)) % 2 !== 0) {
    if (count < maxGroups) count += 1;
    else if (count > 1) count -= 1;
  }
  return count;
}

/** 부분 자동배정 결과를 적용하되 선택하지 않은 부서의 현재 조는 그대로 보존한다. */
export function mergeAutoAssignedGroups(
  currentGroups: Group[], generatedGroups: Group[], scope: AutoAssignScope,
): Group[] {
  if (scope === "all") return generatedGroups;
  return (["1부", "2부"] as const).flatMap(bu =>
    bu === scope
      ? generatedGroups.filter(group => group.bu === bu)
      : currentGroups.filter(group => group.bu === bu)
  );
}

/** 조당 최대 인원으로 부별 조 수를 계산한 뒤, 화면에 표시하기 전 합계를 짝수로 보정한다. */
export function calculateEvenGroupCountsForMaxSize({
  maxGroupSize, maxGroups1, maxGroups2, studentCount1bu, studentCount2bu,
}: MaxSizeGroupCountInput): CombinedGroupCounts {
  const rawCount1 = maxGroupSize > 0 && studentCount1bu > 0
    ? Math.min(maxGroups1, Math.max(1, Math.ceil(studentCount1bu / maxGroupSize)))
    : 0;
  const rawCount2 = maxGroupSize > 0 && studentCount2bu > 0
    ? Math.min(maxGroups2, Math.max(1, Math.ceil(studentCount2bu / maxGroupSize)))
    : 0;

  return ensureEvenCombinedGroupCounts({
    groupCount1bu: rawCount1,
    groupCount2bu: rawCount2,
    maxGroups1,
    maxGroups2,
    studentCount1bu,
    studentCount2bu,
  });
}

/** 참가자 목록 → 반 단위 ClassUnit 목록 생성
 *  grade/class는 students DB 기준 사용 → UI 표시와 일치 보장 */
export function buildClassUnits(
  participants: Record<string, Participant>,
  bu: string,
  students: Record<string, { name: string; grade: number; class: number }>,
  inferGenderByClass = true,
): ClassUnit[] {
  const map = new Map<string, ClassUnit>();
  const seen = new Set<string>();
  const buKey = bu === "1부" ? "1" : "2";

  Object.values(participants).forEach(p => {
    if (!p.bu?.includes(buKey) || !p.studentId || seen.has(p.studentId)) return;
    seen.add(p.studentId);

    // students DB 우선, 없으면 participant 값 fallback
    const sd = students[p.studentId];
    const grade = sd?.grade ?? p.grade;
    const cls   = sd?.class ?? p.class;
    const name  = sd?.name  ?? p.name;

    const key = `${bu}_${grade}_${cls}`;
    const participantGender = p.gender?.trim().startsWith("여") ? "여" : p.gender?.trim().startsWith("남") ? "남" : null;
    if (!map.has(key)) {
      map.set(key, {
        key, classKey: key, bu, grade, classNum: cls,
        gender: inferGenderByClass ? (cls % 2 === 0 ? "여" : "남") : (participantGender ?? (cls % 2 === 0 ? "여" : "남")),
        genders: [], studentIds: [], names: [],
      });
    }
    const u = map.get(key)!;
    u.studentIds.push(p.studentId);
    u.names.push(name);
    u.genders!.push(inferGenderByClass
      ? (cls % 2 === 0 ? "여" : "남")
      : (participantGender ?? (cls % 2 === 0 ? "여" : "남")));
  });

  return Array.from(map.values());
}

/**
 * 자동 조편성 입력에서 신청취소(cellColors=red) 학생을 제외한다.
 * studentId·cellColors가 접두형("1_x") 또는 과거 raw id("x") 중 어느 형태여도 같은 학생으로 판정한다.
 */
export function excludeCancelledParticipants(
  participants: Record<string, Participant>,
  cellColors: Record<string, string>,
): Record<string, Participant> {
  return Object.fromEntries(Object.entries(participants).filter(([, participant]) => {
    const studentId = participant.studentId?.trim();
    if (!studentId) return true;

    const prefixedMatch = studentId.match(/^([12])_(.+)$/);
    const rawId = prefixedMatch?.[2] ?? studentId;
    const buNum = prefixedMatch?.[1]
      ?? (participant.bu?.trim().startsWith("2") ? "2" : participant.bu?.trim().startsWith("1") ? "1" : "");
    const candidateKeys = [studentId, rawId, buNum ? `${buNum}_${rawId}` : ""].filter(Boolean);
    return !candidateKeys.some(key => cellColors[key] === "red");
  }));
}

/** 같은 반 유지 규칙을 끄면 배정 단위를 반에서 학생으로 쪼갠다. */
export function buildAssignmentUnits(units: ClassUnit[], keepSameClass: boolean): ClassUnit[] {
  if (keepSameClass) return units;
  return units.flatMap(unit => unit.studentIds.map((studentId, index) => ({
    ...unit,
    classKey: unitClassKey(unit),
    key: `${unitClassKey(unit)}::${studentId}`,
    gender: unit.genders?.[index] ?? unit.gender,
    genders: [unit.genders?.[index] ?? unit.gender],
    studentIds: [studentId],
    names: [unit.names[index]],
  })));
}

// ── 헬퍼: classKey 파싱 ("1학년 1반" → {grade:1, classNum:1}) ────────
export function parseClassKey(classKey: string): { grade: number; classNum: number } | null {
  const m = classKey?.match(/(\d+)학년\s*(\d+)반/);
  if (!m) return null;
  return { grade: parseInt(m[1]), classNum: parseInt(m[2]) };
}

/** 조장 이름+학년+반으로 해당 반의 unitKey 조회 (동명이인 구분 지원) */
export function findLeaderUnit(
  entry: LeaderEntry, bu: string,
  participants: Record<string, Participant>,
  students: Record<string, { name: string; grade: number; class: number }>,
  inferGenderByClass = true,
): { unitKey: string; classLabel: string; studentId: string; gender: ClassUnit["gender"]; ambiguous: boolean } | null {
  if (!entry.name.trim()) return null;
  const buKey = bu === "1부" ? "1" : "2";
  const gradeFilter = entry.grade ? parseInt(entry.grade) : null;
  const clsFilter   = entry.cls   ? parseInt(entry.cls)   : null;

  const matches = Object.values(participants).filter(p => {
    if (!p.bu?.includes(buKey) || !p.studentId) return false;
    if (entry.studentId) return p.studentId === entry.studentId;
    const sd = students[p.studentId];
    const pName  = sd?.name  ?? p.name;
    const pGrade = sd?.grade ?? p.grade;
    const pCls   = sd?.class ?? p.class;
    if (pName !== entry.name.trim()) return false;
    if (gradeFilter !== null && pGrade !== gradeFilter) return false;
    if (clsFilter   !== null && pCls   !== clsFilter)   return false;
    return true;
  });

  if (matches.length === 0) return null;
  const p   = matches[0];
  const sd  = students[p.studentId!];
  const grade = sd?.grade ?? p.grade;
  const cls   = sd?.class ?? p.class;
  return {
    unitKey: `${bu}_${grade}_${cls}`,
    classLabel: `${grade}학년 ${cls}반`,
    studentId: p.studentId!,
    gender: inferGenderByClass
      ? (cls % 2 === 0 ? "여" : "남")
      : p.gender?.trim().startsWith("여") ? "여" : p.gender?.trim().startsWith("남") ? "남" : (cls % 2 === 0 ? "여" : "남"),
    ambiguous: matches.length > 1, // 동명이인이 여전히 여러 명
  };
}

// ── 반 붙임(결합) 관계 — union-find 번들 ─────────────────────────────
// 붙어야 하는 반들을 하나의 묶음(번들)으로 만들어 번들 단위로 배정한다.
// "같은 반은 절대 안 쪼개짐" 불변식의 일반화 — 결합은 페널티가 아니라 구조로 보장되므로
// 위반이 "배정 결과"가 아니라 "입력 모순"으로만 발생한다(validateClassRelations가 실행 전 차단).

/** 결합 관계로 연결된 반 묶음 생성. 연쇄 결합(A+B, B+C → A·B·C 한 묶음) 지원.
 *  결합이 없는 반은 크기 1 번들 — 기존 반 단위 배정과 동일하게 동작한다. */
export function buildAffinityBundles(units: ClassUnit[], affinities: ConflictPair[]): ClassUnit[][] {
  const parent = new Map<string, string>();
  units.forEach(u => parent.set(u.key, u.key));
  function find(k: string): string {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = k; // 경로 압축
    while (parent.get(cur) !== root) { const next = parent.get(cur)!; parent.set(cur, root); cur = next; }
    return root;
  }
  affinities.forEach(({ a, b }) => {
    const left = units.filter(unit => unitClassKey(unit) === a);
    const right = units.filter(unit => unitClassKey(unit) === b);
    if (left.length === 0 || right.length === 0) return;
    const anchor = left[0].key;
    [...left.slice(1), ...right].forEach(unit => parent.set(find(unit.key), find(anchor)));
  });
  const byRoot = new Map<string, ClassUnit[]>();
  units.forEach(u => {
    const r = find(u.key);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(u);
  });
  return Array.from(byRoot.values());
}

/** 반 결합·분리 입력의 실현 불가 조합 검증 — 에러가 있으면 UI가 실행을 차단한다. */
export function validateClassRelations(
  allUnits: ClassUnit[],
  classConflicts: ConflictPair[],
  classAffinities: ConflictPair[],
  ruleFlags: RuleFlags,
): string[] {
  const errors: string[] = [];
  const label = (key: string) => {
    const u = allUnits.find(cu => cu.key === key);
    return u ? `${u.bu} ${u.grade}학년 ${u.classNum}반` : key;
  };
  // 1) 서로 다른 부의 반 결합 — 부별로 따로 배정하므로 같은 조가 될 수 없다
  classAffinities.forEach(({ a, b }) => {
    if (a.split("_")[0] !== b.split("_")[0])
      errors.push(`붙임 불가: ${label(a)} ↔ ${label(b)} - 서로 다른 부는 같은 조가 될 수 없습니다`);
  });
  // 2) 같은 쌍이 붙임·분리 양쪽에 (직접 모순)
  const samePair = (p: ConflictPair, q: ConflictPair) => (p.a === q.a && p.b === q.b) || (p.a === q.b && p.b === q.a);
  classAffinities.forEach(ca => {
    if (classConflicts.some(cc => samePair(ca, cc)))
      errors.push(`모순: ${label(ca.a)} ↔ ${label(ca.b)} - 같은 쌍이 붙임과 분리에 동시에 있습니다`);
  });
  // 부별 번들 기반 검사 (연쇄 결합의 결과까지 반영)
  for (const bu of ["1부", "2부"] as const) {
    const units = allUnits.filter(u => u.bu === bu);
    if (units.length === 0) continue;
    const bundles = buildAffinityBundles(units, classAffinities).filter(b => b.length >= 2);
    for (const bundle of bundles) {
      const keys = new Set(bundle.map(u => u.key));
      const names = bundle.map(u => label(u.key)).join(" + ");
      // 3) 연쇄 모순: 붙임으로 연결된 묶음 안에 분리 쌍이 존재
      classConflicts.forEach(({ a, b }) => {
        if (keys.has(a) && keys.has(b))
          errors.push(`모순: ${label(a)} ↔ ${label(b)} - 붙임으로 연결된 묶음(${names}) 안에 분리 쌍이 있습니다`);
      });
      // 4) 동성 규칙과 혼성 묶음
      if (ruleFlags.sameGender) {
        const male = bundle.filter(u => u.gender === "남").length;
        if (male > 0 && male < bundle.length)
          errors.push(`모순: ${names} - 남·여 반 묶음은 '동성으로만 조 구성' 규칙과 함께 쓸 수 없습니다`);
      }
      // 5) 묶음이 조당 최대 인원 초과
      if (ruleFlags.maxGroupSize > 0) {
        const total = bundle.reduce((acc, u) => acc + u.studentIds.length, 0);
        if (total > ruleFlags.maxGroupSize)
          errors.push(`실현 불가: ${names} = ${total}명 - 조당 최대 인원(${ruleFlags.maxGroupSize}명)을 초과합니다`);
      }
    }
  }
  return errors;
}

// ── 알고리즘 ─────────────────────────────────────────────────────────

function assignUnitToGroup(
  unit: ClassUnit, groupIdx: number,
  groups: Group[], gData: {
    maleClasses: number; femaleClasses: number;
    maleMembers: number; femaleMembers: number;
    grades: Record<number, number>; allNames: string[]; unitKeys: string[]; classKeys: string[]; total: number;
  }[]
) {
  groups[groupIdx].studentIds.push(...unit.studentIds);
  gData[groupIdx].allNames.push(...unit.names);
  gData[groupIdx].unitKeys.push(unit.key);
  if (!gData[groupIdx].classKeys.includes(unitClassKey(unit))) gData[groupIdx].classKeys.push(unitClassKey(unit));
  gData[groupIdx].total += unit.studentIds.length;
  if (unit.gender === "남") {
    gData[groupIdx].maleClasses++;
    gData[groupIdx].maleMembers += unit.studentIds.length;
  } else {
    gData[groupIdx].femaleClasses++;
    gData[groupIdx].femaleMembers += unit.studentIds.length;
  }
  gData[groupIdx].grades[unit.grade] = (gData[groupIdx].grades[unit.grade] || 0) + 1;
}

function tryAssign(
  groupCount: number,
  bu: string,
  units: ClassUnit[],
  teachers: TeacherAttendance[],
  studentConflicts: ConflictPair[],
  teacherConflicts: ConflictPair[],
  teacherStudentConflicts: ConflictPair[],
  classConflicts: ConflictPair[],
  classAffinities: ConflictPair[], // 반 붙임(결합) — 같은 조 보장 (unitKey 쌍)
  ruleFlags: RuleFlags,
  pinnedUnitKeys: (string | null)[], // length=groupCount, [i]=해당 조에 고정할 unitKey (없으면 null)
  leaders: ResolvedLeader[],
): Group[] {
  const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({
    id: `auto_${bu}_${i + 1}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${i + 1}조`, bu,
    teachers: [], leader: "", staff: "", studentIds: [],
  }));

  const gData = groups.map(() => ({
    maleClasses: 0, femaleClasses: 0,
    maleMembers: 0, femaleMembers: 0,
    grades: {} as Record<number, number>,
    allNames: [] as string[],
    unitKeys: [] as string[], // 이 조에 배정된 반(unitKey) 목록 — 반 고려 관계·최소 2반 판정용
    classKeys: [] as string[],
    teacherNames: [] as string[],
    fullTimerCount: 0, // 전참 교사 수
    total: 0,
  }));

  // 파송 조장은 본인 반 단위에서는 빠지고 목표 조의 학생/조장 역할로만 한 번 들어간다.
  // allNames·total에도 선반영해 학생 고려 관계와 인원 균등 계산에서 빠지지 않게 한다.
  leaders.forEach(leader => {
    const group = groups[leader.groupIdx];
    const data = gData[leader.groupIdx];
    if (!group || !data) return;
    group.leader = leader.name;
    if (leader.mode !== "sent") return;
    if (!group.studentIds.includes(leader.studentId)) group.studentIds.push(leader.studentId);
    if (!data.allNames.includes(leader.name)) data.allNames.push(leader.name);
    if (leader.gender === "남") data.maleMembers++;
    else data.femaleMembers++;
    data.total += 1;
  });

  // unitKey → 담당 교사 이름 목록 (반 담당 교사만, 이번 부)
  const unitKeyToTeachers = new Map<string, string[]>();
  // unitKey → 전참 교사 포함 여부
  const unitKeyToHasFullTimer = new Map<string, boolean>();
  teachers.filter(t => t.bu === bu).forEach(t => {
    const parsed = parseClassKey(t.classKey);
    if (!parsed) return;
    const key = `${bu}_${parsed.grade}_${parsed.classNum}`;
    if (!unitKeyToTeachers.has(key)) unitKeyToTeachers.set(key, []);
    unitKeyToTeachers.get(key)!.push(t.name);
    if (t.status === "전참") unitKeyToHasFullTimer.set(key, true);
    else if (!unitKeyToHasFullTimer.has(key)) unitKeyToHasFullTimer.set(key, false);
  });

  const addUnitTeachers = (unit: ClassUnit, groupIdx: number) => {
    const classKey = unitClassKey(unit);
    (unitKeyToTeachers.get(classKey) ?? []).forEach(tn => gData[groupIdx].teacherNames.push(tn));
    if (unitKeyToHasFullTimer.get(classKey)) gData[groupIdx].fullTimerCount++;
  };

  // ── 번들: 붙임(결합) 관계로 연결된 반 묶음 — 묶음 단위 배정으로 결합을 구조적으로 보장 ──
  // 고려 관계 반영(applyConflicts)이 꺼져 있으면 붙임도 무시(결합 없는 크기 1 번들 = 기존 동작).
  const effAffinities = ruleFlags.applyConflicts ? classAffinities : [];
  const bundles = buildAffinityBundles(units, effAffinities);
  const bundleIdxByKey = new Map<string, number>();
  bundles.forEach((b, bi) => b.forEach(u => bundleIdxByKey.set(u.key, bi)));

  // ── Phase 0: 조장 반 고정 배정 (+ 번들 앵커 기록) ──
  const assignedKeys = new Set<string>();
  if (ruleFlags.pinLeaders) {
    const bundleAnchor = new Map<number, number>(); // bundleIdx → 첫 고정 조
    pinnedUnitKeys.forEach((key, i) => {
      if (!key || i >= groupCount) return;
      const unit = units.find(u => u.key === key);
      if (!unit || assignedKeys.has(key)) return; // 같은 반 중복 고정 방어
      assignUnitToGroup(unit, i, groups, gData);
      addUnitTeachers(unit, i);
      assignedKeys.add(key);
      const bi = bundleIdxByKey.get(key)!;
      if (!bundleAnchor.has(bi)) bundleAnchor.set(bi, i);
    });
    // Phase 0.5: 앵커된 번들의 나머지 반을 앵커 조로 — 붙임 관계가 조장 고정을 따라간다.
    // (한 번들의 두 반이 서로 다른 조에 고정된 모순 입력은 validateClassRelations 이전에
    //  UI가 차단하지 못한 경우 scoreGroups의 붙임 하드 판정이 잡는다)
    bundleAnchor.forEach((groupIdx, bi) => {
      bundles[bi].forEach(u => {
        if (assignedKeys.has(u.key)) return;
        assignUnitToGroup(u, groupIdx, groups, gData);
        addUnitTeachers(u, groupIdx);
        assignedKeys.add(u.key);
      });
    });
  }

  // ── Phase 1: 나머지 번들(반 묶음) 단위 그리디 배정 ──
  // 인원 많은 순으로 배정하되, 같은 크기끼리는 무작위 순서.
  // comparator에 Math.random()을 넣으면 정렬 일관성이 깨지므로(엔진 의존·비균등),
  // Fisher-Yates로 먼저 균등 셔플한 뒤 안정 정렬(ES2019+ 보장)로 크기순만 재배열한다.
  const bundleTotal = (b: ClassUnit[]) => b.reduce((acc, u) => acc + u.studentIds.length, 0);
  const remaining = bundles.filter(b => b.every(u => !assignedKeys.has(u.key)));
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  remaining.sort((a, b) => bundleTotal(b) - bundleTotal(a));

  // 점수 허용 오차: 이 범위 안의 후보들은 "동등하게 좋음"으로 보고 무작위 선택
  // (하드 위반 페널티는 HARD_PENALTY 단위라 50 이내로는 절대 들어오지 않음 → 하드 규칙은 항상 우선 보장)
  const SCORE_TOLERANCE = 50;

  for (const bundle of remaining) {
    // 번들 집계 — 반 1개 번들이 일반 케이스라 기존 반 단위 점수와 동일하게 환원된다
    const bNames = bundle.flatMap(u => u.names);
    const bTeachers = bundle.flatMap(u => unitKeyToTeachers.get(unitClassKey(u)) ?? []);
    const bClassKeys = [...new Set(bundle.map(unitClassKey))];
    const bTotal = bundleTotal(bundle);
    const bMale = bundle.filter(u => u.gender === "남").length;
    const bFemale = bundle.length - bMale;
    const bHasFullTimer = bundle.some(u => unitKeyToHasFullTimer.get(u.key));
    const bGrades = new Set(bundle.map(u => u.grade));

    const candidates: { idx: number; score: number }[] = [];
    for (let i = 0; i < groups.length; i++) {
      let score = 0;
      // 조당 최대 인원 제한 (하드)
      if (ruleFlags.maxGroupSize > 0 && gData[i].total + bTotal > ruleFlags.maxGroupSize) {
        score -= HARD_PENALTY;
      }
      // 고려 관계 (전부 하드)
      if (ruleFlags.applyConflicts) {
        const studentConflict = bNames.some(n =>
          gData[i].allNames.some(en => hasConflict(n, en, studentConflicts))
        );
        if (studentConflict) score -= HARD_PENALTY;
        const teacherConflict = bTeachers.some(tn =>
          gData[i].teacherNames.some(en => hasConflict(tn, en, teacherConflicts))
        );
        if (teacherConflict) score -= HARD_PENALTY;
        const tsConflict =
          bNames.some(n => gData[i].teacherNames.some(tn => hasConflict(n, tn, teacherStudentConflicts))) ||
          bTeachers.some(tn => gData[i].allNames.some(n => hasConflict(tn, n, teacherStudentConflicts)));
        if (tsConflict) score -= HARD_PENALTY;
        // 반 고려(분리) — 이 조에 이미 있는 반 중 번들 내 반과 분리 대상이 있으면 하드
        const classConflict = gData[i].classKeys.some(k => bClassKeys.some(bk => hasConflict(bk, k, classConflicts)));
        if (classConflict) score -= HARD_PENALTY;
      }
      // 파송 조장의 본인 반은 파송된 조에 들어가면 안 된다(파송 의미 자체를 보장하는 하드 제약).
      if (leaders.some(leader => leader.mode === "sent" && leader.groupIdx === i && bClassKeys.includes(leader.unitKey))) {
        score -= HARD_PENALTY;
      }
      // 전참 교사 보장 (중간 유도) — 전참 반은 아직 전참이 없는 조로 유도(빈 조 포함).
      // 빈 조를 제외하면 전참 반이 빈 조로 못 가 전참이 한쪽에 뭉치는 편향이 생겨 total>0 조건을 뺀다.
      if (ruleFlags.requireFullTimer) {
        if (bHasFullTimer && gData[i].fullTimerCount === 0) score += FULLTIMER_SPREAD_GUIDE;
      }
      // 최소 2반 유도: 반이 적게 든 조부터 채우도록 (반 개수 × 중간 가중치만큼 감점 → 0반·1반 조 우선)
      if (ruleFlags.minTwoClasses) {
        score -= gData[i].classKeys.length * CLASS_SPREAD_GUIDE;
      }
      // 모든 조에 최소 한 반 배정 유도. 파송 조장 1명만 있는 조도 unitKeys는 0개이므로 빈 조로 본다.
      if (ruleFlags.ensureNonEmptyGroups && gData[i].classKeys.length === 0) score += EMPTY_GROUP_SPREAD_GUIDE;
      // 파송 조장 외 같은 성별 학생이 아직 없으면 같은 성별 반을 우선 유도한다.
      // 조장 본인 반은 별도 하드 규칙으로 이 조에 들어올 수 없으므로 다른 반만 대상이 된다.
      const sentLeader = leaders.find(leader => leader.mode === "sent" && leader.groupIdx === i);
      if (ruleFlags.mixGender && sentLeader) {
        const sameGenderMembers = sentLeader.gender === "남" ? gData[i].maleMembers : gData[i].femaleMembers;
        const bundleHasSameGender = sentLeader.gender === "남" ? bMale > 0 : bFemale > 0;
        if (sameGenderMembers <= 1 && bundleHasSameGender) score += SENT_LEADER_PEER_GUIDE;
      }
      // 인원 균등 배분 (gradient)
      if (ruleFlags.balanceSize) score -= gData[i].total * 100;
      // 남녀반 혼성 보장 (하드) — 배정 후에도 단일 성별로 남는 조를 회피 (혼성 번들은 자연 통과)
      if (ruleFlags.mixGender) {
        const maleAfter = gData[i].maleMembers + (bMale > 0 ? 1 : 0);
        const femaleAfter = gData[i].femaleMembers + (bFemale > 0 ? 1 : 0);
        // 파송 조장만 있는 조의 첫 반은 어느 성별이든 받을 수 있어야 한다. 최종 scoreGroups가
        // 혼성과 동성 동료 존재를 함께 판정하므로, 첫 반 단계에서 미래 조합을 막지 않는다.
        if (gData[i].unitKeys.length > 0 && (maleAfter === 0 || femaleAfter === 0)) {
          score -= HARD_PENALTY;
        }
      }
      // 동성으로만 조 구성 (하드) — 배정 후 혼성이 되는 조를 회피 (혼성 번들 자체도 걸림 — 입력 검증이 선차단)
      if (ruleFlags.sameGender) {
        const mixedAfter = gData[i].maleMembers + (bMale > 0 ? 1 : 0) > 0
          && gData[i].femaleMembers + (bFemale > 0 ? 1 : 0) > 0;
        if (mixedAfter) score -= HARD_PENALTY;
      }
      // 학년 편중 방지 (gradient) — 조가 단일 학년이고 번들도 전부 그 학년일 때만 감점
      if (ruleFlags.balanceGrade) {
        const gradeKeys = Object.keys(gData[i].grades).map(Number).filter(g => gData[i].grades[g] > 0);
        if (gData[i].total > 0 && gradeKeys.length === 1 && bGrades.size === 1 && bGrades.has(gradeKeys[0])) {
          score -= gData[i].grades[gradeKeys[0]] * 200;
        }
      }
      candidates.push({ idx: i, score });
    }
    if (candidates.length > 0) {
      const bestScore = Math.max(...candidates.map(c => c.score));
      // 최고점과 거의 동등한(허용 오차 이내) 후보들 중 무작위 선택
      // → 하드 위반(페널티 HARD_PENALTY)이 있는 후보는 절대 섞이지 않음
      const topCandidates = candidates.filter(c => c.score >= bestScore - SCORE_TOLERANCE);
      const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)];
      bundle.forEach(u => {
        assignUnitToGroup(u, chosen.idx, groups, gData);
        addUnitTeachers(u, chosen.idx);
      });
    }
  }

  // 학생 배정 결과: unitKey → groupIdx 맵
  const classToGroupIdx = new Map<string, number>();
  for (let i = 0; i < groups.length; i++) {
    for (const unit of units) {
      if (unit.studentIds.some(sid => groups[i].studentIds.includes(sid))) {
        if (!classToGroupIdx.has(unitClassKey(unit))) classToGroupIdx.set(unitClassKey(unit), i);
      }
    }
  }

  // ── Phase 2: 교사 배정 ──
  if (ruleFlags.assignTeachers) {
    for (const t of teachers) {
      const parsed = parseClassKey(t.classKey);
      if (parsed) {
        const classKey = `${bu}_${parsed.grade}_${parsed.classNum}`;
        const groupIdx = classToGroupIdx.get(classKey);
        if (groupIdx !== undefined) groups[groupIdx].teachers.push(t.name);
        continue;
      }
      if (!ruleFlags.excludeNonClassTeachers && groups.length > 0) {
        const target = groups.reduce((best, group) => group.teachers.length < best.teachers.length ? group : best, groups[0]);
        target.teachers.push(t.name);
      }
    }
  }

  return groups;
}

export function scoreGroups(
  groups: Group[], units: ClassUnit[],
  studentConflicts: ConflictPair[], teacherConflicts: ConflictPair[], teacherStudentConflicts: ConflictPair[], classConflicts: ConflictPair[],
  classAffinities: ConflictPair[],
  ruleFlags: RuleFlags,
  teachers: TeacherAttendance[],
  sentLeaderExclusions: { groupIdx: number; unitKey: string; gender: ClassUnit["gender"] }[] = [],
): number {
  let score = 0;

  // 조별 소속 반(unitKey) 집계 — 반 고려·최소2반·성별·학년 평가의 공통 기반
  const groupIdxById = new Map(groups.map((g, i) => [g.id, i]));
  const unitByKey = new Map(units.map(u => [u.key, u]));
  const unitKeysInGroup: string[][] = groups.map(() => []);
  const classKeysInGroup: string[][] = groups.map(() => []);
  const nameToGroup = new Map<string, string>();
  units.forEach(u => {
    const g = groups.find(gr => u.studentIds.some(sid => gr.studentIds.includes(sid)));
    if (!g) return;
    const groupIdx = groupIdxById.get(g.id)!;
    unitKeysInGroup[groupIdx].push(u.key);
    const classKey = unitClassKey(u);
    if (!classKeysInGroup[groupIdx].includes(classKey)) classKeysInGroup[groupIdx].push(classKey);
    u.names.forEach(n => nameToGroup.set(n, g.id));
  });
  // 파송 조장은 ClassUnit에서 빠지므로 이름 기반 고려 관계 맵에 역할 위치를 별도로 넣는다.
  groups.forEach(g => {
    (g.leader || "").split(",").map(n => n.trim()).filter(Boolean)
      .forEach(name => nameToGroup.set(name, g.id));
  });

  // 교사 → 소속 조 맵. tryAssign과 동일하게 "반 담당 교사는 그 반이 배정된 조 소속"으로 본다
  // (assignTeachers=false여서 g.teachers가 비어도 교사 고려 관계를 판정할 수 있게 units 기준으로 도출).
  const bu = units[0]?.bu ?? "";
  const unitKeyToGroupIdx = new Map<string, number>();
  classKeysInGroup.forEach((keys, i) => keys.forEach(k => {
    if (!unitKeyToGroupIdx.has(k)) unitKeyToGroupIdx.set(k, i);
  }));
  const teacherToGroup = new Map<string, string>();
  teachers.forEach(t => {
    const parsed = parseClassKey(t.classKey);
    if (!parsed) return;
    const gi = unitKeyToGroupIdx.get(`${bu}_${parsed.grade}_${parsed.classNum}`);
    if (gi !== undefined) teacherToGroup.set(t.name, groups[gi].id);
  });

  // 조당 최대 인원 초과 (하드)
  if (ruleFlags.maxGroupSize > 0) {
    groups.forEach(g => {
      if (g.studentIds.length > ruleFlags.maxGroupSize) score -= HARD_PENALTY;
    });
  }
  // 크기 분산 (gradient)
  if (ruleFlags.balanceSize) {
    const sizes = groups.map(g => g.studentIds.length);
    const avg = sizes.reduce((a, b) => a + b, 0) / (sizes.length || 1);
    score -= sizes.reduce((acc, s) => acc + (s - avg) ** 2, 0) * 10;
  }
  // 모든 활성 조에 최소 한 반 배정 (하드) — 파송 조장만 있는 조도 빈 조로 판정한다.
  if (ruleFlags.ensureNonEmptyGroups) {
    classKeysInGroup.forEach(keys => {
      if (keys.length === 0) score -= HARD_PENALTY;
    });
  }
  // 최소 2반 (하드) — 학생이 있는 조는 서로 다른 반이 2개 이상이어야 함
  if (ruleFlags.minTwoClasses) {
    classKeysInGroup.forEach((keys, i) => {
      if (groups[i].studentIds.length > 0 && keys.length < 2) score -= HARD_PENALTY;
    });
  }
  // 고려 관계 위반 (전부 하드)
  if (ruleFlags.applyConflicts) {
    studentConflicts.forEach(({ a, b }) => {
      if (nameToGroup.get(a) && nameToGroup.get(a) === nameToGroup.get(b)) score -= HARD_PENALTY;
    });
    // 교사 ↔ 교사 (tryAssign 236-239와 대칭 — 두 교사가 같은 조면 하드)
    teacherConflicts.forEach(({ a, b }) => {
      const ga = teacherToGroup.get(a), gb = teacherToGroup.get(b);
      if (ga && gb && ga === gb) score -= HARD_PENALTY;
    });
    teacherStudentConflicts.forEach(({ a, b }) => {
      const tGroupA = teacherToGroup.get(a), sGroupB = nameToGroup.get(b);
      if (tGroupA && sGroupB && tGroupA === sGroupB) score -= HARD_PENALTY;
      const tGroupB = teacherToGroup.get(b), sGroupA = nameToGroup.get(a);
      if (tGroupB && sGroupA && tGroupB === sGroupA) score -= HARD_PENALTY;
    });
    // 반 고려 관계 — 두 반이 같은 조에 있으면 하드
    classConflicts.forEach(({ a, b }) => {
      const inSame = classKeysInGroup.some(keys => keys.includes(a) && keys.includes(b));
      if (inSame) score -= HARD_PENALTY;
    });
    // 반 붙임 관계 — 두 반이 서로 다른 조면 하드
    // (번들 배정으로 구조 보장되지만, 조장 고정이 번들을 쪼개는 모순 입력의 방어망)
    classAffinities.forEach(({ a, b }) => {
      const ga = unitKeyToGroupIdx.get(a), gb = unitKeyToGroupIdx.get(b);
      if (ga !== undefined && gb !== undefined && ga !== gb) score -= HARD_PENALTY;
    });
  }
  // 파송 조장 본인 반이 같은 조에 들어간 결과는 하드 위반.
  sentLeaderExclusions.forEach(({ groupIdx, unitKey }) => {
    if (classKeysInGroup[groupIdx]?.includes(unitKey)) score -= HARD_PENALTY;
  });
  // 전참 교사 미배정 조 (하드)
  if (ruleFlags.requireFullTimer) {
    const teacherStatusMap = new Map(teachers.map(t => [t.name, t.status]));
    groups.forEach(g => {
      if (g.studentIds.length === 0) return;
      const hasFullTimer = g.teachers.some(tn => teacherStatusMap.get(tn) === "전참");
      if (!hasFullTimer) score -= HARD_PENALTY;
    });
  }
  // 성별/학년 구성 평가
  if (ruleFlags.mixGender || ruleFlags.sameGender || ruleFlags.balanceGrade) {
    const comp = groups.map(() => ({ male: 0, female: 0, grades: {} as Record<number, number> }));
    unitKeysInGroup.forEach((keys, i) => {
      keys.forEach(k => {
        const u = unitByKey.get(k);
        if (!u) return;
        if (u.gender === "남") comp[i].male++; else comp[i].female++;
        comp[i].grades[u.grade] = (comp[i].grades[u.grade] || 0) + 1;
      });
    });
    // 파송 조장은 ClassUnit에서는 빠지지만 실제 조원이다. 혼성/동성 판정에는 성별을 포함하고,
    // 최소 2반·학년 구성에는 반으로 세지 않는다.
    sentLeaderExclusions.forEach(({ groupIdx, gender }) => {
      if (!comp[groupIdx]) return;
      if (gender === "남") comp[groupIdx].male++;
      else comp[groupIdx].female++;
    });
    // 남녀 혼성 보장 (하드) — 학생 있는 조가 단일 성별이면 위반
    if (ruleFlags.mixGender) {
      comp.forEach((c, i) => {
        if (groups[i].studentIds.length === 0) return;
        if (c.male === 0 || c.female === 0) score -= HARD_PENALTY;
      });
      // 파송 조장 혼자만 해당 성별이고 나머지가 전부 반대 성별인 구성도 금지한다.
      // comp에는 반별 성별 존재 수 + 파송 조장 1이 들어 있으므로 1 이하면 동성 반이 없다.
      sentLeaderExclusions.forEach(({ groupIdx, gender }) => {
        const sameGenderPresence = gender === "남" ? comp[groupIdx]?.male : comp[groupIdx]?.female;
        if ((sameGenderPresence ?? 0) <= 1) score -= HARD_PENALTY;
      });
    }
    // 동성으로만 조 구성 (하드) — 한 조에 두 성별이 섞이면 위반
    if (ruleFlags.sameGender) {
      comp.forEach(c => {
        if (c.male > 0 && c.female > 0) score -= HARD_PENALTY;
      });
    }
    // 학년 편중 방지 (gradient) — 학급이 2개 이상인데 단일 학년뿐이면 감점
    if (ruleFlags.balanceGrade) {
      comp.forEach(c => {
        const gradeKeys = Object.keys(c.grades);
        if (c.male + c.female >= 2 && gradeKeys.length === 1) {
          score -= c.grades[Number(gradeKeys[0])] * 200;
        }
      });
    }
  }
  return score;
}

function rebuildAssignedTeachers(
  groups: Group[],
  units: ClassUnit[],
  teachers: TeacherAttendance[],
  bu: string,
  assignTeachers: boolean,
  excludeNonClassTeachers: boolean,
) {
  groups.forEach(group => { group.teachers = []; });
  if (!assignTeachers) return;

  const unitToGroup = new Map<string, Group>();
  units.forEach(unit => {
    const group = groups.find(candidate => unit.studentIds.some(id => candidate.studentIds.includes(id)));
    if (group && !unitToGroup.has(unitClassKey(unit))) unitToGroup.set(unitClassKey(unit), group);
  });
  teachers.filter(teacher => teacher.bu === bu).forEach(teacher => {
    const parsed = parseClassKey(teacher.classKey);
    if (parsed) {
      const group = unitToGroup.get(`${bu}_${parsed.grade}_${parsed.classNum}`);
      if (group && !group.teachers.includes(teacher.name)) group.teachers.push(teacher.name);
      return;
    }
    if (!excludeNonClassTeachers && groups.length > 0) {
      const target = groups.reduce((best, group) => group.teachers.length < best.teachers.length ? group : best, groups[0]);
      if (!target.teachers.includes(teacher.name)) target.teachers.push(teacher.name);
    }
  });
}

/**
 * 그리디 배정 뒤, 조장에 고정되지 않은 반 묶음을 한 조씩 옮겨 전체 점수를 개선한다.
 * 큰 반부터 넣는 그리디는 성별 반이 빠듯할 때 작은 조를 남길 수 있으므로,
 * 최종 하드 위반 수와 인원 분산을 직접 비교하는 국소 탐색으로 그 함정을 보정한다.
 */
export function improveGroupsByWholeUnitMoves(
  initialGroups: Group[],
  units: ClassUnit[],
  studentConflicts: ConflictPair[],
  teacherConflicts: ConflictPair[],
  teacherStudentConflicts: ConflictPair[],
  classConflicts: ConflictPair[],
  classAffinities: ConflictPair[],
  ruleFlags: RuleFlags,
  teachers: TeacherAttendance[],
  pinnedUnitKeys: (string | null)[],
  sentLeaderExclusions: { groupIdx: number; unitKey: string; gender: ClassUnit["gender"] }[] = [],
): Group[] {
  if (initialGroups.length < 2 || units.length === 0) return initialGroups;
  const bu = units[0].bu;
  const fixedKeys = new Set(pinnedUnitKeys.filter((key): key is string => Boolean(key)));
  const bundles = buildAffinityBundles(units, ruleFlags.applyConflicts ? classAffinities : [])
    .filter(bundle => !bundle.some(unit => fixedKeys.has(unit.key)));

  const evaluate = (groups: Group[]) => scoreGroups(
    groups, units,
    studentConflicts, teacherConflicts, teacherStudentConflicts, classConflicts,
    ruleFlags.applyConflicts ? classAffinities : [],
    ruleFlags, teachers, sentLeaderExclusions,
  );

  let current = initialGroups.map(group => ({
    ...group,
    studentIds: [...group.studentIds],
    teachers: [...group.teachers],
  }));
  let currentScore = evaluate(current);

  // 한 번의 이동이 다른 이동의 길을 열 수 있어 개선이 멈출 때까지 반복한다.
  for (let pass = 0; pass < units.length; pass++) {
    let bestGroups: Group[] | null = null;
    let bestScore = currentScore;

    for (const bundle of bundles) {
      const bundleIds = bundle.flatMap(unit => unit.studentIds);
      const sourceIdx = current.findIndex(group => bundleIds.some(id => group.studentIds.includes(id)));
      if (sourceIdx < 0) continue;

      for (let targetIdx = 0; targetIdx < current.length; targetIdx++) {
        if (targetIdx === sourceIdx) continue;
        if (sentLeaderExclusions.some(exclusion =>
          exclusion.groupIdx === targetIdx && bundle.some(unit => unitClassKey(unit) === exclusion.unitKey)
        )) continue;
        const candidate = current.map(group => ({
          ...group,
          studentIds: [...group.studentIds],
          teachers: [...group.teachers],
        }));
        const moving = new Set(bundleIds);
        candidate[sourceIdx].studentIds = candidate[sourceIdx].studentIds.filter(id => !moving.has(id));
        candidate[targetIdx].studentIds.push(...bundleIds.filter(id => !candidate[targetIdx].studentIds.includes(id)));
        const sourceStillHasClass = units.some(unit =>
          unit.studentIds.some(id => candidate[sourceIdx].studentIds.includes(id))
        );
        if (ruleFlags.ensureNonEmptyGroups && !sourceStillHasClass) continue;
        const removesExistingSentLeaderPeer = sentLeaderExclusions.some(exclusion => {
          const hasPeer = (groupsToCheck: Group[]) => units.some(unit =>
            unit.gender === exclusion.gender
            && unit.studentIds.some(id => groupsToCheck[exclusion.groupIdx]?.studentIds.includes(id))
          );
          return hasPeer(current) && !hasPeer(candidate);
        });
        if (removesExistingSentLeaderPeer) continue;
        // 최대 인원은 후처리가 새로 위반하게 두지 않는다. 점수만 비교하면 다른 하드 위반을
        // 하나 줄이는 대신 최대 인원 위반을 하나 만드는 동률 교환이 가능하기 때문이다.
        if (ruleFlags.maxGroupSize > 0 && candidate[targetIdx].studentIds.length > ruleFlags.maxGroupSize) continue;
        rebuildAssignedTeachers(candidate, units, teachers, bu, ruleFlags.assignTeachers, ruleFlags.excludeNonClassTeachers);
        const candidateScore = evaluate(candidate);
        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          bestGroups = candidate;
        }
      }
    }

    if (!bestGroups) break;
    current = bestGroups;
    currentScore = bestScore;
  }

  return current;
}

export function runAutoAssign(
  groupCount1bu: number, groupCount2bu: number,
  ruleFlags: RuleFlags,
  studentConflicts: ConflictPair[], teacherConflicts: ConflictPair[], teacherStudentConflicts: ConflictPair[],
  classConflicts: ConflictPair[], // 반↔반 분리 (unitKey 쌍)
  classAffinities: ConflictPair[], // 반↔반 결합 — 같은 조 보장 (unitKey 쌍)
  participants: Record<string, Participant>,
  teachers: TeacherAttendance[],
  students: Record<string, { name: string; grade: number; class: number }>,
  leaderEntries1: LeaderEntry[],
  leaderEntries2: LeaderEntry[],
  scope: AutoAssignScope = "all",
  preservedOtherGroupCount = 0,
): Group[] {
  const rawUnitsByBu = {
    "1부": buildClassUnits(participants, "1부", students, ruleFlags.inferGenderByClass),
    "2부": buildClassUnits(participants, "2부", students, ruleFlags.inferGenderByClass),
  };
  const maxFor = (units: ClassUnit[]) => {
    if (units.length === 0) return 0;
    if (!ruleFlags.ensureNonEmptyGroups) return 20;
    const assignmentUnits = buildAssignmentUnits(units, ruleFlags.keepSameClass);
    const affinityCount = buildAffinityBundles(
      assignmentUnits,
      ruleFlags.applyConflicts ? classAffinities : [],
    ).length;
    const classRuleMax = ruleFlags.minTwoClasses
      ? Math.max(1, Math.floor(units.length / 2))
      : assignmentUnits.length;
    return Math.min(affinityCount, classRuleMax);
  };
  const maxGroups1 = maxFor(rawUnitsByBu["1부"]);
  const maxGroups2 = maxFor(rawUnitsByBu["2부"]);
  const studentCount1bu = rawUnitsByBu["1부"].reduce((sum, unit) => sum + unit.studentIds.length, 0);
  const studentCount2bu = rawUnitsByBu["2부"].reduce((sum, unit) => sum + unit.studentIds.length, 0);
  const evenCounts = !ruleFlags.ensureEvenGroupCount
    ? { groupCount1bu, groupCount2bu }
    : scope === "all"
    ? ensureEvenCombinedGroupCounts({
        groupCount1bu, groupCount2bu, maxGroups1, maxGroups2, studentCount1bu, studentCount2bu,
      })
    : scope === "1부"
      ? {
          groupCount1bu: ensureEvenScopedGroupCount({
            requestedCount: groupCount1bu,
            maxGroups: maxGroups1,
            studentCount: studentCount1bu,
            preservedOtherGroupCount,
          }),
          groupCount2bu: 0,
        }
      : {
          groupCount1bu: 0,
          groupCount2bu: ensureEvenScopedGroupCount({
            requestedCount: groupCount2bu,
            maxGroups: maxGroups2,
            studentCount: studentCount2bu,
            preservedOtherGroupCount,
          }),
        };
  const result: Group[] = [];
  for (const bu of ["1부", "2부"] as const) {
    if (scope !== "all" && bu !== scope) continue;
    const groupCount = bu === "1부" ? evenCounts.groupCount1bu : evenCounts.groupCount2bu;
    if (groupCount <= 0) continue;
    const rawUnits = rawUnitsByBu[bu];
    if (rawUnits.length === 0) continue;
    const buTeachers = teachers.filter(t => t.bu === bu);
    const entries = bu === "1부" ? leaderEntries1 : leaderEntries2;
    const leaders: ResolvedLeader[] = entries.slice(0, groupCount).flatMap((entry, groupIdx) => {
      const found = findLeaderUnit(entry, bu, participants, students, ruleFlags.inferGenderByClass);
      if (!entry.name.trim() || !found) return [];
      return [{
        groupIdx,
        name: entry.name.trim(),
        studentId: found.studentId,
        unitKey: found.unitKey,
        gender: found.gender,
        mode: entry.mode || "withClass",
      }];
    });
    const sentLeaderIds = new Set(leaders.filter(l => l.mode === "sent").map(l => l.studentId));
    // 파송 조장 한 명만 본인 반에서 분리한다. 나머지 학생은 기존 반 단위 불변식을 그대로 유지한다.
    const unitsWithoutSentLeaders = rawUnits.map(unit => {
      const kept = unit.studentIds
        .map((studentId, i) => ({ studentId, name: unit.names[i], gender: unit.genders?.[i] ?? unit.gender }))
        .filter(item => !sentLeaderIds.has(item.studentId));
      return {
        ...unit,
        studentIds: kept.map(item => item.studentId),
        names: kept.map(item => item.name),
        genders: kept.map(item => item.gender),
      };
    }).filter(unit => unit.studentIds.length > 0);
    const units = buildAssignmentUnits(unitsWithoutSentLeaders, ruleFlags.keepSameClass);
    const pinnedKeys: (string | null)[] = Array(groupCount).fill(null);
    if (ruleFlags.pinLeaders) {
      leaders.filter(l => l.mode === "withClass").forEach(leader => {
        pinnedKeys[leader.groupIdx] = ruleFlags.keepSameClass
          ? leader.unitKey
          : units.find(unit => unit.studentIds.includes(leader.studentId))?.key ?? null;
      });
    }
    const sentLeaderExclusions = leaders
      .filter(l => l.mode === "sent")
      .map(l => ({ groupIdx: l.groupIdx, unitKey: l.unitKey, gender: l.gender }));

    const greedyCandidates: { groups: Group[]; score: number }[] = [];
    // 하드 제약이 많을수록 그리디가 첫 시도에서 막힐 수 있어 반복 횟수를 늘려 위반 0 해를 찾을 확률을 높인다.
    const attemptCount = ruleFlags.optimizeResults ? 16 : 1;
    for (let i = 0; i < attemptCount; i++) {
      const groups = tryAssign(groupCount, bu, units, buTeachers, studentConflicts, teacherConflicts, teacherStudentConflicts, classConflicts, classAffinities, ruleFlags, pinnedKeys, leaders);
      const score = scoreGroups(groups, units, studentConflicts, teacherConflicts, teacherStudentConflicts, classConflicts, ruleFlags.applyConflicts ? classAffinities : [], ruleFlags, buTeachers, sentLeaderExclusions);
      greedyCandidates.push({ groups, score });
    }

    let bestGroups: Group[] | null = null;
    let bestScore = -Infinity;
    // 모든 그리디 후보에 국소 탐색을 하면 브라우저가 오래 멈춘다. 초기 점수 상위 후보만
    // 보정해 탐색 폭은 유지하면서 운영 데이터 기준 실행 시간을 짧게 제한한다.
    for (const { groups } of greedyCandidates.sort((a, b) => b.score - a.score).slice(0, ruleFlags.optimizeResults ? 4 : 1)) {
      const g = ruleFlags.optimizeResults
        ? improveGroupsByWholeUnitMoves(
            groups, units,
            studentConflicts, teacherConflicts, teacherStudentConflicts, classConflicts, classAffinities,
            ruleFlags, buTeachers, pinnedKeys, sentLeaderExclusions,
          )
        : groups;
      const s = scoreGroups(g, units, studentConflicts, teacherConflicts, teacherStudentConflicts, classConflicts, ruleFlags.applyConflicts ? classAffinities : [], ruleFlags, buTeachers, sentLeaderExclusions);
      if (s > bestScore) { bestScore = s; bestGroups = g; }
    }
    if (bestGroups) {
      result.push(...bestGroups);
    }
  }
  if (ruleFlags.assignTeachers && !ruleFlags.excludeNonClassTeachers && result.length > 0) {
    teachers.filter(teacher => teacher.bu === "스탭" && teacher.status !== "불참").forEach(teacher => {
      const target = result.reduce((best, group) => group.teachers.length < best.teachers.length ? group : best, result[0]);
      if (!target.teachers.includes(teacher.name)) target.teachers.push(teacher.name);
    });
  }
  return result;
}
