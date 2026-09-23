import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { getPraiseFirebaseAdmin, praiseUnavailable } from "@/features/praise/server/firebaseAdmin";
import { praiseHttp } from "@/features/praise/server/http";
import { resolveStudentKey } from "@/lib/studentMatcher";
import type { Participant, Student } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return praiseHttp(async () => {
    const actor = await authenticatePraiseRequest(request);
    const retreatId = new URL(request.url).searchParams.get("retreatId") ?? "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(retreatId)
      || actor.roles.retreat === "none") return { students: {} };
    const database = getPraiseFirebaseAdmin().database;
    let yearValue: unknown;
    try {
      yearValue = (await database.ref(`retreats/${retreatId}/year`).get()).val();
    } catch {
      throw praiseUnavailable("retreat_roster_unavailable");
    }
    const year = Number(yearValue);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return { students: {} };
    let classes: unknown;
    let retreat: Record<string, unknown>;
    try {
      const fields = ["participants", "groups", "rooms", "cellColors", "partialAttendances"];
      const values = await Promise.all([`classes/${year}`, ...fields.map((field) => `retreats/${retreatId}/${field}`)]
        .map(async (path) => (await database.ref(path).get()).val()));
      [classes] = values;
      retreat = Object.fromEntries(fields.map((field, index) => [field, values[index + 1]]));
    } catch {
      throw praiseUnavailable("retreat_roster_unavailable");
    }
    const students: Record<string, Student> = {};
    const classByKey: Record<string, { teacher?: string; students: Record<string, Student> }> = {};
    const classTeacher = new Map<string, string | undefined>();
    const studentClass = new Map<string, { classKey: string; studentId: string }>();
    if (classes && typeof classes === "object" && !Array.isArray(classes)) {
      for (const [classKey, value] of Object.entries(classes)) {
        const match = classKey.match(/^([12])-(\d+)-(\d+)$/);
        const roster = (value as { students?: Record<string, Student> } | null)?.students;
        if (!match) continue;
        classTeacher.set(classKey, (value as { teacher?: string } | null)?.teacher);
        if (!roster || typeof roster !== "object") continue;
        for (const [studentId, record] of Object.entries(roster)) {
          if (!record || typeof record.name !== "string") continue;
          const key = `${match[1]}_${record.id?.trim() || studentId}`;
          students[key] = { ...record, id: key, buNum: Number(match[1]), grade: Number(match[2]), class: Number(match[3]) };
          studentClass.set(key, { classKey, studentId });
        }
      }
    }
    // 중앙 운영은 기존 수련회 동기화 기능에 전체 원장이 필요하다. 현장·조회 역할만 제한한다.
    if (["superAdmin", "pastor", "adminTeam"].includes(actor.roles.retreat)) {
      return { year, students, classes };
    }
    const allowed = new Set<string>();
    const participants = retreat?.participants;
    if (participants && typeof participants === "object" && !Array.isArray(participants)) {
      for (const participant of Object.values(participants)) {
        if (!participant || typeof participant !== "object") continue;
        const key = resolveStudentKey(participant as Participant, students);
        if (key) allowed.add(key);
      }
    }
    for (const field of ["groups", "rooms"] as const) {
      const records = retreat?.[field];
      if (!records || typeof records !== "object") continue;
      for (const record of Object.values(records)) {
        const ids = (record as { studentIds?: unknown } | null)?.studentIds;
        if (Array.isArray(ids)) ids.forEach((id) => { if (typeof id === "string") allowed.add(id); });
      }
    }
    for (const field of ["partialAttendances", "cellColors"] as const) {
      const records = retreat?.[field];
      if (records && typeof records === "object") Object.keys(records).forEach((key) => allowed.add(key));
    }
    const selectedStudents = Object.fromEntries([...allowed].filter((key) => students[key]).map((key) => {
      const { id, name, num, grade, class: classNumber, buNum } = students[key];
      return [key, { id, name, num: num ?? 0, grade, class: classNumber, buNum,
        birth: "", phone: "", pPhone: "", addr: "", photo: "", school: "" }];
    }));
    for (const key of allowed) {
      const location = studentClass.get(key);
      if (location) {
        classByKey[location.classKey] ??= { teacher: classTeacher.get(location.classKey), students: {} };
        classByKey[location.classKey].students[location.studentId] = selectedStudents[key];
      }
    }
    return { year, students: selectedStudents, classes: classByKey };
  });
}
