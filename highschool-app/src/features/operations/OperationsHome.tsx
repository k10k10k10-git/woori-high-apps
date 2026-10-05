"use client";

import Link from "next/link";
import { ArrowRight, ClockCounterClockwise, GearSix, ListChecks, UsersThree } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { canManageRolesOf, canManageSiteRequests, canViewActivityLogs } from "@/features/portal/accessPolicy";
import { canAccessOperationsCenter } from "@/features/teams/teamModel";
import OperationsGate from "./OperationsGate";

const ITEMS = [
  { href: "/operations/semesters", label: "학기 운영", description: "신청 접수, 훈련반 배치, 사역팀 배치와 전체 출석", Icon: ListChecks, show: "semester" },
  { href: "/operations/accounts", label: "계정·권한", description: "플랫폼 권한과 담당 팀을 분리해 관리", Icon: UsersThree, show: "accounts" },
  { href: "/operations/requests", label: "요청 관리", description: "접수된 문제 제보와 처리 결과", Icon: GearSix, show: "requests" },
  { href: "/operations/activity", label: "활동 로그", description: "누가 무엇을 변경했는지 한국어로 확인", Icon: ClockCounterClockwise, show: "activity" },
] as const;

export default function OperationsHome() {
  const { roles, teamMemberships } = useAuth();
  const semesterAllowed = canAccessOperationsCenter(roles, teamMemberships);
  const items = ITEMS.map((item) => ({ ...item, allowed: item.show === "semester" ? semesterAllowed : item.show === "accounts" ? canManageRolesOf(roles) : item.show === "requests" ? canManageSiteRequests(roles) : canViewActivityLogs(roles) }));
  // 메뉴 목록에는 운영 데이터가 없다. 실제 업무는 각 목적지의 권한 게이트가 확인한다.
  return <OperationsGate allowed><main className="team-first-page"><header className="team-first-page-header"><div><p className="section-kicker">OPERATIONS</p><h1>운영센터</h1><p>팀을 가로지르는 학기 모집·배치와 계정, 요청, 변경 기록을 관리합니다. 모든 메뉴가 보이며, 내용은 담당 권한에 따라 열립니다.</p></div></header><section className="operations-grid">{items.map(({ href, label, description, Icon, allowed }) => <Link key={href} href={href} prefetch={allowed ? undefined : false} className="operations-card"><Icon size={21} aria-hidden="true" /><div><h2>{label}{!allowed && <small className="ml-2 text-xs font-medium text-[var(--color-text-muted)]">권한 필요</small>}</h2><p>{description}</p></div><ArrowRight size={16} aria-hidden="true" /></Link>)}</section></main></OperationsGate>;
}
