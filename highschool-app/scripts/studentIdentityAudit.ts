import { buildPeopleProfiles } from "../src/features/portal/peopleSearch";
import { parseClassKey } from "../src/lib/classKey";
import { normalizeName, stripSuffix } from "../src/lib/studentMatcher";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
const digits = (value: unknown) => text(value).replace(/\D/g, "");
const phone = (value: unknown) => digits(value).length >= 8 ? digits(value) : "";

type StudentRow = {
  path: string;
  year: string;
  classKey: string;
  studentId: string;
  personId: string;
  name: string;
  normalizedName: string;
  bu: number | null;
  grade: number | null;
  classNum: number | null;
  profileIndex: number | undefined;
  birth: string;
  birthProvided: boolean;
  phone: string;
  parentPhone: string;
};

function equality(left: string, right: string) {
  if (!left && !right) return "both_missing" as const;
  if (!left || !right) return "one_missing" as const;
  return left === right ? "same" as const : "different" as const;
}

function birthFormat(row: StudentRow) {
  if (!row.birthProvided) return "missing" as const;
  if (row.birth.length === 6) return "6_digits" as const;
  if (row.birth.length === 8) return "8_digits" as const;
  return "other" as const;
}

function compareBirth(left: StudentRow, right: StudentRow) {
  if (birthFormat(left) === "other" || birthFormat(right) === "other") return "invalid_format" as const;
  const result = equality(left.birth, right.birth);
  if (result === "different" && left.birth.length !== right.birth.length && left.birth.slice(-6) === right.birth.slice(-6)) {
    return "6_vs_8_digits" as const;
  }
  return result;
}

function compareStudents(left: StudentRow, right: StudentRow, ambiguousCandidate: boolean) {
  const differentYear = left.year !== right.year;
  const sameDepartment = left.bu && right.bu ? left.bu === right.bu : null;
  const normalProgression = differentYear && /^\d{4}$/.test(left.year) && /^\d{4}$/.test(right.year) && left.grade && right.grade
    ? right.grade - left.grade === Number(right.year) - Number(left.year) : null;
  const birth = compareBirth(left, right);
  const ownPhone = equality(left.phone, right.phone);
  const parentPhone = equality(left.parentPhone, right.parentPhone);
  const personId = equality(left.personId, right.personId);
  const reasons: string[] = [];
  if (birth === "one_missing" || birth === "both_missing") reasons.push("birth_missing");
  if (birth === "6_vs_8_digits") reasons.push("birth_6_vs_8_digits");
  if (birth === "different") reasons.push("birth_conflict");
  if (birth === "invalid_format") reasons.push("birth_invalid_format");
  if (ambiguousCandidate) reasons.push("ambiguous_candidate");
  if (!differentYear) reasons.push("same_year_duplicate");
  if (sameDepartment === false) reasons.push("department_changed");
  if (sameDepartment === null || normalProgression === null && differentYear) reasons.push("class_or_year_unreadable");
  if (normalProgression === false) reasons.push("progression_mismatch");
  if (personId === "different") reasons.push("person_id_difference");
  if (personId === "one_missing" || personId === "both_missing") reasons.push("person_id_missing");
  if (left.studentId !== right.studentId) reasons.push("student_id_difference");
  // 후보 표시는 병합 허가가 아니다. 생년·전화 원문은 반환하지 않는다.
  const strongCandidate = !ambiguousCandidate && differentYear && sameDepartment === true && normalProgression === true
    && ownPhone === "same" && parentPhone === "same" && birth !== "different" && birth !== "invalid_format";
  return {
    leftPath: left.path,
    rightPath: right.path,
    differentYear,
    sameDepartment,
    normalProgression,
    birth,
    ownPhone,
    parentPhone,
    personId,
    reasons,
    strongCandidate,
    requiresHumanReview: true as const,
  };
}

/** classes의 전체 연도 스냅샷을 메모리에서 진단한다. DB 통신·입력 변경·수정 계획 생성은 없다. */
export function auditStudentIdentities(classes: Record<string, unknown>) {
  if (!classes || typeof classes !== "object" || Array.isArray(classes)) throw new TypeError("classes 루트 객체가 필요합니다.");
  const profiles = buildPeopleProfiles({
    classes, attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
  });
  // 같은 personId도 동년 중복이면 별도 프로필이므로 id 문자열로 개수를 세지 않는다.
  const profileByRecord = new Map<string, number>();
  profiles.forEach((profile, index) => profile.records.forEach((record) => profileByRecord.set(record.id, index)));
  const rows: StudentRow[] = [];
  for (const [year, yearValue] of Object.entries(classes)) {
    for (const [classKey, classValue] of Object.entries(asRecord(yearValue))) {
      const parsed = parseClassKey(classKey);
      for (const [studentId, studentValue] of Object.entries(asRecord(asRecord(classValue).students))) {
        const student = asRecord(studentValue);
        const name = text(student.name);
        rows.push({
          path: `classes/${year}/${classKey}/students/${studentId}`,
          year, classKey, studentId, name,
          personId: text(student.personId),
          normalizedName: stripSuffix(normalizeName(name)),
          bu: parsed?.buNum ?? null,
          grade: parsed?.grade ?? null,
          classNum: parsed?.classNum ?? null,
          profileIndex: profileByRecord.get(`class:${year}:${classKey}:${studentId}`),
          birth: digits(student.birth),
          birthProvided: Boolean(text(student.birth)),
          phone: phone(student.phone),
          parentPhone: phone(student.pphone ?? student.pPhone),
        });
      }
    }
  }
  const byName = new Map<string, StudentRow[]>();
  rows.filter((row) => row.profileIndex !== undefined).forEach((row) => {
    byName.set(row.normalizedName, [...(byName.get(row.normalizedName) ?? []), row]);
  });
  const cases = [...byName.entries()]
    .filter(([, group]) => new Set(group.map((row) => row.profileIndex)).size > 1)
    .sort(([left], [right]) => left.localeCompare(right, "ko"))
    .map(([normalizedName, group]) => {
      const duplicateYears = [...new Set(group.map((row) => row.year))]
        .filter((year) => group.filter((row) => row.year === year).length > 1).sort();
      // ponytail: 같은 이름 그룹 안에서만 쌍을 비교한다. 대규모 동명 그룹이 생기면 프로필 단위 요약으로 바꾼다.
      const comparisons = group.flatMap((left, index) => group.slice(index + 1)
        .filter((right) => left.profileIndex !== right.profileIndex)
        .map((right) => compareStudents(left, right, duplicateYears.includes(left.year) || duplicateYears.includes(right.year))));
      return {
        normalizedName,
        profileCount: new Set(group.map((row) => row.profileIndex)).size,
        sameYearDuplicateYears: duplicateYears,
        records: group.map((row) => ({
          path: row.path, year: row.year, classKey: row.classKey, studentId: row.studentId,
          personId: row.personId, name: row.name, bu: row.bu, grade: row.grade, classNum: row.classNum,
          profileIndex: row.profileIndex!, profileId: profiles[row.profileIndex!].id,
          birthFormat: birthFormat(row),
        })),
        comparisons,
      };
    });
  return {
    counts: {
      studentRecords: rows.length,
      profiles: profiles.length,
      ignoredRecords: rows.filter((row) => row.profileIndex === undefined).length,
      splitNames: cases.length,
      strongCandidatePairs: cases.reduce((count, item) => count + item.comparisons.filter((pair) => pair.strongCandidate).length, 0),
      strongCandidateNames: cases.filter((item) => item.comparisons.some((pair) => pair.strongCandidate)).length,
      byYear: Object.keys(classes).sort().map((year) => {
        const yearlyRows = rows.filter((row) => row.year === year);
        return {
          year,
          studentRecords: yearlyRows.length,
          profiles: new Set(yearlyRows.map((row) => row.profileIndex).filter((index) => index !== undefined)).size,
        };
      }),
    },
    cases,
  };
}
