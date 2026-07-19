import type { RoomClassPin, RoomGender } from "./roomAutoAssign";

export interface RoomAutoAssignSettings {
  includeStaff: boolean;
  audioCount: number;
  audioGender: RoomGender | null;
  medicalCount: number;
  medicalGender: RoomGender | null;
  classPins: RoomClassPin[];
}

export interface RoomAutoAssignConfigData extends RoomAutoAssignSettings {
  version: 1;
  updatedAt?: number;
}

export const DEFAULT_ROOM_AUTO_ASSIGN_SETTINGS: RoomAutoAssignSettings = {
  includeStaff: true,
  audioCount: 3,
  audioGender: null,
  medicalCount: 1,
  medicalGender: null,
  classPins: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(999, Math.max(0, Math.trunc(value)))
    : fallback;
}

function normalizeGender(value: unknown): RoomGender | null {
  return value === "남" || value === "여" ? value : null;
}

function normalizeClassPins(value: unknown): RoomClassPin[] {
  if (!Array.isArray(value)) return [];
  const classKeys = new Set<string>();
  const roomIds = new Set<string>();
  return value.slice(0, 100).flatMap(item => {
    if (!isRecord(item) || typeof item.classKey !== "string" || typeof item.roomId !== "string") return [];
    const classKey = item.classKey.trim();
    const roomId = item.roomId.trim();
    if (!classKey || !roomId || classKeys.has(classKey) || roomIds.has(roomId)) return [];
    classKeys.add(classKey);
    roomIds.add(roomId);
    return [{ classKey, roomId }];
  });
}

/** 누락 필드와 구버전 값을 현재 방배정 설정 형태로 안전하게 보정한다. */
export function normalizeRoomAutoAssignConfig(value: unknown): RoomAutoAssignConfigData {
  const raw = isRecord(value) ? value : {};
  return {
    version: 1,
    includeStaff: typeof raw.includeStaff === "boolean"
      ? raw.includeStaff
      : DEFAULT_ROOM_AUTO_ASSIGN_SETTINGS.includeStaff,
    audioCount: finiteInt(raw.audioCount, DEFAULT_ROOM_AUTO_ASSIGN_SETTINGS.audioCount),
    audioGender: normalizeGender(raw.audioGender),
    medicalCount: finiteInt(raw.medicalCount, DEFAULT_ROOM_AUTO_ASSIGN_SETTINGS.medicalCount),
    medicalGender: normalizeGender(raw.medicalGender),
    classPins: normalizeClassPins(raw.classPins),
    updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : undefined,
  };
}
