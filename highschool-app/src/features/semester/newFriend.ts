import type {
  ClassInfo,
  ClassStudent,
  NewFriend,
  NewFriendPrivate,
  NewFriendStage,
} from "./types";
import { paths } from "./paths";

const digits = (value?: string) => (value ?? "").replace(/\D/g, "");
const normalizedName = (value?: string) => (value ?? "").replace(/\s/g, "").toLocaleLowerCase("ko");

export type NewFriendRosterProgress = "대기" | "처리중" | "완료";

/** 새친구 진행표에서 사용하는 3단계 상태. 출석부 원장 반영을 완료 기준으로 삼는다. */
export function deriveNewFriendRosterProgress(friend: NewFriend): NewFriendRosterProgress {
  if (friend.rosterSync) return "완료";
  if (friend.week2Date || friend.decision === "등록" || friend.assignedClassKey) return "처리중";
  return "대기";
}

export function formatKoreanPhone(value?: string): string {
  const number = digits(value).slice(0, 11);
  if (!number) return "";
  if (number.startsWith("02")) {
    if (number.length <= 2) return number;
    if (number.length <= 5) return `${number.slice(0, 2)}-${number.slice(2)}`;
    if (number.length <= 9) return `${number.slice(0, 2)}-${number.slice(2, 5)}-${number.slice(5)}`;
    return `${number.slice(0, 2)}-${number.slice(2, 6)}-${number.slice(6)}`;
  }
  if (number.length <= 3) return number;
  if (number.length <= 7) return `${number.slice(0, 3)}-${number.slice(3)}`;
  if (number.length <= 10) return `${number.slice(0, 3)}-${number.slice(3, 6)}-${number.slice(6)}`;
  return `${number.slice(0, 3)}-${number.slice(3, 7)}-${number.slice(7)}`;
}

export function formatClassLabel(classKey?: string): string {
  if (!classKey) return "미배정";
  const match = classKey.match(/^(\d+)-(\d+)-(\d+)$/);
  return match ? `${match[1]}부 ${match[2]}학년 ${match[3]}반` : classKey;
}

export function needsClassAssignment(friend: NewFriend): boolean {
  return Boolean(
    friend.week2Date
    && !friend.assignedClassKey
    && !friend.rosterSync
    && friend.decision !== "미등록"
    && friend.decision !== "보류",
  );
}

export function newFriendAssignmentCopyText(friend: NewFriend, priv: NewFriendPrivate): string {
  return [
    `이름 : ${friend.name || ""}`,
    `부서 : ${friend.part || ""}`,
    `학년 : ${friend.grade ? `${friend.grade}학년` : ""}`,
    `성별 : ${friend.gender || ""}`,
    `학교 : ${friend.school || ""}`,
    `본인 연락처 : ${formatKoreanPhone(priv.phone)}`,
    `보호자 연락처 : ${formatKoreanPhone(priv.parentPhone)}`,
  ].join("\n");
}

export function deriveNewFriendStage(friend: NewFriend): NewFriendStage {
  if (friend.decision === "미등록") return "종료";
  if (friend.decision === "보류") return "보류";
  if (friend.giftDate) return "완료";
  if (friend.rosterSync) return "등반 확인";
  if (friend.assignedClassKey) return "출석부 반영";
  if (friend.decision === "등록") return "반배정";
  if (friend.week2Date) return "등록 결정";
  if (friend.week1Date) return "2주차";
  return "1주차";
}

export function studentIdForNewFriend(friendId: string): string {
  const safe = friendId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `nf_${safe}`;
}

export function personIdForNewFriend(friendId: string): string {
  return `person_student_${studentIdForNewFriend(friendId)}`;
}

export function findNewFriendDuplicate(
  classes: ClassInfo[],
  friend: NewFriend,
  priv: NewFriendPrivate,
): { classKey: string; studentId: string; name: string; reason: string } | null {
  const targetName = normalizedName(friend.name);
  const targetBirth = digits(priv.birth);
  const targetPhone = digits(priv.phone);
  const targetParentPhone = digits(priv.parentPhone);

  for (const classInfo of classes) {
    for (const [studentId, student] of Object.entries(classInfo.students)) {
      if (normalizedName(student.name) !== targetName) continue;
      const exactBirth = targetBirth.length >= 6 && digits(student.birth) === targetBirth;
      const exactPhone = targetPhone.length >= 8 && digits(student.phone) === targetPhone;
      const exactParent = targetParentPhone.length >= 8 && digits(student.pphone) === targetParentPhone;
      return {
        classKey: classInfo.classKey,
        studentId,
        name: student.name,
        reason: exactBirth || exactPhone || exactParent ? "동일 인물 가능성이 높음" : "동명이인 확인 필요",
      };
    }
  }
  return null;
}

export function buildRosterStudent(
  studentId: string,
  friend: NewFriend,
  priv: NewFriendPrivate,
): ClassStudent {
  const student: ClassStudent = { id: studentId, personId: personIdForNewFriend(friend.id), name: friend.name.trim() };
  if (priv.birth?.trim()) student.birth = priv.birth.trim();
  if (priv.phone?.trim()) student.phone = priv.phone.trim();
  if (priv.parentPhone?.trim()) student.pphone = priv.parentPhone.trim();
  if (friend.school?.trim()) student.school = friend.school.trim();
  if (priv.address?.trim()) student.addr = priv.address.trim();
  return student;
}

export function validateNewFriendRosterRegistration(friend: NewFriend): string | null {
  if (friend.decision !== "등록") return "등록 결정이 ‘등록’인 새친구만 반영할 수 있습니다.";
  if (!friend.week1Date || !friend.week2Date) return "1주차와 2주차 기록을 먼저 완료해 주세요.";
  if (!friend.assignedClassKey) return "배정 반을 먼저 선택해 주세요.";
  if (friend.rosterSync) return null;
  return null;
}

export function validateNewFriendRosterRemoval(
  friend: NewFriend,
  currentStudent: ClassStudent | null,
): string | null {
  if (!friend.rosterSync) return "출석부 반영 이력이 없어 연결 삭제할 수 없습니다.";
  const expectedStudentId = studentIdForNewFriend(friend.id);
  if (friend.rosterSync.studentId !== expectedStudentId) {
    return "새친구 기록과 출석부 학생 ID가 일치하지 않아 삭제를 중단했습니다.";
  }
  if (currentStudent?.id && currentStudent.id !== expectedStudentId) {
    return "출석부 학생 내부 ID가 반영 이력과 일치하지 않습니다.";
  }
  if (currentStudent && normalizedName(currentStudent.name) !== normalizedName(friend.name)) {
    return "출석부의 현재 학생 이름과 새친구 기록이 달라 삭제를 중단했습니다.";
  }
  return null;
}

export function buildNewFriendRosterRegistrationUpdates(input: {
  sid: string;
  year: string;
  friend: NewFriend;
  priv: NewFriendPrivate;
  studentId: string;
  classKey: string;
  syncedAt: string;
  syncedBy?: string;
}): Record<string, unknown> {
  const { sid, year, friend, priv, studentId, classKey, syncedAt, syncedBy } = input;
  return {
    [paths.newFriendRosterBackup(sid, friend.id)]: {
      createdAt: syncedAt,
      createdBy: syncedBy ?? null,
      targetPath: paths.classStudent(year, classKey, studentId),
      beforeStudentExists: false,
      newFriend: friend,
      newFriendPrivate: priv,
    },
    [paths.classStudent(year, classKey, studentId)]: buildRosterStudent(studentId, friend, priv),
    [`${paths.newFriend(sid, friend.id)}/rosterSync`]: {
      studentId,
      personId: personIdForNewFriend(friend.id),
      classKey,
      syncedAt,
      ...(syncedBy ? { syncedBy } : {}),
    },
    [`${paths.newFriend(sid, friend.id)}/updatedAt`]: syncedAt,
  };
}

export function buildNewFriendRosterRemovalUpdates(input: {
  sid: string;
  year: string;
  friend: NewFriend;
  priv: NewFriendPrivate;
  student: ClassStudent | null;
  attendance: unknown;
  removedAt: string;
  removedAtMs: number;
  removedBy?: string;
}): Record<string, unknown> {
  const { sid, year, friend, priv, student, attendance, removedAt, removedAtMs, removedBy } = input;
  if (!friend.rosterSync) throw new Error("출석부 반영 이력이 필요합니다.");
  const { studentId, classKey } = friend.rosterSync;
  const updates: Record<string, unknown> = {
    [paths.newFriendRemovalBackup(sid, friend.id, String(removedAtMs))]: {
      createdAt: removedAt,
      createdBy: removedBy ?? null,
      studentPath: paths.classStudent(year, classKey, studentId),
      attendancePath: paths.studentAttendance(year, classKey, studentId),
      student,
      attendance: attendance ?? null,
      newFriend: friend,
      newFriendPrivate: priv,
    },
    [paths.classStudent(year, classKey, studentId)]: null,
    [paths.studentAttendance(year, classKey, studentId)]: null,
    [paths.newFriend(sid, friend.id)]: null,
    [paths.newFriendPrivate(sid, friend.id)]: null,
  };
  if (student) {
    updates[paths.trashStudent(year, studentId)] = {
      ...student,
      ck: classKey,
      deletedAt: removedAtMs,
    };
  }
  return updates;
}
