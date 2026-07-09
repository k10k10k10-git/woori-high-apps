import { Group, Participant, TeacherAttendance } from "@/lib/types";

// ── 타입 ─────────────────────────────────────────────────────────────

export interface ClassUnit {
  key: string;       // "1부_1_3" = 1부 1학년 3반
  bu: string;
  grade: number;
  classNum: number;
  gender: "남" | "여";  // 홀수반=남, 짝수반=여
  studentIds: string[];
  names: string[];
}

// 학생·교사 고려 관계는 이름(a/b) 쌍, 반 고려 관계는 unitKey(`${bu}_${grade}_${classNum}`) 쌍으로 저장.
export interface ConflictPair { a: string; b: string; }

export interface RuleFlags {
  assignTeachers:   boolean; // Rule 3: 반 담당 교사 자동 배치
  requireFullTimer: boolean; // Rule 4: 전참 교사 최소 1명
  pinLeaders:       boolean; // Rule 6: 조장 반 고정
  applyConflicts:   boolean; // Rule 7: 고려 관계 반영 (학생·교사·교사학생·반)
  mixGender:        boolean; // Rule 8: 남녀반 혼성
  sameGender:       boolean; // Rule 9: 동성으로만 조 구성 (Rule 8과 상호배타)
  balanceGrade:     boolean; // Rule 10: 학년 편중 방지
  balanceSize:      boolean; // Rule 11: 인원 균등 배분
  minTwoClasses:    boolean; // Rule 12: 한 조에 서로 다른 반 2개 이상 (조 수 ≤ 반 수/2일 때만 가능)
  maxGroupSize:     number;  // 조당 최대 인원 (0 = 제한 없음)
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

export interface LeaderEntry {
  name: string;
  grade: string; // "1" | "2" | "3" | ""
  cls: string;   // "1" ~ "N" | ""
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────

function hasConflict(a: string, b: string, pairs: ConflictPair[]) {
  return pairs.some(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
}

/** 참가자 목록 → 반 단위 ClassUnit 목록 생성
 *  grade/class는 students DB 기준 사용 → UI 표시와 일치 보장 */
export function buildClassUnits(
  participants: Record<string, Participant>,
  bu: string,
  students: Record<string, { name: string; grade: number; class: number }>,
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
    if (!map.has(key)) {
      map.set(key, {
        key, bu, grade, classNum: cls,
        gender: cls % 2 === 0 ? "여" : "남",
        studentIds: [], names: [],
      });
    }
    const u = map.get(key)!;
    u.studentIds.push(p.studentId);
    u.names.push(name);
  });

  return Array.from(map.values());
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
): { unitKey: string; classLabel: string; studentId: string; ambiguous: boolean } | null {
  if (!entry.name.trim()) return null;
  const buKey = bu === "1부" ? "1" : "2";
  const gradeFilter = entry.grade ? parseInt(entry.grade) : null;
  const clsFilter   = entry.cls   ? parseInt(entry.cls)   : null;

  const matches = Object.values(participants).filter(p => {
    if (!p.bu?.includes(buKey) || !p.studentId) return false;
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
    ambiguous: matches.length > 1, // 동명이인이 여전히 여러 명
  };
}

// ── 알고리즘 ─────────────────────────────────────────────────────────

function assignUnitToGroup(
  unit: ClassUnit, groupIdx: number,
  groups: Group[], gData: { maleClasses: number; femaleClasses: number; grades: Record<number, number>; allNames: string[]; unitKeys: string[]; total: number }[]
) {
  groups[groupIdx].studentIds.push(...unit.studentIds);
  gData[groupIdx].allNames.push(...unit.names);
  gData[groupIdx].unitKeys.push(unit.key);
  gData[groupIdx].total += unit.studentIds.length;
  if (unit.gender === "남") gData[groupIdx].maleClasses++;
  else gData[groupIdx].femaleClasses++;
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
  ruleFlags: RuleFlags,
  pinnedUnitKeys: (string | null)[], // length=groupCount, [i]=해당 조에 고정할 unitKey (없으면 null)
): Group[] {
  const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({
    id: `auto_${bu}_${i + 1}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${i + 1}조`, bu,
    teachers: [], leader: "", staff: "", studentIds: [],
  }));

  const gData = groups.map(() => ({
    maleClasses: 0, femaleClasses: 0,
    grades: {} as Record<number, number>,
    allNames: [] as string[],
    unitKeys: [] as string[], // 이 조에 배정된 반(unitKey) 목록 — 반 고려 관계·최소 2반 판정용
    teacherNames: [] as string[],
    fullTimerCount: 0, // 전참 교사 수
    total: 0,
  }));

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

  const addUnitTeachers = (unitKey: string, groupIdx: number) => {
    (unitKeyToTeachers.get(unitKey) ?? []).forEach(tn => gData[groupIdx].teacherNames.push(tn));
    if (unitKeyToHasFullTimer.get(unitKey)) gData[groupIdx].fullTimerCount++;
  };

  // ── Phase 0: 조장 반 고정 배정 ──
  const pinnedKeys = new Set<string>();
  if (ruleFlags.pinLeaders) {
    pinnedUnitKeys.forEach((key, i) => {
      if (!key || i >= groupCount) return;
      const unit = units.find(u => u.key === key);
      if (!unit) return;
      assignUnitToGroup(unit, i, groups, gData);
      addUnitTeachers(unit.key, i);
      pinnedKeys.add(key);
    });
  }

  // ── Phase 1: 나머지 반 단위 학생 배정 ──
  const remaining = [...units]
    .filter(u => !pinnedKeys.has(u.key))
    .sort((a, b) =>
      b.studentIds.length !== a.studentIds.length
        ? b.studentIds.length - a.studentIds.length
        : Math.random() - 0.5
    );

  // 점수 허용 오차: 이 범위 안의 후보들은 "동등하게 좋음"으로 보고 무작위 선택
  // (하드 위반 페널티는 HARD_PENALTY 단위라 50 이내로는 절대 들어오지 않음 → 하드 규칙은 항상 우선 보장)
  const SCORE_TOLERANCE = 50;

  for (const unit of remaining) {
    const unitTeachers = unitKeyToTeachers.get(unit.key) ?? [];
    const candidates: { idx: number; score: number }[] = [];
    for (let i = 0; i < groups.length; i++) {
      let score = 0;
      // 조당 최대 인원 제한 (하드)
      if (ruleFlags.maxGroupSize > 0 && gData[i].total + unit.studentIds.length > ruleFlags.maxGroupSize) {
        score -= HARD_PENALTY;
      }
      // 고려 관계 (전부 하드)
      if (ruleFlags.applyConflicts) {
        const studentConflict = unit.names.some(n =>
          gData[i].allNames.some(en => hasConflict(n, en, studentConflicts))
        );
        if (studentConflict) score -= HARD_PENALTY;
        const teacherConflict = unitTeachers.some(tn =>
          gData[i].teacherNames.some(en => hasConflict(tn, en, teacherConflicts))
        );
        if (teacherConflict) score -= HARD_PENALTY;
        const tsConflict =
          unit.names.some(n => gData[i].teacherNames.some(tn => hasConflict(n, tn, teacherStudentConflicts))) ||
          unitTeachers.some(tn => gData[i].allNames.some(n => hasConflict(tn, n, teacherStudentConflicts)));
        if (tsConflict) score -= HARD_PENALTY;
        // 반 고려 관계 — 이 조에 이미 있는 반 중 unit.key와 분리 대상이 있으면 하드
        const classConflict = gData[i].unitKeys.some(k => hasConflict(unit.key, k, classConflicts));
        if (classConflict) score -= HARD_PENALTY;
      }
      // 전참 교사 보장 (soft 가점)
      if (ruleFlags.requireFullTimer) {
        const unitHasFullTimer = unitKeyToHasFullTimer.get(unit.key) ?? false;
        if (unitHasFullTimer && gData[i].fullTimerCount === 0 && gData[i].total > 0) score += 5000;
      }
      // 최소 2반 유도: 반이 적게 든 조부터 채우도록 (반 개수 × 중간 가중치만큼 감점 → 0반·1반 조 우선)
      if (ruleFlags.minTwoClasses) {
        score -= (gData[i].maleClasses + gData[i].femaleClasses) * CLASS_SPREAD_GUIDE;
      }
      // 인원 균등 배분 (gradient)
      if (ruleFlags.balanceSize) score -= gData[i].total * 100;
      // 남녀반 혼성 보장 (하드) — 학생이 있는 조가 단일 성별로 굳는 것을 회피
      if (ruleFlags.mixGender) {
        const oppositeGenderCount = unit.gender === "남" ? gData[i].femaleClasses : gData[i].maleClasses;
        if (gData[i].total > 0 && oppositeGenderCount === 0) {
          score -= HARD_PENALTY;
        }
      }
      // 동성으로만 조 구성 (하드) — 이미 반대 성별이 있는 조에 배정 회피
      if (ruleFlags.sameGender) {
        const hasOpposite = unit.gender === "남" ? gData[i].femaleClasses > 0 : gData[i].maleClasses > 0;
        if (gData[i].total > 0 && hasOpposite) score -= HARD_PENALTY;
      }
      // 학년 편중 방지 (gradient)
      if (ruleFlags.balanceGrade) {
        const gradeKeys = Object.keys(gData[i].grades).map(Number).filter(g => gData[i].grades[g] > 0);
        if (gradeKeys.length === 1 && gradeKeys[0] === unit.grade && gData[i].total > 0) {
          score -= gData[i].grades[unit.grade] * 200;
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
      assignUnitToGroup(unit, chosen.idx, groups, gData);
      addUnitTeachers(unit.key, chosen.idx);
    }
  }

  // 학생 배정 결과: unitKey → groupIdx 맵
  const unitToGroupIdx = new Map<string, number>();
  for (let i = 0; i < groups.length; i++) {
    for (const unit of units) {
      if (unit.studentIds.some(sid => groups[i].studentIds.includes(sid))) {
        unitToGroupIdx.set(unit.key, i);
      }
    }
  }

  // ── Phase 2: 교사 배정 ──
  if (ruleFlags.assignTeachers) {
    for (const t of teachers) {
      const parsed = parseClassKey(t.classKey);
      if (!parsed) continue;
      const unitKey = `${bu}_${parsed.grade}_${parsed.classNum}`;
      const groupIdx = unitToGroupIdx.get(unitKey);
      if (groupIdx === undefined) continue;
      groups[groupIdx].teachers.push(t.name);
    }
  }

  return groups;
}

function scoreGroups(
  groups: Group[], units: ClassUnit[],
  studentConflicts: ConflictPair[], teacherStudentConflicts: ConflictPair[], classConflicts: ConflictPair[],
  ruleFlags: RuleFlags,
  teachers: TeacherAttendance[],
): number {
  let score = 0;

  // 조별 소속 반(unitKey) 집계 — 반 고려·최소2반·성별·학년 평가의 공통 기반
  const groupIdxById = new Map(groups.map((g, i) => [g.id, i]));
  const unitByKey = new Map(units.map(u => [u.key, u]));
  const unitKeysInGroup: string[][] = groups.map(() => []);
  const nameToGroup = new Map<string, string>();
  units.forEach(u => {
    const g = groups.find(gr => u.studentIds.some(sid => gr.studentIds.includes(sid)));
    if (!g) return;
    unitKeysInGroup[groupIdxById.get(g.id)!].push(u.key);
    u.names.forEach(n => nameToGroup.set(n, g.id));
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
  // 최소 2반 (하드) — 학생이 있는 조는 서로 다른 반이 2개 이상이어야 함
  if (ruleFlags.minTwoClasses) {
    unitKeysInGroup.forEach((keys, i) => {
      if (groups[i].studentIds.length > 0 && keys.length < 2) score -= HARD_PENALTY;
    });
  }
  // 고려 관계 위반 (전부 하드)
  if (ruleFlags.applyConflicts) {
    studentConflicts.forEach(({ a, b }) => {
      if (nameToGroup.get(a) && nameToGroup.get(a) === nameToGroup.get(b)) score -= HARD_PENALTY;
    });
    const teacherToGroup = new Map<string, string>();
    groups.forEach(g => g.teachers.forEach(tn => teacherToGroup.set(tn, g.id)));
    teacherStudentConflicts.forEach(({ a, b }) => {
      const tGroupA = teacherToGroup.get(a), sGroupB = nameToGroup.get(b);
      if (tGroupA && sGroupB && tGroupA === sGroupB) score -= HARD_PENALTY;
      const tGroupB = teacherToGroup.get(b), sGroupA = nameToGroup.get(a);
      if (tGroupB && sGroupA && tGroupB === sGroupA) score -= HARD_PENALTY;
    });
    // 반 고려 관계 — 두 반이 같은 조에 있으면 하드
    classConflicts.forEach(({ a, b }) => {
      const inSame = unitKeysInGroup.some(keys => keys.includes(a) && keys.includes(b));
      if (inSame) score -= HARD_PENALTY;
    });
  }
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
    // 남녀 혼성 보장 (하드) — 학생 있는 조가 단일 성별이면 위반
    if (ruleFlags.mixGender) {
      comp.forEach((c, i) => {
        if (groups[i].studentIds.length === 0) return;
        if (c.male === 0 || c.female === 0) score -= HARD_PENALTY;
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

export function runAutoAssign(
  groupCount1bu: number, groupCount2bu: number,
  ruleFlags: RuleFlags,
  studentConflicts: ConflictPair[], teacherConflicts: ConflictPair[], teacherStudentConflicts: ConflictPair[],
  classConflicts: ConflictPair[], // 반↔반 분리 (unitKey 쌍)
  participants: Record<string, Participant>,
  teachers: TeacherAttendance[],
  students: Record<string, { name: string; grade: number; class: number }>,
  pinnedKeys1: (string | null)[], // 1부: [i] = i번째 조에 고정할 unitKey
  pinnedKeys2: (string | null)[], // 2부: [i] = i번째 조에 고정할 unitKey
  leaderNames1: string[], // 1부 조장 이름 (조장 배정용)
  leaderNames2: string[], // 2부 조장 이름
): Group[] {
  const result: Group[] = [];
  for (const bu of ["1부", "2부"] as const) {
    const groupCount = bu === "1부" ? groupCount1bu : groupCount2bu;
    if (groupCount <= 0) continue;
    const units = buildClassUnits(participants, bu, students);
    if (units.length === 0) continue;
    const buTeachers = teachers.filter(t => t.bu === bu);
    const pinnedKeys = bu === "1부" ? pinnedKeys1 : pinnedKeys2;

    let bestGroups: Group[] | null = null;
    let bestScore = -Infinity;
    // 하드 제약이 많을수록 그리디가 첫 시도에서 막힐 수 있어 반복 횟수를 늘려 위반 0 해를 찾을 확률을 높인다.
    for (let i = 0; i < 16; i++) {
      const g = tryAssign(groupCount, bu, units, buTeachers, studentConflicts, teacherConflicts, teacherStudentConflicts, classConflicts, ruleFlags, pinnedKeys);
      const s = scoreGroups(g, units, studentConflicts, teacherStudentConflicts, classConflicts, ruleFlags, buTeachers);
      if (s > bestScore) { bestScore = s; bestGroups = g; }
    }
    if (bestGroups) {
      // 조장 이름 설정
      const leaderNames = bu === "1부" ? leaderNames1 : leaderNames2;
      bestGroups.forEach((g, i) => {
        if (leaderNames[i]?.trim()) g.leader = leaderNames[i].trim();
      });
      result.push(...bestGroups);
    }
  }
  return result;
}
