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

// 학생·교사 고려 관계는 이름(a/b) 쌍, 반 고려(분리)·반 붙임(결합) 관계는 unitKey(`${bu}_${grade}_${classNum}`) 쌍으로 저장.
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
// 전참 교사 보장(requireFullTimer)의 그리디 유도 가중치 — 판정은 하드(scoreGroups)지만
// 유도는 중간 가중치로 둔다. 균등류 gradient보다 크고 하드보다 훨씬 작아 하드를 못 이긴다.
// (과거 +5000은 gradient에 묻혀 유도가 약했다 → 빡빡한 입력에서 위반 잔존 확률↑.)
const FULLTIMER_SPREAD_GUIDE = 30_000;

export interface LeaderEntry {
  name: string;
  grade: string; // "1" | "2" | "3" | ""
  cls: string;   // "1" ~ "N" | ""
  studentId: string; // 동명이인과 파송 대상을 안정적으로 식별
  mode: "withClass" | "sent"; // 기본=본인반 동반, sent=본인반 없이 파송
}

interface ResolvedLeader {
  groupIdx: number;
  name: string;
  studentId: string;
  unitKey: string;
  mode: LeaderEntry["mode"];
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
    if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
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
      errors.push(`붙임 불가: ${label(a)} ↔ ${label(b)} — 서로 다른 부는 같은 조가 될 수 없습니다`);
  });
  // 2) 같은 쌍이 붙임·분리 양쪽에 (직접 모순)
  const samePair = (p: ConflictPair, q: ConflictPair) => (p.a === q.a && p.b === q.b) || (p.a === q.b && p.b === q.a);
  classAffinities.forEach(ca => {
    if (classConflicts.some(cc => samePair(ca, cc)))
      errors.push(`모순: ${label(ca.a)} ↔ ${label(ca.b)} — 같은 쌍이 붙임과 분리에 동시에 있습니다`);
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
          errors.push(`모순: ${label(a)} ↔ ${label(b)} — 붙임으로 연결된 묶음(${names}) 안에 분리 쌍이 있습니다`);
      });
      // 4) 동성 규칙과 혼성 묶음
      if (ruleFlags.sameGender) {
        const male = bundle.filter(u => u.gender === "남").length;
        if (male > 0 && male < bundle.length)
          errors.push(`모순: ${names} — 남·여 반 묶음은 '동성으로만 조 구성' 규칙과 함께 쓸 수 없습니다`);
      }
      // 5) 묶음이 조당 최대 인원 초과
      if (ruleFlags.maxGroupSize > 0) {
        const total = bundle.reduce((acc, u) => acc + u.studentIds.length, 0);
        if (total > ruleFlags.maxGroupSize)
          errors.push(`실현 불가: ${names} = ${total}명 — 조당 최대 인원(${ruleFlags.maxGroupSize}명)을 초과합니다`);
      }
    }
  }
  return errors;
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
    grades: {} as Record<number, number>,
    allNames: [] as string[],
    unitKeys: [] as string[], // 이 조에 배정된 반(unitKey) 목록 — 반 고려 관계·최소 2반 판정용
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

  const addUnitTeachers = (unitKey: string, groupIdx: number) => {
    (unitKeyToTeachers.get(unitKey) ?? []).forEach(tn => gData[groupIdx].teacherNames.push(tn));
    if (unitKeyToHasFullTimer.get(unitKey)) gData[groupIdx].fullTimerCount++;
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
      addUnitTeachers(unit.key, i);
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
        addUnitTeachers(u.key, groupIdx);
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
    const bTeachers = bundle.flatMap(u => unitKeyToTeachers.get(u.key) ?? []);
    const bKeys = bundle.map(u => u.key);
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
        const classConflict = gData[i].unitKeys.some(k => bKeys.some(bk => hasConflict(bk, k, classConflicts)));
        if (classConflict) score -= HARD_PENALTY;
      }
      // 파송 조장의 본인 반은 파송된 조에 들어가면 안 된다(파송 의미 자체를 보장하는 하드 제약).
      if (leaders.some(leader => leader.mode === "sent" && leader.groupIdx === i && bKeys.includes(leader.unitKey))) {
        score -= HARD_PENALTY;
      }
      // 전참 교사 보장 (중간 유도) — 전참 반은 아직 전참이 없는 조로 유도(빈 조 포함).
      // 빈 조를 제외하면 전참 반이 빈 조로 못 가 전참이 한쪽에 뭉치는 편향이 생겨 total>0 조건을 뺀다.
      if (ruleFlags.requireFullTimer) {
        if (bHasFullTimer && gData[i].fullTimerCount === 0) score += FULLTIMER_SPREAD_GUIDE;
      }
      // 최소 2반 유도: 반이 적게 든 조부터 채우도록 (반 개수 × 중간 가중치만큼 감점 → 0반·1반 조 우선)
      if (ruleFlags.minTwoClasses) {
        score -= (gData[i].maleClasses + gData[i].femaleClasses) * CLASS_SPREAD_GUIDE;
      }
      // 인원 균등 배분 (gradient)
      if (ruleFlags.balanceSize) score -= gData[i].total * 100;
      // 남녀반 혼성 보장 (하드) — 배정 후에도 단일 성별로 남는 조를 회피 (혼성 번들은 자연 통과)
      if (ruleFlags.mixGender) {
        const maleAfter = gData[i].maleClasses + bMale;
        const femaleAfter = gData[i].femaleClasses + bFemale;
        if (gData[i].total > 0 && (maleAfter === 0 || femaleAfter === 0)) {
          score -= HARD_PENALTY;
        }
      }
      // 동성으로만 조 구성 (하드) — 배정 후 혼성이 되는 조를 회피 (혼성 번들 자체도 걸림 — 입력 검증이 선차단)
      if (ruleFlags.sameGender) {
        const mixedAfter = gData[i].maleClasses + bMale > 0 && gData[i].femaleClasses + bFemale > 0;
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
        addUnitTeachers(u.key, chosen.idx);
      });
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

export function scoreGroups(
  groups: Group[], units: ClassUnit[],
  studentConflicts: ConflictPair[], teacherConflicts: ConflictPair[], teacherStudentConflicts: ConflictPair[], classConflicts: ConflictPair[],
  classAffinities: ConflictPair[],
  ruleFlags: RuleFlags,
  teachers: TeacherAttendance[],
  sentLeaderExclusions: { groupIdx: number; unitKey: string }[] = [],
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
  // 파송 조장은 ClassUnit에서 빠지므로 이름 기반 고려 관계 맵에 역할 위치를 별도로 넣는다.
  groups.forEach(g => {
    (g.leader || "").split(",").map(n => n.trim()).filter(Boolean)
      .forEach(name => nameToGroup.set(name, g.id));
  });

  // 교사 → 소속 조 맵. tryAssign과 동일하게 "반 담당 교사는 그 반이 배정된 조 소속"으로 본다
  // (assignTeachers=false여서 g.teachers가 비어도 교사 고려 관계를 판정할 수 있게 units 기준으로 도출).
  const bu = units[0]?.bu ?? "";
  const unitKeyToGroupIdx = new Map<string, number>();
  unitKeysInGroup.forEach((keys, i) => keys.forEach(k => unitKeyToGroupIdx.set(k, i)));
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
      const inSame = unitKeysInGroup.some(keys => keys.includes(a) && keys.includes(b));
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
    if (unitKeysInGroup[groupIdx]?.includes(unitKey)) score -= HARD_PENALTY;
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
  classAffinities: ConflictPair[], // 반↔반 결합 — 같은 조 보장 (unitKey 쌍)
  participants: Record<string, Participant>,
  teachers: TeacherAttendance[],
  students: Record<string, { name: string; grade: number; class: number }>,
  leaderEntries1: LeaderEntry[],
  leaderEntries2: LeaderEntry[],
): Group[] {
  const result: Group[] = [];
  for (const bu of ["1부", "2부"] as const) {
    const groupCount = bu === "1부" ? groupCount1bu : groupCount2bu;
    if (groupCount <= 0) continue;
    const rawUnits = buildClassUnits(participants, bu, students);
    if (rawUnits.length === 0) continue;
    const buTeachers = teachers.filter(t => t.bu === bu);
    const entries = bu === "1부" ? leaderEntries1 : leaderEntries2;
    const leaders: ResolvedLeader[] = entries.slice(0, groupCount).flatMap((entry, groupIdx) => {
      const found = findLeaderUnit(entry, bu, participants, students);
      if (!entry.name.trim() || !found) return [];
      return [{
        groupIdx,
        name: entry.name.trim(),
        studentId: found.studentId,
        unitKey: found.unitKey,
        mode: entry.mode || "withClass",
      }];
    });
    const sentLeaderIds = new Set(leaders.filter(l => l.mode === "sent").map(l => l.studentId));
    // 파송 조장 한 명만 본인 반에서 분리한다. 나머지 학생은 기존 반 단위 불변식을 그대로 유지한다.
    const units = rawUnits.map(unit => {
      const kept = unit.studentIds
        .map((studentId, i) => ({ studentId, name: unit.names[i] }))
        .filter(item => !sentLeaderIds.has(item.studentId));
      return { ...unit, studentIds: kept.map(item => item.studentId), names: kept.map(item => item.name) };
    }).filter(unit => unit.studentIds.length > 0);
    const pinnedKeys: (string | null)[] = Array(groupCount).fill(null);
    if (ruleFlags.pinLeaders) {
      leaders.filter(l => l.mode === "withClass").forEach(l => { pinnedKeys[l.groupIdx] = l.unitKey; });
    }
    const sentLeaderExclusions = leaders
      .filter(l => l.mode === "sent")
      .map(l => ({ groupIdx: l.groupIdx, unitKey: l.unitKey }));

    let bestGroups: Group[] | null = null;
    let bestScore = -Infinity;
    // 하드 제약이 많을수록 그리디가 첫 시도에서 막힐 수 있어 반복 횟수를 늘려 위반 0 해를 찾을 확률을 높인다.
    for (let i = 0; i < 16; i++) {
      const g = tryAssign(groupCount, bu, units, buTeachers, studentConflicts, teacherConflicts, teacherStudentConflicts, classConflicts, classAffinities, ruleFlags, pinnedKeys, leaders);
      const s = scoreGroups(g, units, studentConflicts, teacherConflicts, teacherStudentConflicts, classConflicts, ruleFlags.applyConflicts ? classAffinities : [], ruleFlags, buTeachers, sentLeaderExclusions);
      if (s > bestScore) { bestScore = s; bestGroups = g; }
    }
    if (bestGroups) {
      result.push(...bestGroups);
    }
  }
  return result;
}
