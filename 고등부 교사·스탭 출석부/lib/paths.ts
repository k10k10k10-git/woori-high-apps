// Firebase RTDB 경로 단일 원천.
// classes/*는 학생 출석부 소유이므로 읽기 함수에서만 사용한다.
export const paths = {
  classes: (year: number) => `classes/${year}`,
  staffMembers: (year: number, team: string) => `staff_members/${year}/${team}`,
  staffMember: (year: number, team: string, id: string) => `staff_members/${year}/${team}/${id}`,
  staffMemberOrder: (year: number, team: string, id: string) => `staff_members/${year}/${team}/${id}/num`,
  staffAttendance: (year: number) => `staff_attendance/${year}`,
  staffMemberAttendance: (year: number, team: string, id: string) => `staff_attendance/${year}/${team}/${id}`,
  staffAttendanceCell: (year: number, team: string, id: string, cellKey: string) =>
    `staff_attendance/${year}/${team}/${id}/${cellKey}`,
  staffEvents: (year: number) => `staff_events/${year}`,
  staffEvent: (year: number, id: string) => `staff_events/${year}/${id}`,
  staffRoles: () => "staff_roles",
  staffRole: (key: string) => `staff_roles/${key}`,
  staffAdmin: (uid: string) => `staff_admins/${uid}`,
};
