import type { Room, TeacherAttendance } from "./types";

export type RoomGender = "남" | "여";

export interface RoomAutoStudent {
  id: string;
  name: string;
  bu: string;
  grade: number;
  classNum: number;
  gender: RoomGender;
}

export type RoomAdultCategory =
  | "classTeacher"
  | "teacher"
  | "staff"
  | "minister"
  | "audio"
  | "medical";

export interface RoomAutoAdult {
  id: string;
  name: string;
  gender: RoomGender | null;
  category: RoomAdultCategory;
  classKey?: string;
}

export interface RoomClassPin {
  classKey: string;
  roomId: string;
}

export interface RoomAutoAssignInput {
  rooms: Room[];
  students: RoomAutoStudent[];
  adults: RoomAutoAdult[];
  classPins?: RoomClassPin[];
  simulations?: number;
  seedOffset?: number;
  includeStaff?: boolean;
}

export interface RoomAutoAssignResult {
  rooms: Room[];
  score: number;
  simulationCount: number;
  assignedStudentCount: number;
  assignedAdultCount: number;
  unassignedStudents: RoomAutoStudent[];
  unassignedAdults: RoomAutoAdult[];
  hardViolations: string[];
  warnings: string[];
  usedRoomCount: number;
  emptyBedCount: number;
  classRoomFillerCount: number;
  classRoomCount: number;
  classRoomEmptyBedCount: number;
}

const HARD_PENALTY = 1_000_000;

function parseTeacherClass(teacher: Pick<TeacherAttendance, "bu" | "classKey">): string | undefined {
  const match = teacher.classKey?.match(/(\d+)학년\s*(\d+)반/);
  if (!match || (teacher.bu !== "1부" && teacher.bu !== "2부")) return undefined;
  return `${teacher.bu}-${Number(match[1])}-${Number(match[2])}`;
}

export function classifyRoomAdult(teacher: TeacherAttendance): RoomAutoAdult {
  const text = [teacher.classKey, teacher.role, teacher.programTeam].filter(Boolean).join(" ");
  const classKey = parseTeacherClass(teacher);
  let category: RoomAdultCategory;
  if (/교역|목사|전도사|강도사/.test(text)) category = "minister";
  else if (/의료|의무|간호/.test(text)) category = "medical";
  else if (/음향|방송|미디어/.test(text)) category = "audio";
  else if (classKey) category = "classTeacher";
  else if (teacher.bu === "스탭") category = "staff";
  else category = "teacher";
  return {
    id: teacher.id,
    name: teacher.name,
    gender: teacher.gender ?? null,
    category,
    classKey,
  };
}

export function makeExternalAdults(
  category: "audio" | "medical",
  count: number,
  gender: RoomGender | null,
  existingCount = 0,
): RoomAutoAdult[] {
  const label = category === "audio" ? "외부 음향" : "외부 의료";
  return Array.from({ length: Math.max(0, count - existingCount) }, (_, index) => ({
    id: `external-${category}-${existingCount + index + 1}`,
    name: `${label} ${existingCount + index + 1}`,
    gender,
    category,
  }));
}

function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function profileKey(room: Room): string {
  return `${(room.dong ?? "").trim()}|${room.capacity}`;
}

function roomOrder(a: Room, b: Room): number {
  return (a.dong ?? "").localeCompare(b.dong ?? "", "ko", { numeric: true })
    || a.roomNumber.localeCompare(b.roomNumber, "ko", { numeric: true });
}

function runTrial(input: RoomAutoAssignInput, seed: number, exploreProfiles: boolean): RoomAutoAssignResult {
  const random = mulberry32(seed);
  const rooms: Room[] = input.rooms.map(room => ({ ...room, studentIds: [], teachers: [] }));
  const roomById = new Map(rooms.map(room => [room.id, room]));
  const unusedRoomIds = new Set(rooms.map(room => room.id));
  const assignedStudentIds = new Set<string>();
  const assignedAdultIds = new Set<string>();
  const adultAssignmentRoomIds = new Map<string, string>();
  const hardViolations: string[] = [];
  const warnings: string[] = [];
  const classPinByClass = new Map<string, RoomClassPin>();
  const pinClassByRoom = new Map<string, string>();
  (input.classPins ?? []).forEach(pin => {
    if (!roomById.has(pin.roomId)) {
      hardViolations.push(`${pin.classKey}: 지정한 방을 찾을 수 없습니다.`);
      return;
    }
    if (classPinByClass.has(pin.classKey)) {
      hardViolations.push(`${pin.classKey}: 기준 방이 두 개 이상 지정되었습니다.`);
      return;
    }
    const existingClass = pinClassByRoom.get(pin.roomId);
    if (existingClass && existingClass !== pin.classKey) {
      hardViolations.push(`${roomById.get(pin.roomId)?.roomNumber ?? pin.roomId}: ${existingClass}와 ${pin.classKey}가 같은 방을 지정했습니다.`);
      return;
    }
    classPinByClass.set(pin.classKey, pin);
    pinClassByRoom.set(pin.roomId, pin.classKey);
  });
  const pinnedRoomIds = new Set(pinClassByRoom.keys());

  const roomOccupancy = (room: Room) => (room.studentIds?.length ?? 0) + (room.teachers?.length ?? 0);
  const assignAdult = (room: Room, adult: RoomAutoAdult) => {
    room.teachers = [...(room.teachers ?? []), adult.name];
    assignedAdultIds.add(adult.id);
    adultAssignmentRoomIds.set(adult.id, room.id);
  };

  const validAdults = input.adults.filter(adult => {
    if (adult.gender) return true;
    hardViolations.push(`${adult.name}: 성별이 없어 방을 안전하게 배정할 수 없습니다.`);
    return false;
  });

  function takeExclusiveGroup(group: RoomAutoAdult[], label: string) {
    const byGender = new Map<RoomGender, RoomAutoAdult[]>();
    group.forEach(adult => {
      if (!adult.gender) return;
      byGender.set(adult.gender, [...(byGender.get(adult.gender) ?? []), adult]);
    });
    if (byGender.size > 1) {
      warnings.push(`${label} 인원은 남녀 방 규칙 때문에 성별별 전용 방으로 나뉩니다.`);
    }
    byGender.forEach((members, gender) => {
      const candidates = shuffled(
        rooms.filter(room => unusedRoomIds.has(room.id) && !pinnedRoomIds.has(room.id) && room.type === gender && room.capacity >= members.length),
        random,
      ).sort((a, b) => (a.capacity - members.length) - (b.capacity - members.length));
      const room = candidates[0];
      if (!room) {
        hardViolations.push(`${label} ${gender} ${members.length}명을 함께 넣을 전용 방이 없습니다.`);
        return;
      }
      unusedRoomIds.delete(room.id);
      members.forEach(adult => assignAdult(room, adult));
    });
  }

  const ministers = validAdults.filter(adult => adult.category === "minister");
  const audio = validAdults.filter(adult => adult.category === "audio");
  const medical = validAdults.filter(adult => adult.category === "medical");
  if (ministers.length) takeExclusiveGroup(ministers, "교역자");
  if (audio.length) takeExclusiveGroup(audio, "외부 음향");
  medical.forEach(adult => takeExclusiveGroup([adult], "외부 의료"));

  const classTeachers = new Map<string, RoomAutoAdult[]>();
  validAdults.filter(adult => adult.category === "classTeacher" && adult.classKey).forEach(adult => {
    classTeachers.set(adult.classKey!, [...(classTeachers.get(adult.classKey!) ?? []), adult]);
  });

  const studentClasses = new Map<string, RoomAutoStudent[]>();
  input.students.forEach(student => {
    const key = `${student.bu}-${student.grade}-${student.classNum}`;
    studentClasses.set(key, [...(studentClasses.get(key) ?? []), student]);
  });

  const classEntries = shuffled([...studentClasses.entries()], random)
    .sort((a, b) => Number(classPinByClass.has(b[0])) - Number(classPinByClass.has(a[0]))
      || b[1].length - a[1].length || random() - 0.5);

  for (const [classKey, classStudents] of classEntries) {
    const classPin = classPinByClass.get(classKey);
    const pinnedRoom = classPin ? roomById.get(classPin.roomId) : undefined;
    const genders = new Set(classStudents.map(student => student.gender));
    if (genders.size > 1) {
      warnings.push(`${classKey}: 한 반에 남녀가 함께 있어 성별별 방으로 나눕니다.`);
      if (classPin) hardViolations.push(`${classKey}: 남녀가 섞인 반은 방 하나를 기준 방으로 고정할 수 없습니다.`);
    }
    const allOwnTeachers = (classTeachers.get(classKey) ?? [])
      .filter(teacher => !assignedAdultIds.has(teacher.id));
    allOwnTeachers.filter(teacher => !teacher.gender || !genders.has(teacher.gender)).forEach(teacher => {
      hardViolations.push(`${teacher.name}: 담당 반(${classKey}) 학생과 같은 성별 방에 함께 배정할 수 없습니다.`);
    });
    for (const gender of genders) {
      const members = shuffled(classStudents.filter(student => student.gender === gender), random);
      if (pinnedRoom && pinnedRoom.type !== gender) {
        hardViolations.push(`${classKey}: 지정한 ${pinnedRoom.roomNumber} 방은 ${pinnedRoom.type}자 방이어서 ${gender} 학생을 배정할 수 없습니다.`);
        continue;
      }
      const profileRooms = new Map<string, Room[]>();
      rooms.filter(room => unusedRoomIds.has(room.id)
        && room.type === gender
        && (!pinnedRoomIds.has(room.id) || room.id === classPin?.roomId)
        && (!pinnedRoom || profileKey(room) === profileKey(pinnedRoom))).forEach(room => {
        const key = profileKey(room);
        profileRooms.set(key, [...(profileRooms.get(key) ?? []), room]);
      });

      const ownTeachers = allOwnTeachers.filter(teacher => teacher.gender === gender);
      const candidates = [...profileRooms.entries()].flatMap(([key, available]) => {
        const capacity = available[0]?.capacity ?? 0;
        if (capacity <= 0) return [];
        const roomCount = Math.ceil((members.length + ownTeachers.length) / capacity);
        const teacherRoomCount = ownTeachers.length > 0 ? Math.ceil(ownTeachers.length / (capacity - 1)) : 0;
        // 담당 교사가 든 방마다 자기 반 학생이 최소 1명 있어야 한다.
        if (capacity <= 1 && ownTeachers.length > 0) return [];
        if (available.length < roomCount || roomCount > members.length || teacherRoomCount > members.length) return [];
        if (pinnedRoom && !available.some(room => room.id === pinnedRoom.id)) return [];
        const beds = roomCount * capacity;
        return [{
          key,
          available,
          capacity,
          roomCount,
          emptyAfterClass: beds - members.length - ownTeachers.length,
        }];
      });

      const rankedCandidates = shuffled(candidates, random).sort((a, b) =>
        a.emptyAfterClass - b.emptyAfterClass
        || a.roomCount - b.roomCount
        || a.capacity - b.capacity
      );
      // 첫 시뮬레이션은 가장 좋은 휴리스틱 후보를 보장하고, 나머지 시뮬레이션은
      // 상위 3개 프로필까지 탐색한다. 기존 구현은 동률이 아니면 매번 같은 프로필만
      // 골라 30회를 실행해도 차선 조합을 사실상 비교하지 못했다.
      const explorationPool = rankedCandidates.slice(0, 3);
      const roll = random();
      const explorationIndex = roll < 0.60 ? 0 : roll < 0.87 ? 1 : 2;
      const candidate = exploreProfiles
        ? explorationPool[Math.min(explorationIndex, explorationPool.length - 1)]
        : rankedCandidates[0];

      if (!candidate) {
        hardViolations.push(`${classKey} ${gender} ${members.length}명을 같은 건물·정원의 방들에 배정할 수 없습니다.`);
        continue;
      }

      const selectedRooms = pinnedRoom
        ? [pinnedRoom, ...shuffled(candidate.available.filter(room => room.id !== pinnedRoom.id), random).sort(roomOrder)]
          .slice(0, candidate.roomCount)
        : shuffled(candidate.available, random).sort(roomOrder).slice(0, candidate.roomCount);
      selectedRooms.forEach(room => unusedRoomIds.delete(room.id));

      // 교사를 먼저 배치하되 각 방에 학생 한 자리 이상을 남긴다.
      let teacherIndex = 0;
      for (const room of selectedRooms) {
        while (teacherIndex < ownTeachers.length && roomOccupancy(room) < room.capacity - 1) {
          assignAdult(room, ownTeachers[teacherIndex]);
          teacherIndex++;
        }
      }

      // 사용한 모든 반 방에 학생을 한 명씩 넣어 담당 교사가 학생 없는 방에 남지 않게 한다.
      let studentIndex = 0;
      for (const room of selectedRooms) {
        const student = members[studentIndex++];
        room.studentIds.push(student.id);
        assignedStudentIds.add(student.id);
      }
      for (; studentIndex < members.length; studentIndex++) {
        const room = selectedRooms.find(item => roomOccupancy(item) < item.capacity);
        if (!room) break;
        const student = members[studentIndex];
        room.studentIds.push(student.id);
        assignedStudentIds.add(student.id);
      }

      // 후보 생성이 이 불변식을 보장하지만, 계산 변경 시 조용히 누락되지 않도록 즉시 방어한다.
      for (const teacher of ownTeachers) {
        if (!assignedAdultIds.has(teacher.id)) {
          hardViolations.push(`${teacher.name}: 담당 반 학생과 같은 방에 배정할 자리가 없습니다.`);
        }
      }
    }
  }

  const remainingAdults = shuffled(validAdults.filter(adult =>
    !assignedAdultIds.has(adult.id)
    && adult.category !== "classTeacher"
    && adult.category !== "minister"
    && adult.category !== "audio"
    && adult.category !== "medical"
  ), random);

  for (const adult of remainingAdults) {
    const classRoom = rooms
      .filter(room => room.type === adult.gender
        && room.studentIds.length > 0
        && roomOccupancy(room) < room.capacity)
      .sort((a, b) => (a.capacity - roomOccupancy(a)) - (b.capacity - roomOccupancy(b)))[0];
    if (classRoom) {
      assignAdult(classRoom, adult);
      continue;
    }
    const openAdultRoom = rooms
      .filter(room => !unusedRoomIds.has(room.id) && room.type === adult.gender && room.studentIds.length === 0 && roomOccupancy(room) < room.capacity)
      .find(room => (room.teachers ?? []).every(name => {
        const occupant = input.adults.find(item => item.name === name);
        return occupant && !["minister", "audio", "medical"].includes(occupant.category);
      }));
    if (openAdultRoom) {
      assignAdult(openAdultRoom, adult);
      continue;
    }
    const newRoom = shuffled(rooms.filter(room => unusedRoomIds.has(room.id) && room.type === adult.gender), random)
      .sort((a, b) => a.capacity - b.capacity || roomOrder(a, b))[0];
    if (!newRoom) continue;
    unusedRoomIds.delete(newRoom.id);
    assignAdult(newRoom, adult);
  }

  const unassignedStudents = input.students.filter(student => !assignedStudentIds.has(student.id));
  const unassignedAdults = input.adults.filter(adult => !assignedAdultIds.has(adult.id));
  if (unassignedStudents.length) hardViolations.push(`학생 ${unassignedStudents.length}명이 미배정입니다.`);
  if (unassignedAdults.length) hardViolations.push(`교사·스탭·외부인원 ${unassignedAdults.length}명이 미배정입니다.`);

  rooms.forEach(room => {
    if (roomOccupancy(room) > room.capacity) {
      hardViolations.push(`${room.roomNumber}: 정원 ${room.capacity}명을 초과했습니다.`);
    }
    const classKeys = new Set(room.studentIds.map(id => {
      const student = input.students.find(item => item.id === id);
      return student ? `${student.bu}-${student.grade}-${student.classNum}` : "unknown";
    }));
    if (classKeys.size > 1) hardViolations.push(`${room.roomNumber}: 서로 다른 반 학생이 섞였습니다.`);
    room.studentIds.forEach(id => {
      const student = input.students.find(item => item.id === id);
      if (student && student.gender !== room.type) hardViolations.push(`${room.roomNumber}: ${student.name}의 성별과 방 성별이 다릅니다.`);
    });
  });

  studentClasses.forEach((members, classKey) => {
    const assignedRooms = rooms.filter(room => room.studentIds.some(id => members.some(member => member.id === id)));
    const profiles = new Set(assignedRooms.map(profileKey));
    if (profiles.size > 1) hardViolations.push(`${classKey}: 여러 건물 또는 서로 다른 정원의 방에 나뉘었습니다.`);
  });
  classPinByClass.forEach((pin, classKey) => {
    const pinnedRoom = roomById.get(pin.roomId);
    const members = studentClasses.get(classKey) ?? [];
    if (!members.length) {
      hardViolations.push(`${classKey}: 숙박 대상 학생이 없어 기준 방을 적용할 수 없습니다.`);
      return;
    }
    if (!pinnedRoom?.studentIds.some(id => members.some(member => member.id === id))) {
      hardViolations.push(`${classKey}: 지정한 ${pinnedRoom?.roomNumber ?? pin.roomId} 방에 해당 반 학생이 배정되지 않았습니다.`);
    }
  });

  const adultByName = new Map<string, RoomAutoAdult>();
  input.adults.forEach(adult => adultByName.set(adult.name, adult));
  input.adults.filter(adult => adult.category === "classTeacher").forEach(teacher => {
    const room = rooms.find(item => (item.teachers ?? []).includes(teacher.name));
    if (!room || !teacher.classKey) return;
    const sleepsWithOwnClass = room.studentIds.some(id => {
      const student = input.students.find(item => item.id === id);
      return student && `${student.bu}-${student.grade}-${student.classNum}` === teacher.classKey;
    });
    if (!sleepsWithOwnClass) {
      hardViolations.push(`${teacher.name}: 담당 반(${teacher.classKey}) 학생과 같은 방이 아닙니다.`);
    }
  });
  rooms.forEach(room => {
    const adults = (room.teachers ?? []).map(name => adultByName.get(name)).filter((adult): adult is RoomAutoAdult => !!adult);
    adults.forEach(adult => {
      if (adult.gender && adult.gender !== room.type) hardViolations.push(`${room.roomNumber}: ${adult.name}의 성별과 방 성별이 다릅니다.`);
    });
    const specialCategories = new Set(adults.filter(adult => ["minister", "audio", "medical"].includes(adult.category)).map(adult => adult.category));
    if (specialCategories.size > 0 && (specialCategories.size > 1 || room.studentIds.length > 0 || adults.some(adult => !specialCategories.has(adult.category)))) {
      hardViolations.push(`${room.roomNumber}: 교역자·음향·의료 전용 방에 다른 인원이 섞였습니다.`);
    }
    if (adults.some(adult => adult.category === "medical") && adults.length !== 1) {
      hardViolations.push(`${room.roomNumber}: 의료 인원은 1인 전용 방이어야 합니다.`);
    }
  });

  const usedRooms = rooms.filter(room => roomOccupancy(room) > 0);
  const emptyBedCount = usedRooms.reduce((sum, room) => sum + room.capacity - roomOccupancy(room), 0);
  const classRooms = usedRooms.filter(room => room.studentIds.length > 0);
  const classTeacherCountByRoom = new Map<string, number>();
  input.adults.forEach(adult => {
    if (adult.category !== "classTeacher") return;
    const roomId = adultAssignmentRoomIds.get(adult.id);
    if (roomId) classTeacherCountByRoom.set(roomId, (classTeacherCountByRoom.get(roomId) ?? 0) + 1);
  });
  const classRoomEmptyBedCount = classRooms.reduce((sum, room) =>
    sum + room.capacity - room.studentIds.length - (classTeacherCountByRoom.get(room.id) ?? 0), 0);
  const classRoomFillerCount = input.adults.filter(adult => {
    if (adult.category !== "teacher" && adult.category !== "staff") return false;
    const roomId = adultAssignmentRoomIds.get(adult.id);
    return !!roomId && (roomById.get(roomId)?.studentIds.length ?? 0) > 0;
  }).length;
  const score = hardViolations.length * HARD_PENALTY + unassignedStudents.length * HARD_PENALTY
    + unassignedAdults.length * HARD_PENALTY + emptyBedCount * 100 + usedRooms.length * 10;

  return {
    rooms: rooms.sort(roomOrder),
    score,
    simulationCount: 1,
    assignedStudentCount: assignedStudentIds.size,
    assignedAdultCount: assignedAdultIds.size,
    unassignedStudents,
    unassignedAdults,
    hardViolations: [...new Set(hardViolations)],
    warnings: [...new Set(warnings)],
    usedRoomCount: usedRooms.length,
    emptyBedCount,
    classRoomFillerCount,
    classRoomCount: classRooms.length,
    classRoomEmptyBedCount,
  };
}

function isBetterResult(candidate: RoomAutoAssignResult, current: RoomAutoAssignResult): boolean {
  const candidateValid = candidate.hardViolations.length === 0;
  const currentValid = current.hardViolations.length === 0;
  if (candidateValid !== currentValid) return candidateValid;
  if (!candidateValid) return candidate.score < current.score;

  // 일반 교사·스탭은 최하위 배정이다. 최종 빈 침상 수가 줄더라도 스탭을 넣기 위해
  // 학생·담임 반이 더 큰 방이나 더 많은 방을 쓰는 결과를 선택하지 않는다.
  return candidate.classRoomEmptyBedCount < current.classRoomEmptyBedCount
    || (candidate.classRoomEmptyBedCount === current.classRoomEmptyBedCount
      && candidate.classRoomCount < current.classRoomCount)
    || (candidate.classRoomEmptyBedCount === current.classRoomEmptyBedCount
      && candidate.classRoomCount === current.classRoomCount
      && candidate.emptyBedCount < current.emptyBedCount)
    || (candidate.classRoomEmptyBedCount === current.classRoomEmptyBedCount
      && candidate.classRoomCount === current.classRoomCount
      && candidate.emptyBedCount === current.emptyBedCount
      && candidate.usedRoomCount < current.usedRoomCount);
}

export function autoAssignRooms(input: RoomAutoAssignInput): RoomAutoAssignResult {
  const simulationCount = input.simulations ?? 30;
  const effectiveInput = input.includeStaff === false
    ? { ...input, adults: input.adults.filter(adult => adult.category !== "staff") }
    : input;
  if (simulationCount !== 30) {
    throw new Error("방 자동배정은 정확히 30회 시뮬레이션해야 합니다.");
  }
  if (!input.rooms.length) {
    return {
      rooms: [], score: HARD_PENALTY, simulationCount,
      assignedStudentCount: 0, assignedAdultCount: 0,
      unassignedStudents: effectiveInput.students, unassignedAdults: effectiveInput.adults,
      hardViolations: ["등록된 방이 없습니다."], warnings: [], usedRoomCount: 0, emptyBedCount: 0,
      classRoomFillerCount: 0, classRoomCount: 0, classRoomEmptyBedCount: 0,
    };
  }
  let best: RoomAutoAssignResult | null = null;
  const seedOffset = Number.isFinite(input.seedOffset) ? Math.trunc(input.seedOffset ?? 0) : 0;
  for (let trial = 0; trial < simulationCount; trial++) {
    const result = runTrial(effectiveInput, 20260719 + seedOffset * 104729 + trial * 7919, trial > 0);
    if (!best || isBetterResult(result, best)) best = result;
  }
  return { ...best!, simulationCount };
}
