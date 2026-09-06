import { assertPraiseId } from "../paths";
export class PraiseDomainError extends Error {
  constructor(public status: number, message: string, public code = "invalid_request") { super(message); this.name = "PraiseDomainError"; }
}
export function requireValue(condition: unknown, message: string, code = "invalid_request", status = 400): asserts condition {
  if (!condition) throw new PraiseDomainError(status, message, code);
}
export function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), "입력 형식을 확인해 주세요.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = 120, optional = false): string {
  if (optional && (value === undefined || value === null || value === "")) return "";
  requireValue(typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), `${label}을(를) 확인해 주세요.`);
  return value.trim();
}
export function id(value: unknown, label = "기록 번호"): string {
  const valueText = text(value, label, 128);
  try { return assertPraiseId(valueText); } catch { throw new PraiseDomainError(400, `${label}을(를) 확인해 주세요.`); }
}
export function integer(value: unknown, min: number, max: number, label: string): number {
  requireValue(typeof value === "number" && Number.isInteger(value) && value >= min && value <= max, `${label}은(는) ${min}~${max} 범위로 입력해 주세요.`);
  return value;
}
export function bool(value: unknown, label: string): boolean {
  requireValue(typeof value === "boolean", `${label}을(를) 선택해 주세요.`); return value;
}
export function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  requireValue(typeof value === "string" && values.includes(value as T), `${label}을(를) 선택해 주세요.`); return value as T;
}
export function date(value: unknown, label = "날짜"): string {
  const s = text(value, label, 10);
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0,10) === s && s >= "2000-01-01" && s <= "2100-12-31", `${label}을(를) 확인해 주세요.`);
  return s;
}
export function list<T>(value: unknown, max: number, parse: (item: unknown) => T, label = "목록"): T[] {
  requireValue(Array.isArray(value) && value.length <= max, `${label}은(는) ${max}개까지 입력할 수 있습니다.`);
  return value.map(parse);
}
export function ids(value: unknown, max = 1000): string[] {
  const values = list(value, max, (item) => id(item)); requireValue(new Set(values).size === values.length, "중복된 사람 또는 기록이 있습니다."); return values;
}
export function revision(actual: number | undefined, expected: unknown) {
  integer(expected, 0, Number.MAX_SAFE_INTEGER, "기록 버전");
  requireValue((actual ?? 0) === expected, "다른 사람이 먼저 수정했습니다. 최신 기록을 불러온 뒤 다시 확인해 주세요.", "revision_conflict", 409);
}
