import { canEditViewAttendance } from "../permissions";
import type { PraiseMeeting, PraiseView } from "../types";

/** 휴강은 자동 추천에서 제외하되, 명시 선택한 과거·휴강 회차는 그대로 유지한다. */
export function defaultPraiseMeeting(meetings: PraiseMeeting[], today: string): PraiseMeeting | null {
  const ordered = [...meetings].sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);
  const active = ordered.filter((meeting) => !meeting.cancelled);
  return active.find((meeting) => meeting.worshipDate >= today) ?? active.at(-1) ?? ordered.at(-1) ?? null;
}

/** 권한 때문에 응답하지 않은 출석을 미입력이나 완료로 단정하지 않는다. */
export function praiseAttendanceProgress(view: PraiseView, meeting: PraiseMeeting | null) {
  const students = view.people.filter((person) => person.active && person.kind === "STUDENT" && meeting && canEditViewAttendance(view, meeting.id, person.id));
  const records = meeting ? view.attendance[meeting.id] ?? {} : {};
  const invalid = new Set(students.filter((person) => meeting && view.attendanceSources?.[meeting.id]?.[person.id]?.mapping === "invalid").map((person) => person.id));
  const present = students.filter((person) => !invalid.has(person.id) && records[person.id]?.status === "PRESENT").length;
  const absent = students.filter((person) => !invalid.has(person.id) && records[person.id]?.status === "ABSENT").length;
  const missing = students.filter((person) => !invalid.has(person.id) && records[person.id]?.status == null && (view.permissions.attendanceAll || Boolean(records[person.id]))).length;
  const unknown = view.permissions.attendanceAll ? 0 : students.filter((person) => !invalid.has(person.id) && !records[person.id]).length;
  return { total: students.length, present, absent, missing, unknown, invalid: invalid.size, complete: students.length > 0 && present + absent === students.length };
}

export function praiseAccountProgress(view: PraiseView) {
  const staff = view.people.filter((person) => person.kind === "STAFF" && person.active);
  const linkedIds = new Set(view.access.filter((access) => access.active).map((access) => access.staffId));
  return { total: staff.length, linked: staff.filter((person) => linkedIds.has(person.id)).length, missing: staff.filter((person) => !linkedIds.has(person.id)) };
}
