import type { Semester } from "@/features/semester/types";
import type { Retreat } from "@/lib/types";
import {
  canAccessPortalArea,
  iguardScope,
  retreatEntryHref,
  type MinistryRole,
} from "./accessPolicy";
import { IGUARD_VIEW_GROUPS, RETREAT_TAB_GROUPS, SEMESTER_TABS } from "./featureCatalog";

export type PortalSearchItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  keywords: string;
  area: "home" | "semester" | "retreat" | "field" | "support";
};

type BuildSearchInput = {
  role: MinistryRole;
  semesters: Semester[];
  retreats: Retreat[];
};

function normalize(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

export function filterPortalSearchItems(items: PortalSearchItem[], query: string) {
  const normalized = normalize(query);
  if (!normalized) return items.slice(0, 8);
  return items
    .filter((item) => normalize(`${item.label} ${item.description} ${item.keywords}`).includes(normalized))
    .slice(0, 12);
}

export function buildPortalSearchItems({ role, semesters, retreats }: BuildSearchInput): PortalSearchItem[] {
  const items: PortalSearchItem[] = [
    {
      id: "home",
      label: "홈",
      description: "오늘 일정, 업무함, 공유 사역 캘린더",
      href: "/",
      keywords: "대시보드 오늘 일정 업무 준비",
      area: "home",
    },
    {
      id: "suggestions",
      label: "사이트 건의사항 작성",
      description: "오류와 개선 아이디어를 정리해 안전하게 공유",
      href: "/suggestions",
      keywords: "피드백 문의 오류 버그 아이디어 건의",
      area: "support",
    },
    {
      id: "ministry-guide",
      label: "사역 가이드",
      description: "월별 사역 흐름, 운영 플레이북, 공지와 수련회 회고",
      href: "/ministry-guide",
      keywords: "예배 목양 출석 훈련 사역팀 수련회 행정 공지 특별사역 피드백 피드포워드",
      area: "support",
    },
  ];

  if (canAccessPortalArea("semester", role)) {
    items.push({
      id: "semester-home",
      label: "학기 중 사역",
      description: "학기 목록과 훈련·사역팀 운영",
      href: "/semesters",
      keywords: SEMESTER_TABS.join(" "),
      area: "semester",
    });
    for (const semester of semesters) {
      items.push({
        id: `semester-${semester.id}`,
        label: semester.meta.title,
        description: "훈련·사역팀 · 새친구·신청·배치·출석·수료·커리큘럼·아카이브",
        href: `/semester/${encodeURIComponent(semester.id)}`,
        keywords: `${semester.id} ${SEMESTER_TABS.join(" ")}`,
        area: "semester",
      });
    }
  }

  const adminAllowed = canAccessPortalArea("retreat-admin", role);
  const fieldAllowed = canAccessPortalArea("retreat-field", role);
  if (adminAllowed) {
    items.push({
      id: "retreat-home",
      label: "수련회 행정",
      description: "수련회 목록과 명단·편성·이동·물품·현장 준비",
      href: "/retreats",
      keywords: RETREAT_TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => tab.label)).join(" "),
      area: "retreat",
    });
  }
  if (fieldAllowed) {
    const visibleGroups = IGUARD_VIEW_GROUPS.filter(
      (group) => iguardScope(role) === "all" || group.label === "실행",
    );
    items.push({
      id: "field-home",
      label: "수련회 이가드",
      description: "개인 큐카드, 포스트, 조별 정보와 인원체크",
      href: "/field",
      keywords: visibleGroups.flatMap((group) => group.views.map((view) => view.label)).join(" "),
      area: "field",
    });
  }

  for (const retreat of retreats) {
    const href = retreatEntryHref(retreat.id, role);
    items.push({
      id: `retreat-${retreat.id}`,
      label: `${retreat.year}년 ${retreat.name}`,
      description: adminAllowed ? "수련회 행정·현장 운영" : "수련회 현장 운영",
      href,
      keywords: adminAllowed
        ? `행정 이가드 ${RETREAT_TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => tab.label)).join(" ")}`
        : "이가드 개인 큐카드 포스트 조별 인원체크",
      area: adminAllowed ? "retreat" : "field",
    });
  }

  return items;
}
