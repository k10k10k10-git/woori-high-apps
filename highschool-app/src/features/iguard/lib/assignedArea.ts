import { findRoomMapLocation, normalizeLodgingText } from "./lodgingMap";
import type { Room } from "./types";

export interface AssignedArea {
  building?: string | null;
  floors?: number[];
}

/** 괄호 상세를 원문 손실 없이 여러 담당 구역으로 해석한다. 모르는 표현은 null로 남긴다. */
export function parseAssignedAreas(detail?: string | null): AssignedArea[] | null {
  const raw = (detail || "").trim();
  if (!raw) return null;
  const areas = raw.split(/\s*\+\s*/).map(part => {
    const building = part.match(/(A동|C동|본관(?:\s*숙소동)?|숙소동|별관(?:\s*숙소)?|VIP|HRD(?:센터)?\s*(?:핵심관|인재관)?|핵심관|인재관|강의동)/i)?.[1]?.trim() || null;
    const floorText = part.match(/(\d+(?:\s*,\s*\d+)*)\s*층/)?.[1];
    const floors = floorText
      ? [...new Set(floorText.split(",").map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0))]
      : [];
    if (!building && floors.length === 0) return null;
    return { building, floors } satisfies AssignedArea;
  });
  if (areas.some(area => area === null)) return null;
  return areas as AssignedArea[];
}

function roomFloor(room: Room): number | null {
  const digits = room.roomNumber.replace(/\D/g, "");
  if (digits.length < 3) return null;
  const floor = Number(digits[0]);
  return Number.isInteger(floor) && floor > 0 ? floor : null;
}

function buildingMatches(room: Room, building?: string | null): boolean {
  if (!building) return true;
  const wanted = normalizeLodgingText(building);
  const roomDong = normalizeLodgingText(room.dong);
  if (roomDong && (roomDong.includes(wanted) || wanted.includes(roomDong))) return true;

  const location = findRoomMapLocation(room);
  if (!location) return false;
  const aliases = [location.building.label, ...location.building.aliases].map(normalizeLodgingText);
  if (aliases.some(alias => alias.includes(wanted) || wanted.includes(alias))) return true;
  if (/^(본관|본관숙소동|숙소동)$/.test(wanted)) return location.building.id === "main";
  if (/^(별관|별관숙소|vip)$/.test(wanted)) return location.building.id === "annex";
  if (/^(hrd|hrd센터|핵심관|hrd핵심관|hrd센터핵심관)$/.test(wanted)) return location.building.id === "hrd-core";
  if (/^(인재관|hrd인재관|hrd센터인재관)$/.test(wanted)) return location.building.id === "hrd-talent";
  return false;
}

export function roomMatchesAssignedAreas(room: Room, areas: AssignedArea[] | null): boolean {
  if (!areas?.length) return false;
  const floor = roomFloor(room);
  return areas.some(area => {
    if (!buildingMatches(room, area.building)) return false;
    return !area.floors?.length || (floor != null && area.floors.includes(floor));
  });
}
