import { defaultPraisePolicy } from "../defaults";
import type { PraiseView } from "../types";
export function praiseFixture(): PraiseView {
  const stamp = { revision: 1, updatedAt: 1788656400000, updatedBy: "manager-uid" };
  const base = { ...stamp, grade: 1, gender: "FEMALE" as const, department: "FIRST" as const, team: "SINGER" as const, active: true, isStudentLeader: false, singerCapable: true, groupStaffCapable: false, preferredService: "BOTH" as const, excludeFromAutoSinger: false };
  return {
    meta: { ...stamp, id: "synthetic-workspace", name: "합성 찬양팀", startDate: "2026-09-01", endDate: "2026-12-31", status: "active", mode: "live", activeGroupVersionId: "groups-1" },
    permissions: { read: true, manage: true, stageEdit: true, attendanceAll: true, staffId: "staff-1", role: "manager" },
    people: [{ ...base, id: "student-1", kind: "STUDENT", name: "합성학생가" }, { ...base, id: "student-2", kind: "STUDENT", name: "합성학생나" }, { ...base, id: "staff-1", kind: "STAFF", name: "합성스탭가", grade: 0, groupStaffCapable: true }, { ...base, id: "staff-2", kind: "STAFF", name: "합성스탭나", grade: 0, groupStaffCapable: true }],
    meetings: [{ ...stamp, id: "meeting-1", date: "2026-09-05", worshipDate: "2026-09-06", sequence: 1, title: "합성 모임", cancelled: false, temporary: false }],
    groups: [{ id: "groups-1", number: 1, kind: "CONFIRMED", createdAt: stamp.updatedAt, createdBy: stamp.updatedBy, seed: 1, settings: { groupCount: 2, studentMin: 0, studentMax: 10, staffMin: 1, staffMax: 2, clusterGender: false, clusterGrade: false, splitTeam: false }, rules: [], warnings: [], acknowledgedWarnings: true, groups: [{ id: "group-a", name: "합성가조", studentIds: ["student-1"], staffIds: ["staff-1"] }, { id: "group-b", name: "합성나조", studentIds: ["student-2"], staffIds: ["staff-2"] }] }],
    attendance: {}, availability: {}, stages: [], access: [], guides: [], policy: defaultPraisePolicy(stamp.updatedAt, stamp.updatedBy), audit: [], imports: [], inputRevisions: { "meeting-1": "revision-1" },
  };
}
