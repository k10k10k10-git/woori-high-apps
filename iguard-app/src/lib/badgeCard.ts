import {
  Group, IguardBus, IguardGbsPlace, IguardMeal, IguardMovement, IguardSeating,
  IguardPost, IguardScheduleBlock, IguardStaff, PartialAttendanceMap, Room, Student,
} from "./types";
import { parseBusStaffNames } from "./busStaff";
import { normalizeStaffIdentityName } from "./staffIdentity";
import { buildMealOrderSummaries } from "./mealOrder";
import { effectiveGbsPlace } from "./gbsPlaces";
import { groupDisplayName, sortGroupsByDisplayNumber } from "./groupNumber";
import { parseAssignedAreas, roomMatchesAssignedAreas } from "./assignedArea";
import { isCancelledStudent } from "./busParticipation";
import { escapeHtml } from "./exportUtils";
import { compareBlocks, timeRangeLabel } from "./scheduleTime";
import { personalAssignmentLabel } from "./personalDuty";

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
  seating: Array<{ label: string; zones: string[]; zoneGroups: string[][] }>;
  timeline: Array<{
    day: number;
    time: string;
    label: string;
    assignments: string[];
  }>;
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
  schedule: IguardScheduleBlock[];
  posts: IguardPost[];
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
  const staffNames = input.staff.map(candidate => candidate.name);

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
  const postNames = new Map(input.posts.map(post => [
    post.id,
    post.area ? `[${post.area}] ${post.name}` : post.name,
  ]));
  const timeline = [...input.schedule]
    .sort(compareBlocks)
    .map(block => {
      const assignments = input.movements
        .filter(movement => movement.staffId === staffId && movement.blockId === block.id)
        .map(movement => {
          const post = postNames.get(movement.postId) || "삭제된 포스트";
          return personalAssignmentLabel([
            post,
            movement.round,
            movement.note,
          ].filter(Boolean).join(" · "), staffNames);
        })
        .filter(Boolean);
      return {
        day: block.day,
        time: timeRangeLabel(block),
        label: block.label,
        assignments,
      };
    });
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
    gbs: sortGroupsByDisplayNumber(input.groups)
      .map(group => ({
        place: effectiveGbsPlace(group, input.gbs),
        groups: [groupDisplayName(group, input.groups)],
      }))
      .filter(item => !!item.place),
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
        zoneGroups: (session.zones || []).map(zone =>
          zone.groupIds
            .map(groupId => input.groups.find(group => group.id === groupId))
            .filter((group): group is Group => !!group)
            .map(group => groupDisplayName(group, input.groups)),
        ),
      })),
    timeline,
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
    const gbs = card.gbs.map(item => `${item.groups.join(", ")}: ${item.place}`).join("\n");
    const seating = card.seating.map(session =>
      `${session.label}: ${session.zoneGroups.map(groups => groups.join(" · ") || "미배정").join(" / ")}`,
    ).join("\n");
    const timeline = card.timeline.map(item =>
      `${item.day}일차 ${item.time} ${item.label}${item.assignments.length ? ` — ${item.assignments.join(" / ")}` : ""}`,
    ).join("\n");
    return `<section class="badge-card">
      <header><strong>${escapeHtml(card.staffName)}</strong><small>${escapeHtml(`${retreatName} · ${year}년`)}</small></header>
      ${row("호차·동승", buses)}
      ${row("식사 이동", meals)}
      ${row("GBS 장소", gbs)}
      ${row("집회 이동", seating)}
      ${row("전체 일정", timeline)}
    </section>`;
  }).join("");

  return `<style>
    .badge-grid { display:block; }
    .badge-card { min-height:250mm; border:1.5px solid #1e293b; border-radius:4mm; padding:8mm; break-inside:avoid; page-break-inside:avoid; overflow:hidden; }
    .badge-card + .badge-card { margin-top:10mm; }
    .badge-card header { display:flex; align-items:baseline; justify-content:space-between; gap:4mm; padding-bottom:4mm; margin-bottom:3mm; border-bottom:2px solid #1e293b; }
    .badge-card header strong { font-size:24px; }
    .badge-card header small { color:#64748b; font-size:11px; text-align:right; }
    .badge-row { display:grid; grid-template-columns:27mm 1fr; gap:3mm; padding:3mm 0; border-bottom:1px solid #e2e8f0; font-size:11px; line-height:1.5; white-space:pre-line; }
    .badge-row b { color:#475569; }
    .badge-row span { overflow-wrap:anywhere; }
    @media print {
      body { padding:0 !important; }
      .badge-card { width:100%; height:277mm; min-height:277mm; border-radius:3mm; padding:8mm; page-break-after:always; break-after:page; }
      .badge-card:last-child { page-break-after:auto; break-after:auto; }
      .badge-card + .badge-card { margin-top:0; }
    }
  </style><div class="badge-grid">${cardHtml}</div>`;
}
