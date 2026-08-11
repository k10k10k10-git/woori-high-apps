// DB 경로 단일 원천 — 경로 문자열은 이 파일에만 존재한다 (모노레포 컨벤션).
// 소유권: semester-app은 semesters/*, semestersPrivate/* 쓰기 소유.
//         classes/*·attendance/*·trash/*는 학생 앱 소유. 새친구 단건 등록과 그 등록의 검증된 되돌리기만 통합관리자 예외.
//         admins, retreatAdmins 는 읽기 전용 (다른 앱 소유).

export const paths = {
  // ── 소유 노드 ──
  semesters: () => `semesters`,
  semestersPrivate: () => `semestersPrivate`,
  semester: (sid: string) => `semesters/${sid}`,
  semesterPrivate: (sid: string) => `semestersPrivate/${sid}`,
  semesterMeta: (sid: string) => `semesters/${sid}/meta`,
  teams: (sid: string) => `semesters/${sid}/teams`,
  team: (sid: string, teamId: string) => `semesters/${sid}/teams/${teamId}`,
  trainingClasses: (sid: string) => `semesters/${sid}/trainingClasses`,
  trainingClass: (sid: string, classId: string) => `semesters/${sid}/trainingClasses/${classId}`,
  sessions: (sid: string) => `semesters/${sid}/sessions`,
  session: (sid: string, sessId: string) => `semesters/${sid}/sessions/${sessId}`,
  applications: (sid: string) => `semesters/${sid}/applications`,
  application: (sid: string, appKey: string) => `semesters/${sid}/applications/${appKey}`,
  teamAttendance: (sid: string, sessId: string) => `semesters/${sid}/attendance/team/${sessId}`,
  teamAttendanceEntry: (sid: string, sessId: string, appKey: string) =>
    `semesters/${sid}/attendance/team/${sessId}/${appKey}`,
  completion: (sid: string) => `semesters/${sid}/completion`,
  completionEntry: (sid: string, appKey: string) => `semesters/${sid}/completion/${appKey}`,
  archiveLinks: (sid: string) => `semesters/${sid}/archiveLinks`,
  archiveLink: (sid: string, linkId: string) => `semesters/${sid}/archiveLinks/${linkId}`,
  curriculum: (sid: string, teamId: string) => `semesters/${sid}/curriculum/${teamId}`,
  curriculumEntry: (sid: string, teamId: string, sessId: string) =>
    `semesters/${sid}/curriculum/${teamId}/${sessId}`,
  // 🔒 민감(연락처·지원 동기) — retreatsPrivate 패턴
  applicationPrivate: (sid: string, appKey: string) =>
    `semestersPrivate/${sid}/applicationsPrivate/${appKey}`,
  applicationsPrivate: (sid: string) => `semestersPrivate/${sid}/applicationsPrivate`,
  newFriends: (sid: string) => `semesters/${sid}/newFriends`,
  newFriend: (sid: string, id: string) => `semesters/${sid}/newFriends/${id}`,
  newFriendsPrivate: (sid: string) => `semestersPrivate/${sid}/newFriendsPrivate`,
  newFriendPrivate: (sid: string, id: string) => `semestersPrivate/${sid}/newFriendsPrivate/${id}`,
  newFriendRosterBackup: (sid: string, id: string) =>
    `semestersPrivate/${sid}/newFriendRosterBackups/${id}`,
  newFriendRemovalBackup: (sid: string, id: string, backupId: string) =>
    `semestersPrivate/${sid}/newFriendRosterBackups/${id}/removals/${backupId}`,
  newFriendPlacementCancellationBackup: (sid: string, id: string, backupId: string) =>
    `semestersPrivate/${sid}/newFriendRosterBackups/${id}/placementCancellations/${backupId}`,

  // ── 다른 앱 소유 (새친구 단건 등록·검증된 되돌리기 외 쓰기 함수 추가 금지) ──
  classes: () => `classes`,
  classesByYear: (year: string) => `classes/${year}`,
  classStudent: (year: string, classKey: string, studentId: string) =>
    `classes/${year}/${classKey}/students/${studentId}`,
  studentAttendance: (year: string, classKey: string, studentId: string) =>
    `attendance/${year}/${classKey}/${studentId}`,
  trashStudent: (year: string, studentId: string) => `trash/${year}/students/${studentId}`,
  // 공식스탭 명단 (교사·스탭 출석부 앱 소유) — 접수 대상에 스탭을 포함하기 위해 읽는다
  teacherStaffByYear: (year: string) => `teacherStaff/${year}`,
  admins: (uid: string) => `admins/${uid}`,
  retreatAdmin: (uid: string) => `retreatAdmins/${uid}`,
};
