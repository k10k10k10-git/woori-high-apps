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
  const student: ClassStudent = { id: studentId, name: friend.name.trim() };
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
      classKey,
      syncedAt,
      ...(syncedBy ? { syncedBy } : {}),
    },
    [`${paths.newFriend(sid, friend.id)}/updatedAt`]: syncedAt,
  };
}
