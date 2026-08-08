/**
 * 인원체크 키 — 배열 인덱스를 쓰지 않는다.
 *
 * 구형 키는 `{day}:{kind}:{ownerId}:{idx}:{name}` 처럼 명단 배열의 인덱스를 담았다.
 * 행사 중 교사 한 명이 불참 처리돼 명단이 밀리면 뒤 사람들의 인덱스가 전부 바뀌어,
 * 이미 저장된 체크가 엉뚱한 사람 것이 되거나 화면에서 사라지고 해제도 못 했다.
 * 신형 키는 `{day}:{kind}:{ownerId}:{name}` 으로 순서와 무관하다.
 *
 * 운영 DB에는 구형 키로 저장된 체크가 남아 있으므로(2026-08-09 확인) 읽을 때 둘 다 인식한다.
 * 쓰기는 항상 신형으로만 한다 — 마이그레이션 없이 자연 소멸시킨다.
 */
export type MemberKind = "teacher" | "bus-staff";

/** 명단 순서와 무관한 멤버 id. `keyOf(day, id)`를 거쳐 저장 키가 된다. */
export function stableMemberId(kind: MemberKind, ownerId: string, name: string): string {
  return `${kind}:${ownerId}:${name}`;
}

/**
 * 이 멤버를 나타내는 **저장된 키 전부**(신형 1개 + 남아 있는 구형 n개).
 * 체크 여부 판정과 해제에 모두 이 목록을 쓴다 — 구형 키를 빼먹으면 해제해도 다시 살아난다.
 */
export function memberCheckKeys(
  checkedKeys: ReadonlySet<string>,
  day: number,
  memberId: string,
): string[] {
  const currentKey = `${day}:${memberId}`;
  const found = checkedKeys.has(currentKey) ? [currentKey] : [];

  // 구형 키 탐색은 `{kind}:{ownerId}:{name}` 3토막인 멤버(교사·스탭)에만 해당한다.
  // 학생은 `student:{sid}` 2토막이라 인덱스를 쓴 적이 없다.
  const parts = memberId.split(":");
  if (parts.length !== 3) return found;

  const [kind, ownerId, name] = parts;
  const prefix = `${day}:${kind}:${ownerId}:`;
  const suffix = `:${name}`;
  for (const key of checkedKeys) {
    if (key === currentKey) continue;
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    const middle = key.slice(prefix.length, key.length - suffix.length);
    if (/^\d+$/.test(middle)) found.push(key);
  }
  return found;
}

/** 체크 여부 — 신형·구형 어느 쪽으로 저장돼 있어도 참이다. */
export function isMemberChecked(
  checkedKeys: ReadonlySet<string>,
  day: number,
  memberId: string,
): boolean {
  return memberCheckKeys(checkedKeys, day, memberId).length > 0;
}
