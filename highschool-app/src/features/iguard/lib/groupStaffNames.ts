import { normalizeStaffIdentityName } from "./staffIdentity";

interface StaffNameCandidate {
  id: string;
  name: string;
}

function parseNames(value?: string): string[] {
  return (value || "")
    .split(/[,\n/]+/)
    .map(name => name.trim())
    .filter(Boolean);
}

/**
 * 행정 조편성의 레거시 이름(group.staff)과 이가드 조스탭 배정(groupStaff의 ID)을
 * 한 목록으로 합친다. 같은 사람은 공백·sf/스탭 꼬리표 차이를 무시하고 한 번만 표시한다.
 */
export function resolveGroupStaffNames(
  legacyStaff: string | undefined,
  assignedStaffIds: string[] | undefined,
  staff: StaffNameCandidate[],
): string[] {
  const names = parseNames(legacyStaff);
  const seen = new Set(names.map(normalizeStaffIdentityName).filter(Boolean));
  const staffById = new Map(staff.map(candidate => [candidate.id, candidate.name.trim()]));

  (assignedStaffIds || []).forEach(id => {
    const name = staffById.get(id);
    if (!name) return;
    const key = normalizeStaffIdentityName(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  });

  return names;
}
