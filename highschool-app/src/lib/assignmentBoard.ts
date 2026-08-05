/**
 * 배정 화면(`RoomsTab` 방배정 · `GroupsTab` 조편성)의 공통 순수 파생 계산.
 *
 * 두 화면은 "후보 명단 − 이미 배정된 사람 = 미배정"이라는 같은 골격을 쓰는데,
 * 메인 컴포넌트가 각각 964줄·900줄이라 이 계산들이 구독·드래그 상태와 뒤섞여
 * 테스트할 수 없었고 같은 식이 화면마다 복제돼 있었다.
 * 조편성·방배정 결과(`groups`/`rooms`)는 이가드가 읽는 데이터라 회귀가
 * 숙소 안내·명찰카드·인원체크까지 번진다. 그래서 분리해 테스트로 고정한다.
 *
 * ⚠ 이 모듈은 순수 함수만 둔다. Firebase·React·DOM에 의존하지 않는다.
 * ⚠ 조편성과 방배정의 **의도된 차이**는 합치지 않는다 — 예: 당일참석 학생은
 *    조에는 들어가지만 숙박은 하지 않으므로 방배정에서만 제외한다.
 */

import type { Student, TeacherAttendance, PartialAttendance } from "./types";
import { LATE_REGISTRANT_COLORS } from "./constants";
import {
  classifyRoomAdult,
  summarizeRoomAutoClasses,
  type RoomAutoStudent,
  type RoomAutoAdult,
  type RoomAutoClassSummary,
} from "./roomAutoAssign";

/** 방배정 화면이 쓰는 학생 정보 — 반 명단 Student에 부서·성별을 얹은 형태. */
export interface RoomBoardStudent extends Student {
  bu?: string;
  gender?: string;
}

export type RoomBoardStudents = Record<string, RoomBoardStudent>;

/** 학생을 담는 배정 단위 — 방(`Room`)과 조(`Group`)가 모두 만족한다. */
export interface StudentContainer {
  studentIds?: string[];
}

/** 교사 이름을 담는 배정 단위 — 방만 해당(조는 teachers 외에 staff·leader도 본다). */
export interface TeacherContainer {
  teachers?: string[];
}

/** 자동배정 반 옵션 — 요약에 화면 표시용 라벨을 더한 것. */
export interface RoomBoardClassOption extends RoomAutoClassSummary {
  label: string;
}

/**
 * 후기 신청자: 명단 셀이 색칠(blue/orange)됐지만 신청 폼에는 없는 학생.
 * 반 명단에 실재하는 학생만 인정한다(오타·삭제된 셀 키 방어).
 */
export function findLateRegistrantIds(
  cellColors: Record<string, string>,
  participantIds: readonly string[],
  students: RoomBoardStudents,
): string[] {
  const applied = new Set(participantIds);
  return Object.entries(cellColors)
    .filter(([sid, color]) => LATE_REGISTRANT_COLORS.has(color) && !applied.has(sid) && !!students[sid])
    .map(([sid]) => sid);
}

/** 당일참석 학생 — 숙박 대상이 아니므로 방 배정 풀에서 제외한다. */
export function findDayAttendanceIds(partialAttendances: readonly PartialAttendance[]): Set<string> {
  return new Set(partialAttendances.filter(item => item.type === "당일참석").map(item => item.id));
}

/**
 * 미배정 학생 = 기존 미배정 + 아직 방이 없는 후기 신청자.
 * 신청취소(red)와 당일참석은 제외한다 — 취소자 제거 후 리로드 시 재등장을 막는다.
 */
export function findUnassignedStudentIds(input: {
  unassigned: readonly string[];
  lateRegistrantIds: readonly string[];
  rooms: readonly StudentContainer[];
  cellColors: Record<string, string>;
  dayAttendanceIds: ReadonlySet<string>;
}): string[] {
  const assigned = new Set(input.rooms.flatMap(r => r.studentIds || []));
  const lateUnassigned = input.lateRegistrantIds.filter(id => !assigned.has(id));
  return [...input.unassigned, ...lateUnassigned]
    .filter(id => input.cellColors[id] !== "red" && !input.dayAttendanceIds.has(id));
}

/**
 * 후보 중 **어느 방에도 배정되지 않은** 인원만 남긴다.
 * 구독 초기화·원격 반영·자동배정 적용·취소자 일괄 제거 등 화면 6곳에서
 * 같은 식(`후보 − 방에 배정된 사람`)을 각자 인라인으로 쓰고 있던 것을 하나로 모았다.
 * `alsoExclude`는 취소자처럼 추가로 빼야 하는 집합(선택).
 */
export function excludeAssignedStudents(
  candidateIds: readonly string[],
  containers: readonly StudentContainer[],
  alsoExclude?: ReadonlySet<string>,
): string[] {
  const assigned = new Set(containers.flatMap(c => c.studentIds || []));
  return candidateIds.filter(id => !assigned.has(id) && !alsoExclude?.has(id));
}

/** 방이 없는 교사. 불참 교사는 배정 대상이 아니다. */
export function findUnassignedTeachers(
  rooms: readonly TeacherContainer[],
  allTeachers: readonly TeacherAttendance[],
): TeacherAttendance[] {
  const assigned = new Set(rooms.flatMap(r => r.teachers || []));
  return allTeachers.filter(t => t.status !== "불참" && !assigned.has(t.name));
}

/**
 * 이름 검색 후보. 미배정뿐 아니라 **다른 방에 배정된 사람도 포함**해 "이동"할 수 있게 한다.
 * 신청취소자와 당일참석자는 후보에서 제외하고, 현장 등록자(후기 신청자)는 합친다.
 */
export function findRoomStudentCandidateIds(input: {
  participantIds: readonly string[];
  lateRegistrantIds: readonly string[];
  cellColors: Record<string, string>;
  dayAttendanceIds: ReadonlySet<string>;
}): string[] {
  return [...new Set([...input.participantIds, ...input.lateRegistrantIds])]
    .filter(id => input.cellColors[id] !== "red" && !input.dayAttendanceIds.has(id));
}

/**
 * 자동배정 입력용 학생 목록.
 * ⚠ 성별이 없는 학생은 행정 자동 조편성과 동일하게 **홀수반=남·짝수반=여**로 보강한다
 * (임의 추측이 아니라 기존 규칙의 재사용). 반 명단에 없는 id는 조용히 건너뛴다.
 */
export function toRoomAutoStudents(
  candidateIds: readonly string[],
  students: RoomBoardStudents,
): RoomAutoStudent[] {
  return candidateIds.flatMap(id => {
    const student = students[id];
    if (!student) return [];
    const gender = student.gender === "남" || student.gender === "여"
      ? student.gender
      : student.class % 2 === 1 ? "남" : "여";
    return [{
      id,
      name: student.name,
      bu: student.bu ?? (student.buNum === 1 ? "1부" : student.buNum === 2 ? "2부" : "미상"),
      grade: student.grade,
      classNum: student.class,
      gender,
    }];
  });
}

/** 자동배정 입력용 성인. 불참 교사는 제외한다. */
export function toRoomAutoAdults(allTeachers: readonly TeacherAttendance[]): RoomAutoAdult[] {
  return allTeachers.filter(teacher => teacher.status !== "불참").map(classifyRoomAdult);
}

/**
 * 반 선택 옵션 — 요약에 표시 라벨을 붙여 가나다·숫자순 정렬.
 * ⚠ 여기 `classKey`는 `roomAutoAssign.ts`가 만드는 `"1부-3-6"` 형식이라
 * `lib/classKey.ts`의 `"1-2-3"` 파서와 **다른 것**이다. 두 파서를 합치지 말 것.
 */
export function toRoomClassOptions(
  students: readonly RoomAutoStudent[],
  adults: readonly RoomAutoAdult[],
): RoomBoardClassOption[] {
  return summarizeRoomAutoClasses([...students], [...adults])
    .map(summary => {
      const [bu, grade, classNum] = summary.classKey.split("-");
      return { ...summary, label: `${bu} ${Number(grade)}학년 ${Number(classNum)}반` };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ko", { numeric: true }));
}
