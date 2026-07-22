import { PartialAttendanceMap, Room, Student } from "./types";
import { isCancelledStudent } from "./busParticipation";

export interface RoomHotspot {
  roomNumber: string;
  left: number;
  top: number;
}

export interface LodgingMapPage {
  id: string;
  floorLabel: string;
  image: string;
  minWidth: number;
  hotspots: RoomHotspot[];
}

export interface LodgingMapBuilding {
  id: string;
  label: string;
  aliases: string[];
  genericAliases?: string[];
  fallbackCapacity?: number;
  pages: LodgingMapPage[];
}

export interface LodgingRoomSummary {
  room: Room;
  buildingId: string;
  pageId: string;
  hotspot: RoomHotspot;
  classLabels: string[];
  shortClassLabels: string[];
  studentNames: string[];
  teacherNames: string[];
  peopleCount: number;
}

export interface LodgingMapResult {
  mapped: LodgingRoomSummary[];
  unmatched: Room[];
}

const pct = (value: number, total: number) => Number(((value / total) * 100).toFixed(2));

function mainRow(roomNumbers: string[], top: number): RoomHotspot[] {
  const centers = [148, 344, 540, 736, 932, 1128];
  return roomNumbers.map((roomNumber, index) => ({ roomNumber, left: pct(centers[index], 2248), top }));
}

function coreFloor(floor: number, top: number, bottom: number): RoomHotspot[] {
  const topRooms = [`${floor}12`, `${floor}11`, `${floor}06`, `${floor}05`];
  const bottomRooms = [`${floor}10`, `${floor}09`, `${floor}08`, `${floor}07`, `${floor}04`, `${floor}03`, `${floor}02`, `${floor}01`];
  const topX = [15.36, 41.24, 66.2, 91.24];
  const bottomX = [11.21, 19.59, 27.88, 36.18, 62.14, 72.43, 82.8, 93.24];
  return [
    ...topRooms.map((roomNumber, index) => ({ roomNumber, left: topX[index], top })),
    ...bottomRooms.map((roomNumber, index) => ({ roomNumber, left: bottomX[index], top: bottom })),
  ];
}

function talentFloor(floor: number, top: number, bottom: number): RoomHotspot[] {
  const topRooms = [`${floor}01`, `${floor}02`];
  const bottomRooms = [`${floor}03`, `${floor}04`, `${floor}05`, `${floor}06`];
  const topX = [12.3, 22.7];
  const bottomX = [62.2, 72.5, 82.8, 93.2];
  return [
    ...topRooms.map((roomNumber, index) => ({ roomNumber, left: topX[index], top })),
    ...bottomRooms.map((roomNumber, index) => ({ roomNumber, left: bottomX[index], top: bottom })),
  ];
}

export const LODGING_MAP_BUILDINGS: LodgingMapBuilding[] = [
  {
    id: "main",
    label: "본관 숙소동",
    aliases: ["본관 숙소동", "본관숙소동", "본관", "숙소동"],
    fallbackCapacity: 10,
    pages: [
      {
        id: "main-1f",
        floorLabel: "1층",
        image: "/room-maps/main-1f.webp",
        minWidth: 720,
        hotspots: [
          ...mainRow(["112", "110", "108", "106", "104", "102"], 15.1),
          ...mainRow(["111", "109", "107", "105", "103", "101"], 61.0),
        ],
      },
      {
        id: "main-2f",
        floorLabel: "2층",
        image: "/room-maps/main-2f.webp",
        minWidth: 720,
        hotspots: [
          ...mainRow(["212", "210", "208", "206", "204", "202"], 15.0),
          ...mainRow(["211", "209", "207", "205", "203", "201"], 33.5),
          { roomNumber: "217", left: 94.4, top: 33.5 },
          { roomNumber: "216", left: 76.5, top: 64.5 },
          { roomNumber: "215", left: 94.4, top: 64.5 },
          { roomNumber: "214", left: 76.5, top: 81.0 },
          { roomNumber: "213", left: 94.4, top: 81.0 },
        ],
      },
      {
        id: "main-3f",
        floorLabel: "3층",
        image: "/room-maps/main-3f.webp",
        minWidth: 720,
        hotspots: [
          ...mainRow(["312", "310", "308", "306", "304", "302"], 15.1),
          ...mainRow(["311", "309", "307", "305", "303", "301"], 61.0),
          { roomNumber: "317", left: 94.4, top: 61.0 },
          { roomNumber: "316", left: 76.5, top: 79.5 },
          { roomNumber: "315", left: 94.4, top: 79.5 },
          { roomNumber: "314", left: 76.5, top: 92.0 },
          { roomNumber: "313", left: 94.4, top: 92.0 },
        ],
      },
    ],
  },
  {
    id: "hrd-core",
    label: "HRD 핵심관 3인실",
    aliases: ["HRD 핵심관", "HRD센터 핵심관", "핵심관", "숙소동 3인실(핵심관)"],
    genericAliases: ["HRD", "HRD센터", "HRD 센터"],
    fallbackCapacity: 3,
    pages: [{
      id: "hrd-core-all",
      floorLabel: "1-4층",
      image: "/room-maps/hrd-core.webp",
      minWidth: 620,
      hotspots: [
        ...coreFloor(4, 9.05, 21.34),
        ...coreFloor(3, 32.33, 44.29),
        ...coreFloor(2, 55.5, 67.56),
        ...coreFloor(1, 78.56, 90.63),
      ],
    }],
  },
  {
    id: "hrd-talent",
    label: "HRD 인재관 2인실",
    aliases: ["HRD 인재관", "HRD센터 인재관", "인재관", "숙소동 2인실(인재관)"],
    genericAliases: ["HRD", "HRD센터", "HRD 센터"],
    fallbackCapacity: 2,
    pages: [{
      id: "hrd-talent-all",
      floorLabel: "1-4층",
      image: "/room-maps/hrd-talent.webp",
      minWidth: 620,
      hotspots: [
        ...talentFloor(4, 8.8, 21.8),
        ...talentFloor(3, 33.5, 46.2),
        ...talentFloor(2, 57.6, 70.6),
        ...talentFloor(1, 81.3, 94.2),
      ],
    }],
  },
];

export function normalizeLodgingText(value?: string | null): string {
  return (value ?? "").toLowerCase().replace(/[\s_~\-·()[\]{}.,/\\]+/g, "");
}

function normalizedRoomNumber(value: string): string {
  return value.trim().replace(/호$/u, "");
}

function findBuilding(room: Room): LodgingMapBuilding | undefined {
  const dong = normalizeLodgingText(room.dong);
  const exact = LODGING_MAP_BUILDINGS.find(building => building.aliases.some(alias => normalizeLodgingText(alias) === dong));
  if (exact) return exact;

  const keyword = LODGING_MAP_BUILDINGS.find(building => building.aliases.some(alias => {
    const normalizedAlias = normalizeLodgingText(alias);
    return normalizedAlias.length >= 3 && dong.includes(normalizedAlias);
  }));
  if (keyword) return keyword;

  return LODGING_MAP_BUILDINGS.find(building =>
    building.fallbackCapacity === room.capacity
    && (dong === "" || building.genericAliases?.some(alias => normalizeLodgingText(alias) === dong)),
  );
}

export function findRoomMapLocation(room: Room): { building: LodgingMapBuilding; page: LodgingMapPage; hotspot: RoomHotspot } | null {
  const building = findBuilding(room);
  if (!building) return null;
  const roomNumber = normalizedRoomNumber(room.roomNumber);
  for (const page of building.pages) {
    const hotspot = page.hotspots.find(item => item.roomNumber === roomNumber);
    if (hotspot) return { building, page, hotspot };
  }
  return null;
}

function studentClass(student: Student): { full: string; short: string } {
  const bu = student.buNum ?? "?";
  return {
    full: `${bu}부 ${student.grade}학년 ${student.class}반`,
    short: `${bu}-${student.grade}-${student.class}`,
  };
}

export function buildLodgingMapResult(
  rooms: Room[],
  students: Record<string, Student>,
  partial: PartialAttendanceMap,
  cellColors: Record<string, string>,
): LodgingMapResult {
  const mapped: LodgingRoomSummary[] = [];
  const unmatched: Room[] = [];

  rooms.forEach(room => {
    const activeStudentIds = (room.studentIds ?? []).filter(studentId =>
      !isCancelledStudent(studentId, cellColors) && partial[studentId]?.type !== "당일참석",
    );
    const teacherNames = (room.teachers ?? []).map(name => name.trim()).filter(Boolean);
    if (activeStudentIds.length === 0 && teacherNames.length === 0) return;

    const location = findRoomMapLocation(room);
    if (!location) {
      unmatched.push(room);
      return;
    }

    const studentRecords = activeStudentIds.map(id => students[id]).filter((student): student is Student => !!student);
    const classes = studentRecords.map(studentClass);
    const classLabels = [...new Set(classes.map(item => item.full))].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
    const shortClassLabels = [...new Set(classes.map(item => item.short))].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
    const studentNames = activeStudentIds.map(id => students[id]?.name ?? "명단 미상");

    mapped.push({
      room,
      buildingId: location.building.id,
      pageId: location.page.id,
      hotspot: location.hotspot,
      classLabels,
      shortClassLabels,
      studentNames,
      teacherNames,
      peopleCount: activeStudentIds.length + teacherNames.length,
    });
  });

  return { mapped, unmatched };
}
