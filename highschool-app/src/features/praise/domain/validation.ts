/** 외부 의존성 없이 가져오기와 설정에 공용으로 쓰는 최소 검증 결과. */
export type ValidationIssue = { path: PropertyKey[]; message: string };
export type ValidationResult<T> = { success: true; data: T } | { success: false; error: { issues: ValidationIssue[] } };
export type PureSchema<T> = { safeParse(value: unknown): ValidationResult<T>; parse(value: unknown): T };

export function pureSchema<T>(validate: (value: unknown) => ValidationResult<T>): PureSchema<T> {
  return {
    safeParse: validate,
    parse(value) {
      const result = validate(value);
      if (!result.success) throw new Error(result.error.issues.map((issue) => issue.message).join(" · "));
      return result.data;
    },
  };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function isRecordId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[.#$\[\]/\s\u0000-\u001f\u007f]/.test(value);
}
