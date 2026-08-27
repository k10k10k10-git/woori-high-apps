/**
 * 전역 검색 인덱스 (순수 로직).
 *
 * 왜 만들었나 — 2026-07 수련회 피드백에서 3명이 각각 같은 뿌리의 마찰을 보고했다:
 *   · "방배정 화면에서 특정 학생 이름 찾을 때" 오래 걸림
 *   · "이름만 알고 있는 학생의 숙소를 확인하려고 숙소 버튼을 일일이 눌러봐야 했을 때"
 *   · "조가 너무 많은데 직접 스크롤해서 찾아야 할 때"
 * 공통 원인은 "이름 검색이 없다"가 아니라 **모든 탐색이 긴 목록 훑기**라는 것이다.
 * 그래서 사람뿐 아니라 조·방·호차를 한 인덱스에 넣고, 이름/초성/번호로 바로 찾게 한다.
 *
 * 설계 원칙:
 *  1. **DB를 새로 읽지 않는다.** 전부 useRetreatData가 이미 구독 중인 데이터의 파생이다(새 경로·쓰기 0).
 *  2. **판정 로직을 재구현하지 않는다.** 취소·부분참·자차·조 번호·부-학년-반 표기는 기존 lib를 그대로 쓴다.
 *     검색 결과의 숫자가 각 화면과 달라지면 검색을 신뢰할 수 없게 된다.
 *  3. **민감정보는 절대 넣지 않는다.** Student.phone/pPhone, TeacherAttendance.idNumber는
 *     이 인덱스에 담지 않는다 — 검색은 staff 레벨도 쓰는 화면이다. (아래 SENSITIVE 주석 참조)
 */

import {
  Group, Room, Student, Participant, TeacherAttendance,
  IguardStaff, IguardBus, AssignedIguardMovement, IguardPost,
  PartialAttendanceMap, BusStudentGender,
} from "./types";
import { groupDisplayName } from "@/lib/groupNumber";
import { isCancelledStudent, isOwnCarTransport, isTeacherBusPassenger } from "./busParticipation";
import { studentPartialLabel } from "./checklistMembers";
import { normalizeStaffIdentityName } from "./staffIdentity";
import { buildStudentGenderMap } from "./busGender";
import { studentClass } from "./lodgingMap";

// ── 초성 검색 ────────────────────────────────────────────────
const CHOSUNG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JAMO_START = 0x3131;
const JAMO_END = 0x314e;

/** 완성형 한글을 초성 문자열로 바꾼다. 한글이 아니면 소문자로 보존. ("김현민" → "ㄱㅎㅁ") */
export function toChosung(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += CHOSUNG[Math.floor((code - HANGUL_BASE) / 588)];
    } else {
      out += char.toLocaleLowerCase("ko-KR");
    }
  }
  return out;
}

/** 입력이 초성만으로 이루어졌는지 ("ㄱㅎㅁ" → true, "김현" → false, "" → false) */
export function isChosungQuery(query: string): boolean {
  const trimmed = query.replace(/\s+/g, "");
  if (!trimmed) return false;
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    if (code < JAMO_START || code > JAMO_END) return false;
  }
  return true;
}

// 조합용 초성(U+1100~U+1112)은 CHOSUNG 배열과 순서가 같다.
const CONJOINING_START = 0x1100;
const CONJOINING_END = 0x1112;

/**
 * 낱자 자음을 호환 자모(ㄱ, ㅎ …)로 통일한다. 자음이 아니면 null.
 *
 * ⚠ 이 변환이 필요한 이유: `normalizeStaffIdentityName`이 `NFKC`를 적용하는데,
 * NFKC는 호환 자모 `ㅁ`(U+3141)을 **조합용 자모**(U+1106)로 바꾼다. 범위 검사를
 * 호환 자모로만 하면 정규화를 거친 질의에서 자음을 놓쳐 "김현ㅁ"이 아무것도 못 찾는다.
 */
function toCompatJamo(char: string): string | null {
  const code = char.charCodeAt(0);
  if (code >= JAMO_START && code <= JAMO_END) return char;
  if (code >= CONJOINING_START && code <= CONJOINING_END) return CHOSUNG[code - CONJOINING_START];
  return null;
}

/** 질의에 조합되지 않은 자음이 섞여 있는가 (IME 조합 중 상태 판정) */
export function hasJamo(text: string): boolean {
  for (const char of text) {
    if (toCompatJamo(char)) return true;
  }
  return false;
}

/**
 * 완성형 글자는 **글자 그대로**, 자음만 입력된 자리는 **초성으로** 비교해 부분 일치 위치를 찾는다.
 * 못 찾으면 -1.
 *
 *   koreanPatternIndexOf("김성훈", "김성훈")  →  0   (완전히 같은 이름만)
 *   koreanPatternIndexOf("김성훈", "김성ㅎ")  →  0   (조합 중 상태도 이어서 찾힘)
 *   koreanPatternIndexOf("김서하", "김성훈")  → -1   (초성이 같아도 글자가 다르면 제외)
 *
 * 순수 초성 질의("ㄱㅅㅎ")는 이 경로가 아니라 chosungKeys가 처리한다.
 */
export function koreanPatternIndexOf(target: string, query: string): number {
  if (!query || query.length > target.length) return -1;
  for (let start = 0; start + query.length <= target.length; start++) {
    let matched = true;
    for (let i = 0; i < query.length; i++) {
      const q = query[i];
      const t = target[start + i];
      const jamo = toCompatJamo(q);
      if (jamo ? toChosung(t) !== jamo : q !== t) { matched = false; break; }
    }
    if (matched) return start;
  }
  return -1;
}

// ── 인덱스 타입 ──────────────────────────────────────────────
export type SearchEntryKind = "student" | "teacher" | "staff" | "group" | "room" | "bus";

export interface SearchFact {
  label: string;
  value: string;
}

export interface SearchEntry {
  id: string;
  kind: SearchEntryKind;
  /** 화면에 크게 보이는 값 — 사람이면 이름, 그 외엔 "17조" / "별관 201호" / "2호차" */
  title: string;
  /** 한 줄 보조 설명 */
  subtitle: string;
  /** 카드에 펼쳐 보여줄 항목들 (조/숙소/호차/동선 등) */
  facts: SearchFact[];
  /** 취소·선복귀·자차 등 경고성 표시 */
  badges: string[];
  /** 결과에서 바로 이동할 탭 */
  jumpView?: string;
  /** 검색 매칭용 — 정규화된 문자열들 (표시에 쓰지 않음) */
  keys: string[];
  /** 검색 매칭용 — 초성 문자열들 */
  chosungKeys: string[];
}

export interface SearchIndexInput {
  groups: Group[];
  rooms: Room[];
  students: Record<string, Student>;
  participants: Record<string, Participant>;
  adminTeachers: TeacherAttendance[];
  staff: IguardStaff[];
  groupStaff: Record<string, string[]>;
  buses: IguardBus[];
  movements: AssignedIguardMovement[];
  posts: IguardPost[];
  partial: PartialAttendanceMap;
  cellColors: Record<string, string>;
  /** 현재 시간 블록 id — 시간 판정은 scheduleTime의 currentBlockFor가 담당하고 여기선 결과만 받는다 */
  currentBlockId?: string | null;
}

// ── 표기 헬퍼 ────────────────────────────────────────────────
function roomLabel(room: Room): string {
  const dong = (room.dong ?? "").trim();
  return dong ? `${dong} ${room.roomNumber}호` : `${room.roomNumber}호`;
}

function normalizeKey(value: string): string {
  return normalizeStaffIdentityName(value);
}

function pushKeys(entry: SearchEntry, ...values: Array<string | undefined | null>) {
  for (const value of values) {
    const raw = (value ?? "").trim();
    if (!raw) continue;
    const key = normalizeKey(raw);
    if (key && !entry.keys.includes(key)) entry.keys.push(key);
    const chosung = toChosung(raw.replace(/\s+/g, ""));
    if (chosung && !entry.chosungKeys.includes(chosung)) entry.chosungKeys.push(chosung);
  }
}

/** 조 단위로 배정된 호차를 찾는다. 남녀 분리(segments) 방식이면 성별까지 일치해야 한다. */
function busesForGroup(
  buses: IguardBus[],
  groupId: string,
  gender: BusStudentGender | null,
): string[] {
  const labels: string[] = [];
  for (const bus of buses) {
    const matched = bus.segments?.length
      ? bus.segments.some(seg => seg.groupId === groupId && (!gender || !seg.gender || seg.gender === gender))
      : (bus.groupIds ?? []).includes(groupId);
    if (!matched) continue;
    labels.push(bus.day ? `${bus.day}일차 ${bus.busNo}호차` : `${bus.busNo}호차`);
  }
  return labels;
}

function busesForTeacherName(buses: IguardBus[], name: string, groupIds: string[]): string[] {
  const key = normalizeKey(name);
  const labels: string[] = [];
  for (const bus of buses) {
    const bySegment = bus.segments?.some(seg =>
      (seg.teacherNames ?? []).some(candidate => normalizeKey(candidate) === key),
    );
    const byGroup = !bus.segments?.length && (bus.groupIds ?? []).some(id => groupIds.includes(id));
    if (!bySegment && !byGroup) continue;
    labels.push(bus.day ? `${bus.day}일차 ${bus.busNo}호차` : `${bus.busNo}호차`);
  }
  return labels;
}

// ── 인덱스 생성 ──────────────────────────────────────────────
/**
 * 구독 중인 데이터에서 검색 인덱스를 만든다.
 *
 * ⚠ SENSITIVE — 여기에 다음 필드를 추가하지 말 것:
 *    Student.phone · Student.pPhone · TeacherAttendance.idNumber
 *    검색은 staff 접근 레벨도 사용하는 화면이라 연락처·주민번호가 노출되면 안 된다.
 */
export function buildSearchIndex(input: SearchIndexInput): SearchEntry[] {
  const {
    groups, rooms, students, participants, adminTeachers, staff, groupStaff,
    buses, movements, posts, partial, cellColors, currentBlockId,
  } = input;

  const entries: SearchEntry[] = [];
  const genderMap = buildStudentGenderMap(participants, students);
  const postById = new Map(posts.map(post => [post.id, post]));

  // 학생 id → 소속 조 / 방
  const groupByStudent = new Map<string, Group>();
  groups.forEach(group => (group.studentIds ?? []).forEach(id => groupByStudent.set(id, group)));
  const roomByStudent = new Map<string, Room>();
  rooms.forEach(room => (room.studentIds ?? []).forEach(id => roomByStudent.set(id, room)));

  // ── 학생 ──────────────────────────────────────────────────
  Object.entries(students).forEach(([studentId, student]) => {
    if (!student?.name?.trim()) return;
    const group = groupByStudent.get(studentId);
    // 이 수련회 참가자가 아닌 학생(다른 조에도 방에도 없음)은 인덱스에서 제외
    const room = roomByStudent.get(studentId);
    if (!group && !room) return;

    const cls = studentClass(student);
    const cancelled = isCancelledStudent(studentId, cellColors);
    const partialLabel = studentPartialLabel(partial[studentId]);
    const groupLabel = group ? groupDisplayName(group, groups) : null;
    // 취소 학생은 다른 화면(버스 자동배정·호차별 인원체크)에서 이미 제외된다.
    // 검색만 호차를 보여주면 "명단엔 있는데 실제로는 안 타는" 사고를 그대로 재생산한다.
    const busLabels = group && !cancelled
      ? busesForGroup(buses, group.id, genderMap[studentId] ?? null)
      : [];

    const entry: SearchEntry = {
      id: `student:${studentId}`,
      kind: "student",
      title: student.name.trim(),
      subtitle: `학생 · ${cls.full}`,
      facts: [],
      badges: [],
      jumpView: "rooms",
      keys: [],
      chosungKeys: [],
    };
    if (groupLabel) entry.facts.push({ label: "조", value: groupLabel });
    if (group?.teachers?.length) entry.facts.push({ label: "조 교사", value: group.teachers.join(", ") });
    entry.facts.push({ label: "숙소", value: room ? roomLabel(room) : "배정 없음" });
    if (busLabels.length) entry.facts.push({ label: "버스", value: busLabels.join(" · ") });
    if (cancelled) entry.badges.push("취소");
    if (partialLabel) entry.badges.push(partialLabel);

    pushKeys(entry, student.name, cls.short, groupLabel, room ? roomLabel(room) : null);
    entries.push(entry);
  });

  // ── 교사 ──────────────────────────────────────────────────
  adminTeachers.forEach(teacher => {
    if (teacher.bu === "스탭") return; // 스탭은 아래에서 별도 처리
    const name = teacher.name?.trim();
    if (!name) return;
    const key = normalizeKey(name);
    const myGroups = groups.filter(group =>
      (group.teachers ?? []).some(candidate => normalizeKey(candidate) === key),
    );
    const room = rooms.find(r => (r.teachers ?? []).some(candidate => normalizeKey(candidate) === key));
    const groupLabels = myGroups.map(group => groupDisplayName(group, groups));
    // 불참·자차 교사는 단체버스 명단에서 빠진다(isTeacherBusPassenger가 단일 원천).
    // 실제 피드백 사고: "2호차에 선생님 타는 명단에 올라가있는데 실제로는 자차 이동".
    const ridesBus = isTeacherBusPassenger(adminTeachers, name, teacher.bu);
    const busLabels = ridesBus
      ? busesForTeacherName(buses, name, myGroups.map(group => group.id))
      : [];

    const entry: SearchEntry = {
      id: `teacher:${teacher.id}`,
      kind: "teacher",
      title: name,
      subtitle: `교사 · ${teacher.bu}${teacher.classKey ? ` ${teacher.classKey}` : ""}`,
      facts: [],
      badges: [],
      jumpView: "rooms",
      keys: [],
      chosungKeys: [],
    };
    if (groupLabels.length) entry.facts.push({ label: "담당 조", value: groupLabels.join(", ") });
    entry.facts.push({ label: "숙소", value: room ? roomLabel(room) : "배정 없음" });
    if (busLabels.length) entry.facts.push({ label: "버스", value: busLabels.join(" · ") });
    else if (!ridesBus) entry.facts.push({ label: "버스", value: "단체버스 미탑승" });
    if (teacher.status === "불참") entry.badges.push("불참");
    else if (teacher.status === "부분참") entry.badges.push("부분참");
    if (isOwnCarTransport(teacher.transport)) entry.badges.push("자차");

    pushKeys(entry, name, teacher.classKey, ...groupLabels);
    entries.push(entry);
  });

  // ── 스탭 ──────────────────────────────────────────────────
  const staffGroupLabels = new Map<string, string[]>();
  Object.entries(groupStaff).forEach(([groupId, staffIds]) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const label = groupDisplayName(group, groups);
    staffIds.forEach(staffId => {
      staffGroupLabels.set(staffId, [...(staffGroupLabels.get(staffId) ?? []), label]);
    });
  });

  staff.forEach(member => {
    const name = member.name?.trim();
    if (!name) return;
    const key = normalizeKey(name);
    const room = rooms.find(r => (r.teachers ?? []).some(candidate => normalizeKey(candidate) === key));
    const myGroups = staffGroupLabels.get(member.id) ?? [];
    const myMovements = movements.filter(movement => movement.staffId === member.id);
    const nowMovement = currentBlockId
      ? myMovements.find(movement => movement.blockId === currentBlockId)
      : undefined;

    const entry: SearchEntry = {
      id: `staff:${member.id}`,
      kind: "staff",
      title: name,
      subtitle: `스탭${member.role ? ` · ${member.role}` : ""}`,
      facts: [],
      badges: [],
      jumpView: "cue",
      keys: [],
      chosungKeys: [],
    };
    if (myGroups.length) entry.facts.push({ label: "담당 조", value: myGroups.join(", ") });
    if (nowMovement) {
      const post = postById.get(nowMovement.postId);
      if (post) entry.facts.push({ label: "지금 동선", value: post.area ? `${post.name} (${post.area})` : post.name });
    }
    entry.facts.push({ label: "동선 배정", value: `${myMovements.length}개 블록` });
    entry.facts.push({ label: "숙소", value: room ? roomLabel(room) : "배정 없음" });
    if (member.adminStatus === "부분참") entry.badges.push("부분참");
    if (member.corps && member.corps !== "본대") entry.badges.push(member.corps);

    pushKeys(entry, name, member.role, ...myGroups);
    entries.push(entry);
  });

  // ── 조 ────────────────────────────────────────────────────
  groups.forEach(group => {
    const label = groupDisplayName(group, groups);
    const activeIds = (group.studentIds ?? []).filter(id => !isCancelledStudent(id, cellColors));
    const entry: SearchEntry = {
      id: `group:${group.id}`,
      kind: "group",
      title: label,
      subtitle: `조 · ${group.bu}`,
      facts: [
        { label: "학생", value: `${activeIds.length}명` },
        { label: "교사", value: (group.teachers ?? []).join(", ") || "없음" },
      ],
      badges: [],
      jumpView: "rooms",
      keys: [],
      chosungKeys: [],
    };
    if (group.leader) entry.facts.push({ label: "조장", value: group.leader });
    const busLabels = busesForGroup(buses, group.id, null);
    if (busLabels.length) entry.facts.push({ label: "버스", value: busLabels.join(" · ") });
    pushKeys(entry, label, group.name, group.bu);
    entries.push(entry);
  });

  // ── 방 ────────────────────────────────────────────────────
  rooms.forEach(room => {
    const label = roomLabel(room);
    const activeIds = (room.studentIds ?? []).filter(id => !isCancelledStudent(id, cellColors));
    const names = activeIds.map(id => students[id]?.name ?? "명단 미상");
    const entry: SearchEntry = {
      id: `room:${room.id}`,
      kind: "room",
      title: label,
      subtitle: `숙소 · ${room.type ?? ""}${room.capacity ? ` ${room.capacity}인실` : ""}`.trim(),
      facts: [
        { label: "학생", value: names.join(", ") || "없음" },
        { label: "교사", value: (room.teachers ?? []).join(", ") || "없음" },
      ],
      badges: [],
      jumpView: "lodgingmap",
      keys: [],
      chosungKeys: [],
    };
    pushKeys(entry, label, room.roomNumber, room.dong);
    entries.push(entry);
  });

  // ── 호차 ──────────────────────────────────────────────────
  buses.forEach(bus => {
    const label = bus.day ? `${bus.day}일차 ${bus.busNo}호차` : `${bus.busNo}호차`;
    const groupLabels = (bus.groupIds ?? [])
      .map(id => groups.find(group => group.id === id))
      .filter((group): group is Group => !!group)
      .map(group => groupDisplayName(group, groups));
    const entry: SearchEntry = {
      id: `bus:${bus.id}`,
      kind: "bus",
      title: label,
      subtitle: "버스",
      facts: [
        { label: "배정 조", value: groupLabels.join(", ") || "없음" },
      ],
      badges: [],
      jumpView: "check",
      keys: [],
      chosungKeys: [],
    };
    if (bus.staff) entry.facts.push({ label: "선탑/동승", value: bus.staff });
    pushKeys(entry, label, `${bus.busNo}호차`, `${bus.busNo}`);
    entries.push(entry);
  });

  return entries;
}

// ── 검색 ────────────────────────────────────────────────────
const KIND_ORDER: Record<SearchEntryKind, number> = {
  student: 0, teacher: 1, staff: 2, group: 3, room: 4, bus: 5,
};

function scoreEntry(entry: SearchEntry, query: string, chosungMode: boolean): number {
  const pool = chosungMode ? entry.chosungKeys : entry.keys;
  let best = 0;
  for (const key of pool) {
    if (!key) continue;
    if (key === query) best = Math.max(best, 100);
    else if (key.startsWith(query)) best = Math.max(best, 70);
    else if (key.includes(query)) best = Math.max(best, 40);
  }
  // 완성형과 자음이 섞인 **조합 중** 상태만 보조 매칭한다("김성ㅎ" → 김성훈).
  //
  // ⚠ 예전에는 질의 전체를 초성으로 바꿔 비교했다. 그래서 "김성훈"을 다 쳐도
  // "ㄱㅅㅎ"로 변환돼 김서하·김서현까지 걸렸다. 이름을 끝까지 입력한 사용자는
  // 그 이름만 보길 기대하므로, 완성형만으로 된 질의에는 초성 폴백을 쓰지 않는다.
  if (!chosungMode && best === 0 && hasJamo(query)) {
    for (const key of entry.keys) {
      const at = koreanPatternIndexOf(key, query);
      if (at === 0) { best = Math.max(best, 60); break; }
      if (at > 0) { best = Math.max(best, 30); break; }
    }
  }
  return best;
}

/**
 * 인덱스에서 질의에 맞는 항목을 점수순으로 돌려준다.
 * 완전일치 > 앞부분 일치 > 부분 일치 순이고, 같은 점수면 사람(학생·교사·스탭)을 먼저 보여준다.
 */
export function searchIndex(entries: SearchEntry[], rawQuery: string, limit = 40): SearchEntry[] {
  const trimmed = (rawQuery ?? "").trim();
  if (!trimmed) return [];
  const chosungMode = isChosungQuery(trimmed);
  const query = chosungMode
    ? trimmed.replace(/\s+/g, "")
    : normalizeKey(trimmed);
  if (!query) return [];

  const scored: Array<{ entry: SearchEntry; score: number }> = [];
  for (const entry of entries) {
    const score = scoreEntry(entry, query, chosungMode);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const kindDiff = KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind];
    if (kindDiff !== 0) return kindDiff;
    return a.entry.title.localeCompare(b.entry.title, "ko", { numeric: true });
  });
  return scored.slice(0, limit).map(item => item.entry);
}
