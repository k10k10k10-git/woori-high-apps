import type { AccessLevel, IguardAccessLevel } from "@/context/AuthContext";

export type PortalArea = "home" | "semester" | "retreat-admin" | "retreat-field";

export type PortalAccess = {
  accessLevel: AccessLevel;
  iguardAccessLevel: IguardAccessLevel;
};

/**
 * 통합 앱의 화면 접근 계약.
 *
 * 행정 권한과 이가드 권한을 합쳐 판정하지 않는다.
 * Firebase Rules가 최종 보안 경계지만, 화면 진입 단계에서도 같은 계약을 지켜야 한다.
 */
export function canAccessPortalArea(area: PortalArea, access: PortalAccess): boolean {
  if (area === "home") {
    return access.accessLevel !== "none" || access.iguardAccessLevel !== "none";
  }
  if (area === "retreat-field") {
    return access.iguardAccessLevel !== "none";
  }
  return access.accessLevel !== "none";
}

export function retreatEntryHref(retreatId: string, access: PortalAccess): string {
  const encodedId = encodeURIComponent(retreatId);
  return canAccessPortalArea("retreat-admin", access)
    ? `/retreat/${encodedId}`
    : `/retreat/${encodedId}/field`;
}
