import { ApplicationPrivate } from "./types";

/**
 * 비공개 신청 정보를 저장 payload로 정규화한다.
 *
 * 빈 값은 `null`로 바꿔 **필드를 지운다**. 예전에는 "값이 하나도 없으면 쓰기 자체를 건너뛰는"
 * 방식이라, 본인·보호자 연락처를 둘 다 지우면 저장에 성공했다고 표시되면서 기존 값이
 * DB에 그대로 남았다. 빈 문자열을 그냥 쓰면 값이 지워지지 않고 ""로 남으므로 null이어야 한다.
 */
export function buildApplicationPrivateUpdates(
  priv: ApplicationPrivate,
): Record<string, string | null> {
  const updates: Record<string, string | null> = {};
  for (const [field, value] of Object.entries(priv)) {
    const trimmed = typeof value === "string" ? value.trim() : value;
    updates[field] = trimmed == null || trimmed === "" ? null : trimmed;
  }
  return updates;
}
