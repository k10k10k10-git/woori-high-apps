// DB 경로 단일 원천 — 경로 문자열은 이 파일에만 존재한다 (모노레포 컨벤션).
// 소유권: semester-app은 semesters/*, semestersPrivate/* 쓰기 소유.
//         classes/*, admins, retreatAdmins 는 읽기 전용 (다른 앱 소유).

export const paths = {
  // ── 소유 노드 ──
  semesters: () => `semesters`,
  semester: (sid: string) => `semesters/${sid}`,
  semesterMeta: (sid: string) => `semesters/${sid}/meta`,
  teams: (sid: string) => `semesters/${sid}/teams`,
  team: (sid: string, teamId: string) => `semesters/${sid}/teams/${teamId}`,
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

  // ── 읽기 전용 (다른 앱 소유 — 여기에 쓰기 함수를 만들지 말 것) ──
  classesByYear: (year: string) => `classes/${year}`,
  // 공식스탭 명단 (교사·스탭 출석부 앱 소유) — 접수 대상에 스탭을 포함하기 위해 읽는다
  teacherStaffByYear: (year: string) => `teacherStaff/${year}`,
  admins: (uid: string) => `admins/${uid}`,
  retreatAdmin: (uid: string) => `retreatAdmins/${uid}`,
};
