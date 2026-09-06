/** 원본 stage-schema.ts의 조건을 Firebase 식별자와 순수 검증 결과에 맞췄다. 출처는 THIRD_PARTY.md 참조. */
import type { StageOverride } from "./stage";
import { asRecord, isRecordId, pureSchema, type ValidationIssue } from "./validation";

export const stageOverrideSchema = pureSchema<StageOverride>((value) => {
  const row = asRecord(value);
  if (!row) return { success: false, error: { issues: [{ path: [], message: "등단 특이사항을 확인해주세요." }] } };
  const issues: ValidationIssue[] = [];
  if (!isRecordId(row.termStudentId)) issues.push({ path: ["termStudentId"], message: "대상 학생을 선택해주세요." });
  if (typeof row.kind !== "string" || !["MOVE_DEPARTMENT", "FORCE_STAGE", "EXCLUDE_STAGE"].includes(row.kind)) issues.push({ path: ["kind"], message: "특이사항 종류를 확인해주세요." });
  if (typeof row.department !== "string" || !["FIRST", "SECOND"].includes(row.department)) issues.push({ path: ["department"], message: "예배 부서를 선택해주세요." });
  if (row.kind === "FORCE_STAGE" && (typeof row.role !== "string" || !["SINGER", "CHOIR", "RANDOM"].includes(row.role))) issues.push({ path: ["role"], message: "무조건 등단의 포지션을 선택해주세요." });
  if (row.kind !== "FORCE_STAGE" && row.role != null) issues.push({ path: ["role"], message: "등단 안함·부서 이동에는 포지션을 지정하지 않습니다." });
  if (issues.length) return { success: false, error: { issues } };
  return { success: true, data: { termStudentId: row.termStudentId as string, kind: row.kind as StageOverride["kind"], department: row.department as StageOverride["department"], ...(row.kind === "FORCE_STAGE" ? { role: row.role as StageOverride["role"] } : {}) } };
});
