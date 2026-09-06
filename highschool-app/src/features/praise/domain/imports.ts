/** 원본: andew423-source/high-school-worship-team @ 982dc53ab3ee6d1261736167e5a000deec07974b. 변경 범위는 THIRD_PARTY.md 참조. */
import { asRecord, pureSchema, type ValidationIssue, type ValidationResult } from "./validation";

export const IMPORT_KINDS = ["STUDENTS", "STAFF"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
export type ImportMapping = Record<string, string>;
export type RawRow = Record<string, unknown>;

export const studentFields = [
  { key: "internalCode", label: "내부 ID", required: false, aliases: ["내부 id", "내부id", "학번", "id"] },
  { key: "name", label: "이름", required: true, aliases: ["이름", "성명", "학생명"] },
  { key: "grade", label: "학년", required: true, aliases: ["학년"] },
  { key: "gender", label: "성별", required: true, aliases: ["성별"] },
  { key: "serviceDepartment", label: "예배 부서", required: true, aliases: ["예배 부서", "예배부서", "부서", "예배"] },
  {
    key: "team",
    label: "팀",
    required: true,
    aliases: ["팀", "파트", "팀 구분", "싱어팀·세션팀", "싱어팀/세션팀", "싱어·세션", "싱어/세션"],
  },
  { key: "isStudentLeader", label: "학생 인도자 여부", required: false, aliases: ["학생 인도자 여부", "인도자 여부", "학생인도자", "인도자"] },
  { key: "note", label: "기본 비고", required: false, aliases: ["기본 비고"] },
  { key: "termNote", label: "학기 비고", required: false, aliases: ["비고", "학기 비고", "특이사항"] },
  { key: "active", label: "재적", required: false, aliases: ["재적", "활성", "재적 상태"] },
] as const;

export const staffFields = [
  { key: "name", label: "이름", required: true, aliases: ["이름", "성명", "스탭명"] },
  { key: "email", label: "이메일", required: false, aliases: ["이메일", "email"] },
  { key: "gender", label: "성별", required: true, aliases: ["성별"] },
  {
    key: "roleTitle",
    label: "역할",
    required: false,
    aliases: ["역할", "직책", "담당", "팀", "팀 구분", "싱어팀·세션팀", "싱어팀/세션팀"],
  },
  { key: "singerCapable", label: "싱어 가능", required: false, aliases: ["싱어 가능", "싱어가능", "싱어"] },
  { key: "groupLeaderCapable", label: "조 담당 가능", required: false, aliases: ["조 담당 가능", "조담당가능", "조 담당"] },
  { key: "preferredService", label: "선호 예배", required: false, aliases: ["선호 예배", "선호예배", "예배"] },
  { key: "defaultStageRole", label: "기본 주일 역할", required: false, aliases: ["기본 주일 역할", "기본주일역할", "주일 역할", "주일역할", "등단 역할"] },
  { key: "excludeFromAutoSinger", label: "자동 싱어 제외", required: false, aliases: ["자동 싱어 제외", "자동싱어제외", "자동 배정 제외"] },
  { key: "isDefaultStageLeader", label: "기본 인도자", required: false, aliases: ["기본 인도자", "기본인도자", "주일 인도자"] },
  { key: "note", label: "비고", required: false, aliases: ["비고", "특이사항"] },
  { key: "active", label: "활성", required: false, aliases: ["활성", "재적"] },
] as const;

export type StudentImportRow = {
  internalCode: string | null; name: string; grade: number; gender: "FEMALE" | "MALE";
  serviceDepartment: "FIRST" | "SECOND"; team: "SINGER" | "SESSION"; isStudentLeader: boolean;
  note: string | null; termNote: string | null; active: boolean;
};
export type StaffImportRow = {
  name: string; email: string | null; gender: "FEMALE" | "MALE"; roleTitle: string | null;
  singerCapable: boolean; groupLeaderCapable: boolean; preferredService: "FIRST" | "SECOND" | "BOTH";
  defaultStageRole: "SINGER" | "SESSION"; excludeFromAutoSinger: boolean; isDefaultStageLeader: boolean;
  note: string | null; active: boolean;
};
export type StaffImportDefaults = Partial<Pick<StaffImportRow, "singerCapable" | "defaultStageRole" | "excludeFromAutoSinger" | "isDefaultStageLeader">>;
export type ImportOptions = {
  staffDefaults?: StaffImportDefaults;
  /** 호출자가 외부 ID로 연결한 설정을 반환한다. 이름으로 사람을 자동 식별하지 않는다. */
  staffDefaultsForRow?: (raw: RawRow, rowNumber: number) => StaffImportDefaults | undefined;
};

function validateImport<T>(value: unknown, kind: ImportKind): ValidationResult<T> {
  const record = asRecord(value);
  if (!record) return { success: false, error: { issues: [{ path: [], message: "가져올 행을 확인해주세요." }] } };
  const row: Record<string, unknown> = record;
  const issues: ValidationIssue[] = [];
  const output: RawRow = {};
  function fail(key: string) { issues.push({ path: [key], message: `${key} 입력값을 확인해주세요.` }); }
  function stringField(key: string, max: number, required = false) {
    const value = row[key];
    if (!required && value == null) { output[key] = null; return; }
    if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) { fail(key); return; }
    output[key] = value.trim();
  }
  function enumField(key: string, options: readonly string[]) {
    if (typeof row[key] !== "string" || !options.includes(row[key])) fail(key);
    else output[key] = row[key];
  }
  function booleanField(key: string, fallback: boolean) {
    if (row[key] === undefined) output[key] = fallback;
    else if (typeof row[key] === "boolean") output[key] = row[key];
    else fail(key);
  }
  stringField("name", 100, true);
  enumField("gender", ["FEMALE", "MALE"]);
  stringField("note", 1000);
  booleanField("active", true);
  if (kind === "STUDENTS") {
    stringField("internalCode", 100);
    if (typeof row.grade !== "number" || !Number.isInteger(row.grade) || row.grade < 1 || row.grade > 3) fail("grade");
    else output.grade = row.grade;
    enumField("serviceDepartment", ["FIRST", "SECOND"]);
    enumField("team", ["SINGER", "SESSION"]);
    booleanField("isStudentLeader", false);
    stringField("termNote", 1000);
  } else {
    const email = row.email;
    if (email === "" || email === null) output.email = null;
    else if (typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) output.email = email;
    else fail("email");
    stringField("roleTitle", 100);
    enumField("preferredService", ["FIRST", "SECOND", "BOTH"]);
    enumField("defaultStageRole", ["SINGER", "SESSION"]);
    booleanField("singerCapable", true);
    booleanField("groupLeaderCapable", false);
    booleanField("excludeFromAutoSinger", false);
    booleanField("isDefaultStageLeader", false);
  }
  return issues.length ? { success: false, error: { issues } } : { success: true, data: output as T };
}
export const studentImportSchema = pureSchema<StudentImportRow>((value) => validateImport<StudentImportRow>(value, "STUDENTS"));
export const staffImportSchema = pureSchema<StaffImportRow>((value) => validateImport<StaffImportRow>(value, "STAFF"));

export type RowIssue = { row: number; message: string };

export function fieldsFor(kind: ImportKind) {
  return kind === "STUDENTS" ? studentFields : staffFields;
}

export function guessMapping(headers: string[], kind: ImportKind): ImportMapping {
  const fields = fieldsFor(kind);
  return Object.fromEntries(headers.map((header) => {
    const normalized = normalizeHeader(header);
    const field = fields.find((candidate) => candidate.aliases.some((alias) => normalizeHeader(alias) === normalized));
    return [header, field?.key ?? ""];
  }));
}

export function validateMappedRows(kind: ImportKind, rawRows: RawRow[], mapping: ImportMapping, options: ImportOptions = {}) {
  const rows: Array<StudentImportRow | StaffImportRow> = [];
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const names = new Map<string, number>();
  const internalCodes = new Map<string, number>();
  const mappedTargets = new Set(Object.values(mapping).filter(Boolean));
  const missingFields = fieldsFor(kind).filter((field) => field.required && !mappedTargets.has(field.key));

  if (missingFields.length) {
    return {
      rows,
      errors: missingFields.map((field) => ({ row: 1, message: `필수 열 '${field.label}'이 연결되지 않았습니다.` })),
      warnings,
    };
  }

  rawRows.forEach((raw, index) => {
    const mapped = Object.fromEntries(Object.entries(mapping)
      .filter(([, target]) => target)
      .map(([source, target]) => [target, raw[source]]));
    const rowNumber = index + 2;
    const normalized = kind === "STUDENTS" ? normalizeStudent(mapped) : normalizeStaff(mapped, { ...options.staffDefaults, ...options.staffDefaultsForRow?.(raw, rowNumber) });
    const result = kind === "STUDENTS" ? studentImportSchema.safeParse(normalized) : staffImportSchema.safeParse(normalized);

    if (!result.success) {
      errors.push({
        row: rowNumber,
        message: result.error.issues.map((issue) => formatValidationIssue(kind, issue.path[0], mapped)).join(" · "),
      });
      return;
    }

    const nameKey = result.data.name.replaceAll(" ", "").toLocaleLowerCase("ko-KR");
    if (names.has(nameKey)) warnings.push({ row: rowNumber, message: `같은 파일에 '${result.data.name}' 이름이 중복됩니다. 서로 다른 사람인지 확인해주세요.` });
    else names.set(nameKey, rowNumber);

    if (kind === "STUDENTS") {
      const code = (result.data as StudentImportRow).internalCode;
      if (code && internalCodes.has(code)) errors.push({ row: rowNumber, message: `내부 ID '${code}'가 파일 안에서 중복됩니다.` });
      else if (code) internalCodes.set(code, rowNumber);
    }
    rows.push(result.data);
  });

  return { rows, errors, warnings };
}

function normalizeStudent(row: RawRow) {
  return {
    internalCode: nullableText(row.internalCode),
    name: text(row.name),
    grade: parseGrade(row.grade),
    gender: parseGender(row.gender),
    serviceDepartment: parseService(row.serviceDepartment, false),
    team: parseTeam(row.team),
    isStudentLeader: parseBoolean(row.isStudentLeader, false),
    note: nullableText(row.note),
    termNote: nullableText(row.termNote),
    active: parseBoolean(row.active, true),
  };
}

function normalizeStaff(row: RawRow, defaults: StaffImportDefaults) {
  const roleTitle = nullableText(row.roleTitle);
  const inferredSinger = defaults.singerCapable ?? inferSingerCapable(roleTitle);
  return {
    name: text(row.name),
    email: text(row.email).toLowerCase(),
    gender: parseGender(row.gender),
    roleTitle,
    singerCapable: parseBoolean(row.singerCapable, inferredSinger),
    groupLeaderCapable: parseBoolean(row.groupLeaderCapable, false),
    preferredService: text(row.preferredService) ? parseService(row.preferredService, true) : "BOTH",
    defaultStageRole: text(row.defaultStageRole)
      ? parseStageRole(row.defaultStageRole)
      : defaults.defaultStageRole ?? (inferredSinger ? "SINGER" : "SESSION"),
    excludeFromAutoSinger: parseBoolean(row.excludeFromAutoSinger, defaults.excludeFromAutoSinger ?? false),
    isDefaultStageLeader: parseBoolean(row.isDefaultStageLeader, defaults.isDefaultStageLeader ?? false),
    note: nullableText(row.note),
    active: parseBoolean(row.active, true),
  };
}

function normalizeHeader(value: string) { return value.trim().replaceAll(/[_\-\s]/g, "").toLowerCase(); }
function text(value: unknown) { return value == null ? "" : String(value).trim(); }
function nullableText(value: unknown) { const valueText = text(value); return valueText || null; }
function parseGrade(value: unknown) { const match = text(value).replaceAll(/\s/g, "").match(/^(?:고)?([1-3])(?:학년)?$/); return match ? Number(match[1]) : Number.NaN; }
function parseGender(value: unknown) {
  const valueText = text(value).toLowerCase();
  if (["여", "여자", "여성", "f", "female"].includes(valueText)) return "FEMALE";
  if (["남", "남자", "남성", "m", "male"].includes(valueText)) return "MALE";
  return "";
}
function parseService(value: unknown, allowBoth: boolean) {
  const valueText = text(value).replaceAll(" ", "").toLowerCase();
  if (allowBoth && ["모두", "양쪽", "1·2부", "1,2부", "both"].includes(valueText)) return "BOTH";
  if (["1", "1부", "first"].includes(valueText)) return "FIRST";
  if (["2", "2부", "second"].includes(valueText)) return "SECOND";
  return "";
}
function parseTeam(value: unknown) {
  const valueText = text(value).replaceAll(/[_\-\s]/g, "").toLowerCase();
  if (["싱어", "싱어팀", "singer", "singerteam", "vocal", "보컬", "보컬팀"].includes(valueText)) return "SINGER";
  if (["세션", "세션팀", "session", "sessionteam", "악기", "악기팀"].includes(valueText)) return "SESSION";
  return "";
}
function parseStageRole(value: unknown) {
  const valueText = text(value).replaceAll(/[_\-\s]/g, "").toLowerCase();
  if (["싱어", "싱어팀", "singer", "vocal", "보컬"].includes(valueText)) return "SINGER";
  if (["세션", "세션팀", "session", "악기"].includes(valueText)) return "SESSION";
  return "";
}
function parseBoolean(value: unknown, fallback: boolean) {
  const valueText = text(value).toLowerCase();
  if (!valueText) return fallback;
  if (["예", "네", "y", "yes", "true", "1", "활성", "재적", "학생 인도자"].includes(valueText)) return true;
  if (["아니오", "아니요", "n", "no", "false", "0", "비활성"].includes(valueText)) return false;
  return fallback;
}

function inferSingerCapable(roleTitle: string | null): boolean {
  const normalizedRole = (roleTitle ?? "").replaceAll(/[_\-\s]/g, "").toLowerCase();
  if (normalizedRole.includes("싱어") || normalizedRole.includes("보컬")) return true;
  if (normalizedRole.includes("세션") || normalizedRole.includes("악기")) return false;
  return true;
}

function formatValidationIssue(kind: ImportKind, path: PropertyKey | undefined, mapped: RawRow) {
  const key = typeof path === "string" ? path : "";
  const label = fieldsFor(kind).find((field) => field.key === key)?.label ?? "입력값";
  const rawValue = text(mapped[key]);
  const shownValue = rawValue ? `'${rawValue}'` : "빈칸";

  if (key === "name") return `${label}: 이름을 입력해주세요.`;
  if (key === "grade") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 1~3학년으로 입력해주세요.`;
  if (key === "gender") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 남 또는 여로 입력해주세요.`;
  if (key === "serviceDepartment") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 1부 또는 2부로 입력해주세요.`;
  if (key === "team") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 싱어 또는 세션으로 입력해주세요.`;
  if (key === "preferredService") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 1부, 2부 또는 모두로 입력해주세요.`;
  if (key === "defaultStageRole") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 싱어 또는 세션으로 입력해주세요.`;
  if (key === "email") return `${label}: 이메일 형식을 확인해주세요.`;
  return `${label}: 입력값을 확인해주세요.`;
}
