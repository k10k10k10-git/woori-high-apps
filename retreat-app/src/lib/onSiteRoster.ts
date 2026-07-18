import type { Participant, PartialAttendance, TeacherAttendance } from "./types";
import { normalizeName } from "./studentMatcher";

export type OnSiteRosterStatusTone = "partial" | "absent" | "cancelled";

export interface OnSiteRosterStatus {
  label: string;
  tone: OnSiteRosterStatusTone;
}

export interface OnSiteClassStudent {
  rawId: string;
  buNum: number;
  grade: number;
  classNum: number;
  name: string;
  gender?: string;
}

export interface OnSiteRosterPerson {
  source: "student" | "teacher";
  sourceKey: string;
  onSiteKey: string;
  name: string;
  gender: string;
  grade: number;
  classNum: number;
  hasMatch: boolean;
  status?: OnSiteRosterStatus;
}

interface BuildOnSiteRosterArgs {
  participants: Record<string, Participant>;
  teachers: TeacherAttendance[];
  partialAttendances: PartialAttendance[];
  cellColors: Record<string, string>;
  classStudents: OnSiteClassStudent[];
  buNum: 1 | 2;
}

function normalizeStudentKey(studentId: string | null | undefined, buNum: number) {
  if (!studentId) return null;
  const id = String(studentId);
  return /^[12]_/.test(id) ? id : `${buNum}_${id}`;
}

function resolveParticipantStudentKey(
  participant: Participant,
  buNum: number,
  classStudents: OnSiteClassStudent[],
) {
  const stored = normalizeStudentKey(participant.studentId, buNum);
  if (stored) return stored;

  const targetName = normalizeName(participant.name);
  const candidates = classStudents.filter(student =>
    student.buNum === buNum && normalizeName(student.name) === targetName
  );
  const exactClass = candidates.filter(student =>
    student.grade === participant.grade && student.classNum === participant.class
  );
  const exactGrade = candidates.filter(student => student.grade === participant.grade);
  const match = exactClass.length === 1
    ? exactClass[0]
    : exactGrade.length === 1
      ? exactGrade[0]
      : candidates.length === 1
        ? candidates[0]
        : undefined;
  return match ? `${buNum}_${match.rawId}` : null;
}

function parseTeacherClass(classKey: string) {
  const match = classKey.match(/(\d+)학년\s*(\d+)반/);
  return match
    ? { grade: Number(match[1]), classNum: Number(match[2]) }
    : { grade: 0, classNum: 0 };
}

function studentStatus(
  studentKey: string | null,
  cellColors: Record<string, string>,
  partialMap: Map<string, PartialAttendance["type"]>,
): OnSiteRosterStatus | undefined {
  if (studentKey && cellColors[studentKey] === "red") {
    return { label: "신청취소", tone: "cancelled" };
  }
  const partialType = studentKey ? partialMap.get(studentKey) : undefined;
  return partialType
    ? { label: `부분참(${partialType})`, tone: "partial" }
    : undefined;
}

function teacherStatus(teacher: TeacherAttendance): OnSiteRosterStatus | undefined {
  if (teacher.status === "불참") return { label: "불참", tone: "absent" };
  if (teacher.status !== "부분참") return undefined;

  const details = [teacher.arrivalInfo, teacher.note, teacher.lateArrival]
    .filter(Boolean)
    .join(" ");
  const subtype = /후발/.test(details)
    ? "후발대"
    : /(선복귀|조기\s*복귀|먼저\s*복귀)/.test(details)
      ? "선복귀"
      : null;
  return {
    label: subtype ? `부분참(${subtype})` : "부분참",
    tone: "partial",
  };
}

/** 현장등록 명단: 전체 신청 학생 + 선택 부서 교사. 스탭은 teachers 단계에서 제외한다. */
export function buildOnSiteRoster({
  participants,
  teachers,
  partialAttendances,
  cellColors,
  classStudents,
  buNum,
}: BuildOnSiteRosterArgs): OnSiteRosterPerson[] {
  const bu = `${buNum}부`;
  const classStudentMap = new Map(
    classStudents.map(student => [`${student.buNum}_${student.rawId}`, student]),
  );
  const partialMap = new Map(partialAttendances.map(record => [record.id, record.type]));
  const seen = new Set<string>();

  const students = Object.entries(participants)
    .filter(([, participant]) => participant.bu?.includes(String(buNum)))
    .map(([participantKey, participant]): OnSiteRosterPerson => {
      const studentKey = resolveParticipantStudentKey(participant, buNum, classStudents);
      const matchedStudent = studentKey ? classStudentMap.get(studentKey) : undefined;
      return {
        source: "student",
        sourceKey: participantKey,
        onSiteKey: studentKey ?? participantKey,
        name: participant.name,
        gender: participant.gender ?? matchedStudent?.gender ?? "",
        grade: matchedStudent?.grade ?? participant.grade,
        classNum: matchedStudent?.classNum ?? participant.class,
        hasMatch: !!matchedStudent,
        status: studentStatus(studentKey, cellColors, partialMap),
      };
    })
    .filter(person => {
      if (seen.has(person.onSiteKey)) return false;
      seen.add(person.onSiteKey);
      return true;
    });

  const teacherPeople = teachers
    .filter(teacher => teacher.bu === bu && teacher.bu !== "스탭")
    .map((teacher): OnSiteRosterPerson => {
      const parsed = parseTeacherClass(teacher.classKey || "");
      return {
        source: "teacher",
        sourceKey: teacher.id,
        onSiteKey: `teacher:${teacher.id}`,
        name: teacher.name,
        gender: teacher.gender ?? "",
        grade: parsed.grade,
        classNum: parsed.classNum,
        hasMatch: true,
        status: teacherStatus(teacher),
      };
    });

  return [...teacherPeople, ...students].sort((a, b) => {
    if (a.source !== b.source) return a.source === "teacher" ? -1 : 1;
    return a.grade - b.grade || a.classNum - b.classNum || a.name.localeCompare(b.name, "ko");
  });
}
