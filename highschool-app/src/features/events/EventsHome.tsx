"use client";

import FieldHomeClient from "@/app/field/FieldHomeClient";
import RetreatsHome from "@/app/RetreatsHome";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea } from "@/features/portal/accessPolicy";

/**
 * 수련회 행정과 현장 운영이 같은 행사 목록에서 시작하도록 만드는 통합 진입점이다.
 * 행정 권한이 있으면 전체 운영 화면을, 현장 권한만 있으면 현장 화면을 연다.
 */
export default function EventsHome() {
  const { roles } = useAuth();
  return canAccessArea("retreat-admin", roles) ? <RetreatsHome /> : <FieldHomeClient />;
}
