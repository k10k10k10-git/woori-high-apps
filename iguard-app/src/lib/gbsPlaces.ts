import { Group, IguardGbsPlace } from "./types";
import { groupDisplayName, sortGroupsByNumber } from "./groupNumber";
import { normalizeStaffIdentityName } from "./staffIdentity";

export interface GbsPlaceGroup {
  id: string;
  label: string;
  bu: string;
}

export interface GbsPlaceSummary {
  place: string;
  groups: GbsPlaceGroup[];
}

/** 새 이가드 값을 우선하고, 이관 전 행정 group.gbs는 읽기 폴백으로 유지한다. */
export function effectiveGbsPlace(
  group: Group,
  gbs: Record<string, IguardGbsPlace>,
): string {
  return gbs[group.id]?.place?.trim() || group.gbs?.trim() || "";
}

/** 장소 → 조 목록은 저장하지 않고 조별 장소에서 매번 파생한다. */
export function buildGbsPlaceSummaries(
  groups: Group[],
  gbs: Record<string, IguardGbsPlace>,
): GbsPlaceSummary[] {
  const byPlace = new Map<string, GbsPlaceGroup[]>();
  sortGroupsByNumber(groups).forEach(group => {
    const place = effectiveGbsPlace(group, gbs);
    if (!place) return;
    const current = byPlace.get(place) || [];
    current.push({
      id: group.id,
      label: groupDisplayName(group, groups),
      bu: group.bu,
    });
    byPlace.set(place, current);
  });
  return [...byPlace.entries()]
    .map(([place, assignedGroups]) => ({ place, groups: assignedGroups }))
    .sort((a, b) => a.place.localeCompare(b.place, "ko", { numeric: true }));
}

/** 선택한 스탭이 맡은 조의 GBS 장소. ID 배정을 우선하고 레거시 이름 배정도 읽는다. */
export function gbsPlacesForStaff(
  staffId: string,
  staffName: string | undefined,
  groups: Group[],
  groupStaff: Record<string, string[]>,
  gbs: Record<string, IguardGbsPlace>,
): GbsPlaceSummary[] {
  const staffNameKey = normalizeStaffIdentityName(staffName || "");
  const assignedGroups = groups.filter(group => {
    if ((groupStaff[group.id] || []).includes(staffId)) return true;
    if (!staffNameKey) return false;
    return (group.staff || "")
      .split(/[,\n/]+/)
      .some(name => normalizeStaffIdentityName(name) === staffNameKey);
  });
  return buildGbsPlaceSummaries(assignedGroups, gbs);
}
