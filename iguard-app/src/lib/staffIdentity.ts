export interface StaffIdentityCandidate {
  id: string;
  name: string;
}

/** 접근 계정의 지정 이름과 행정 스탭 이름을 비교하기 위한 최소 정규화. */
export function normalizeStaffIdentityName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/[\s_~\-·()[\]{}.,!?:/\\|'"“”‘’]+/g, "")
    .replace(/(?:sf|스탭)$/i, "")
    .toLocaleLowerCase("ko-KR");
}

/** 지정 이름 → Google 표시 이름 순으로, 정확히 한 명인 경우에만 자동 연결한다. */
export function findPreferredStaffId(
  staff: StaffIdentityCandidate[],
  preferredNames: Array<string | null | undefined>,
): string | null {
  for (const preferredName of preferredNames) {
    const key = normalizeStaffIdentityName(preferredName ?? "");
    if (!key) continue;
    const matches = staff.filter((candidate) => normalizeStaffIdentityName(candidate.name) === key);
    if (matches.length === 1) return matches[0].id;
  }
  return null;
}

/** 자동값은 최초 선택에만 쓰고, 유효한 사용자 수동 선택은 그대로 둔다. */
export function chooseCueCardStaffId(
  staff: StaffIdentityCandidate[],
  currentStaffId: string,
  preferredStaffId: string | null,
  userPicked: boolean,
): string {
  const selectionExists = staff.some((candidate) => candidate.id === currentStaffId);
  if (userPicked && selectionExists) return currentStaffId;
  if (preferredStaffId && staff.some((candidate) => candidate.id === preferredStaffId)) return preferredStaffId;
  return staff[0]?.id ?? "";
}
