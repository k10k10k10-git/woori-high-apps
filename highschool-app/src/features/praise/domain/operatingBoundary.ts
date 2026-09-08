import type { PraiseMeta } from "../types";
/** 확인할 수 없는 과거 조 이력은 동결하고 전환 이후 업무만 새 원장으로 운영한다. */
export function isPraiseHistoricalReadOnly(meta: Pick<PraiseMeta, "readOnlyBefore">, date: string): boolean {
  return Boolean(meta.readOnlyBefore && date < meta.readOnlyBefore);
}
