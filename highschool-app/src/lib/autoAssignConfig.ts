export interface ConflictPair {
  a: string;
  b: string;
}

export interface RuleFlags {
  keepSameClass: boolean;
  inferGenderByClass: boolean;
  excludeNonClassTeachers: boolean;
  ensureNonEmptyGroups: boolean;
  ensureEvenGroupCount: boolean;
  optimizeResults: boolean;
  assignTeachers: boolean;
  requireFullTimer: boolean;
  pinLeaders: boolean;
  applyConflicts: boolean;
  mixGender: boolean;
  sameGender: boolean;
  balanceGrade: boolean;
  balanceSize: boolean;
  minTwoClasses: boolean;
  maxGroupSize: number;
}

export interface LeaderEntry {
  name: string;
  grade: string;
  cls: string;
  studentId: string;
  mode: "withClass" | "sent";
}

export interface AutoAssignConfigData {
  version: 1;
  groupCount1bu: number;
  groupCount2bu: number;
  rules: RuleFlags;
  studentConflicts: ConflictPair[];
  teacherConflicts: ConflictPair[];
  teacherStudentConflicts: ConflictPair[];
  classConflicts: ConflictPair[];
  classAffinities: ConflictPair[];
  leaderEntries1: LeaderEntry[];
  leaderEntries2: LeaderEntry[];
  updatedAt?: number;
}

export const DEFAULT_AUTO_ASSIGN_RULES: RuleFlags = {
  keepSameClass: true,
  inferGenderByClass: true,
  excludeNonClassTeachers: true,
  ensureNonEmptyGroups: true,
  ensureEvenGroupCount: true,
  optimizeResults: true,
  assignTeachers: true,
  requireFullTimer: true,
  pinLeaders: true,
  applyConflicts: true,
  mixGender: true,
  sameGender: false,
  balanceGrade: true,
  balanceSize: true,
  minTwoClasses: false,
  maxGroupSize: 0,
};

export function emptyLeaderEntry(): LeaderEntry {
  return { name: "", grade: "", cls: "", studentId: "", mode: "withClass" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteInt(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

function normalizePairs(value: unknown): ConflictPair[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item) || typeof item.a !== "string" || typeof item.b !== "string") return [];
    const a = item.a.trim();
    const b = item.b.trim();
    return a && b && a !== b ? [{ a, b }] : [];
  });
}

function normalizeLeaders(value: unknown): LeaderEntry[] {
  const raw = Array.isArray(value) ? value.slice(0, 20) : [];
  const entries = raw.map(item => {
    if (!isRecord(item)) return emptyLeaderEntry();
    return {
      name: typeof item.name === "string" ? item.name : "",
      grade: typeof item.grade === "string" ? item.grade : "",
      cls: typeof item.cls === "string" ? item.cls : "",
      studentId: typeof item.studentId === "string" ? item.studentId : "",
      mode: item.mode === "sent" ? "sent" as const : "withClass" as const,
    };
  });
  while (entries.length < 20) entries.push(emptyLeaderEntry());
  return entries;
}

/** Firebase의 누락 필드·구버전 값을 현재 설정 형태로 안전하게 보정한다. */
export function normalizeAutoAssignConfig(value: unknown): AutoAssignConfigData {
  const raw = isRecord(value) ? value : {};
  const rawRules = isRecord(raw.rules) ? raw.rules : {};
  const boolRule = (key: keyof Omit<RuleFlags, "maxGroupSize">) =>
    typeof rawRules[key] === "boolean" ? rawRules[key] as boolean : DEFAULT_AUTO_ASSIGN_RULES[key];

  return {
    version: 1,
    groupCount1bu: finiteInt(raw.groupCount1bu, 10, 1, 20),
    groupCount2bu: finiteInt(raw.groupCount2bu, 10, 1, 20),
    rules: {
      keepSameClass: boolRule("keepSameClass"),
      inferGenderByClass: boolRule("inferGenderByClass"),
      excludeNonClassTeachers: boolRule("excludeNonClassTeachers"),
      ensureNonEmptyGroups: boolRule("ensureNonEmptyGroups"),
      ensureEvenGroupCount: boolRule("ensureEvenGroupCount"),
      optimizeResults: boolRule("optimizeResults"),
      assignTeachers: boolRule("assignTeachers"),
      requireFullTimer: boolRule("requireFullTimer"),
      pinLeaders: boolRule("pinLeaders"),
      applyConflicts: boolRule("applyConflicts"),
      mixGender: boolRule("mixGender"),
      sameGender: boolRule("sameGender"),
      balanceGrade: boolRule("balanceGrade"),
      balanceSize: boolRule("balanceSize"),
      minTwoClasses: boolRule("minTwoClasses"),
      maxGroupSize: finiteInt(rawRules.maxGroupSize, 0, 0, 30),
    },
    studentConflicts: normalizePairs(raw.studentConflicts),
    teacherConflicts: normalizePairs(raw.teacherConflicts),
    teacherStudentConflicts: normalizePairs(raw.teacherStudentConflicts),
    classConflicts: normalizePairs(raw.classConflicts),
    classAffinities: normalizePairs(raw.classAffinities),
    leaderEntries1: normalizeLeaders(raw.leaderEntries1),
    leaderEntries2: normalizeLeaders(raw.leaderEntries2),
    updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : undefined,
  };
}
