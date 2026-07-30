import {
  Group, IguardBus, IguardGbsPlace, IguardMeal, IguardMovement, IguardSeating,
  IguardStaff, PartialAttendanceMap, Room, Student,
} from "./types";
import { parseBusStaffNames } from "./busStaff";
import { normalizeStaffIdentityName } from "./staffIdentity";
import { buildMealOrderSummaries } from "./mealOrder";
import { buildGbsPlaceSummaries } from "./gbsPlaces";
import { groupDisplayName } from "./groupNumber";
import { parseAssignedAreas, roomMatchesAssignedAreas } from "./assignedArea";
import { isCancelledStudent } from "./busParticipation";
import { escapeHtml } from "./exportUtils";

export interface BadgeCardBus {
  day: number;
  busNo: number;
  groups: string[];
  companions: string[];
}

export interface BadgeCardRoom {
  label: string;
  studentNames: string[];
}

export interface BadgeCardData {
  staffId: string;
  staffName: string;
  buses: BadgeCardBus[];
  meals: Array<{ label: string; groups: string[] }>;
  gbs: Array<{ place: string; groups: string[] }>;
  seating: Array<{ label: string; zones: string[] }>;
  assignedRooms: BadgeCardRoom[];
  unmatchedAreaDetails: string[];
}

export interface BadgeCardInput {
  staff: IguardStaff[];
  groups: Group[];
  groupStaff: Record<string, string[]>;
  gbs: Record<string, IguardGbsPlace>;
  buses: IguardBus[];
  meals: IguardMeal[];
  seating: IguardSeating[];
  movements: IguardMovement[];
  rooms: Room[];
  students: Record<string, Student>;
  partial: PartialAttendanceMap;
  cellColors: Record<string, string>;
}

function roomLabel(room: Room): string {
  const dong = room.dong?.trim();
  const number = room.roomNumber.replace(/호$/u, "");
  return dong ? `${dong} ${number}호` : `${number}호`;
}

function activeStudentNames(
  room: Room,
  students: Record<string, Student>,
  partial: PartialAttendanceMap,
  cellColors: Record<string, string>,
): string[] {
  return (room.studentIds || [])
    .filter(id => !isCancelledStudent(id, cellColors) && partial[id]?.type !== "당일참석")
    .map(id => students[id]?.name ?? "명단 미상");
}

export function buildBadgeCard(staffId: string, input: BadgeCardInput): BadgeCardData | null {
  const member = input.staff.find(candidate => candidate.id === staffId);
  if (!member) return null;
  const memberKey = normalizeStaffIdentityName(member.name);

  const buses = input.buses
    .filter(bus => parseBusStaffNames(bus.staff).some(name => normalizeStaffIdentityName(name) === memberKey))
    .map(bus => {
      const allStaff = parseBusStaffNames(bus.staff);
      return {
        day: bus.day === 3 ? 3 : 1,
        busNo: bus.busNo,
        groups: (bus.groupIds || [])
          .map(groupId => input.groups.find(group => group.id === groupId))
          .filter((group): group is Group => !!group)
          .map(group => groupDisplayName(group, input.groups)),
        companions: allStaff.filter(name => normalizeStaffIdentityName(name) !== memberKey),
      };
    })
    .sort((a, b) => a.day - b.day || a.busNo - b.busNo);

  const areaDetails = [...new Set(
    input.movements
      .filter(movement => movement.staffId === staffId && movement.detail?.trim())
      .map(movement => movement.detail!.trim()),
  )];
  const assignedRoomMap = new Map<string, BadgeCardRoom>();
  const unmatchedAreaDetails: string[] = [];
  areaDetails.forEach(detail => {
    const areas = parseAssignedAreas(detail);
    if (!areas) {
      unmatchedAreaDetails.push(detail);
      return;
    }
    const matched = input.rooms.filter(room => roomMatchesAssignedAreas(room, areas));
    if (matched.length === 0) unmatchedAreaDetails.push(detail);
    matched.forEach(room => {
      const names = activeStudentNames(room, input.students, input.partial, input.cellColors);
      if (names.length === 0) return;
      assignedRoomMap.set(room.id, { label: roomLabel(room), studentNames: names });
    });
  });

  return {
    staffId,
    staffName: member.name,
    buses,
    meals: buildMealOrderSummaries(input.meals, input.groups),
    gbs: buildGbsPlaceSummaries(input.groups, input.gbs).map(summary => ({
      place: summary.place,
      groups: summary.groups.map(group => `${group.bu} ${group.label}`),
    })),
    seating: [...input.seating]
      .sort((a, b) => a.day - b.day || a.order - b.order)
      .map(session => ({
        label: `${session.day}일차 ${session.label}`,
        zones: (session.zones || []).map(zone => {
          const labels = zone.groupIds
            .map(groupId => input.groups.find(group => group.id === groupId))
            .filter((group): group is Group => !!group)
            .map(group => groupDisplayName(group, input.groups));
          return `${zone.name}: ${labels.join(" → ") || "미배정"}`;
        }),
      })),
    assignedRooms: [...assignedRoomMap.values()].sort((a, b) => a.label.localeCompare(b.label, "ko", { numeric: true })),
    unmatchedAreaDetails,
  };
}

function row(label: string, value: string): string {
  return `<div class="badge-row"><b>${escapeHtml(label)}</b><span>${escapeHtml(value || "—")}</span></div>`;
}

/** 사용자·운영 데이터는 이 함수에서 모두 escapeHtml을 거쳐 인쇄 HTML로 변환한다. */
export function badgeCardsHtml(cards: BadgeCardData[], retreatName: string, year: number): string {
  const cardHtml = cards.map(card => {
    const buses = card.buses.map(bus =>
      `${bus.day}일차 ${bus.busNo}호차 (${bus.groups.join(", ") || "조 미지정"})${bus.companions.length ? ` · 동승 ${bus.companions.join(", ")}` : ""}`,
    ).join("\n");
    const meals = card.meals.map(meal => `${meal.label}: ${meal.groups.join(" → ")}`).join("\n");
    const gbs = card.gbs.map(item => `${item.place}: ${item.groups.join(", ")}`).join("\n");
    const seating = card.seating.flatMap(session => session.zones.map(zone => `${session.label} · ${zone}`)).join("\n");
    const rooms = card.assignedRooms.map(room => `${room.label}: ${room.studentNames.join(", ")}`).join("\n");
    const unmatched = card.unmatchedAreaDetails.length
      ? `\n구역 확인 필요: ${card.unmatchedAreaDetails.join(" / ")}`
      : "";
    return `<section class="badge-card">
      <header><strong>${escapeHtml(card.staffName)}</strong><small>${escapeHtml(`${retreatName} · ${year}년`)}</small></header>
      ${row("호차·동승", buses)}
      ${row("식사 이동", meals)}
      ${row("GBS 장소", gbs)}
      ${row("집회 이동", seating)}
      ${row("담당 호실", `${rooms}${unmatched}`)}
      ${row("특정 학생", "학생 속성 미연동 — 행정 데이터 계약 후 제공")}
    </section>`;
  }).join("");

  return `<style>
    .badge-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8mm; }
    .badge-card { min-height:86mm; border:1.5px solid #1e293b; border-radius:3mm; padding:4mm; break-inside:avoid; page-break-inside:avoid; overflow:hidden; }
    .badge-card header { display:flex; align-items:baseline; justify-content:space-between; gap:3mm; padding-bottom:2mm; margin-bottom:2mm; border-bottom:2px solid #1e293b; }
    .badge-card header strong { font-size:16px; }
    .badge-card header small { color:#64748b; font-size:8px; text-align:right; }
    .badge-row { display:grid; grid-template-columns:18mm 1fr; gap:2mm; padding:1.3mm 0; border-bottom:1px solid #e2e8f0; font-size:8.5px; line-height:1.35; white-space:pre-line; }
    .badge-row b { color:#475569; }
    .badge-row span { overflow-wrap:anywhere; }
    @media print {
      body { padding:8mm !important; }
      .badge-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6mm; }
    }
  </style><div class="badge-grid">${cardHtml}</div>`;
}
