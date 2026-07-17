import { ref, get } from "firebase/database";
import { db } from "../firebase";
import { Student, ClassData } from "../types";
import { paths } from "../paths";
import { parseClassKey } from "../classKey";

// ── Firebase Students ──────────────────────────────────────

export async function getStudentsByYear(year: number): Promise<Record<string, Student>> {
  const snap = await get(ref(db, paths.classes(year)));
  if (!snap.exists()) return {};

  const result: Record<string, Student> = {};
  const classesData = snap.val() as Record<string, ClassData>;

  Object.entries(classesData).forEach(([classKey, classData]) => {
    // 기존 동작 보존: 이 지점은 원래 가드 없이 NaN을 흘려보냈다 — 스킵하지 않는다
    const parsed = parseClassKey(classKey) ?? { buNum: NaN, grade: NaN, classNum: NaN };
    const buNum = parsed.buNum;   // 부 (1/2)
    const grade = parsed.grade;   // 학년 (1/2/3)
    const cls   = parsed.classNum; // 반 번호

    if (classData.students) {
      Object.entries(classData.students).forEach(([studentId, student]) => {
        // 1부와 2부에 동일한 studentId가 있으므로 부 번호를 앞에 붙여 유니크하게
        const uniqueKey = `${buNum}_${studentId}`;
        result[uniqueKey] = {
          ...student,
          id: uniqueKey,  // 부 prefix 포함한 진짜 고유 ID
          buNum,
          grade,
          class: cls,
        };
      });
    }
  });

  return result;
}

/** classes/{year} 전체를 원시 형태로 반환 — 직접 Firebase 접근 대신 사용 */
export async function getClassesByYear(year: number): Promise<Record<string, {
  teacher?: string;
  students?: Record<string, { name: string; num?: number; phone?: string; jang?: boolean }>;
}>> {
  const snap = await get(ref(db, paths.classes(year)));
  return snap.exists() ? snap.val() : {};
}

export async function getAttendanceByYear(year: number): Promise<Record<string, Record<string, Record<string, string>>>> {
  const snap = await get(ref(db, paths.attendance(year)));
  return snap.exists() ? snap.val() : {};
}

// ── Teachers from DB (classes node) ──────────────────────

export interface LoadableTeacher { name: string; bu: string; classKey: string; originKey: string; gender?: "남" | "여"; }
export interface LoadTeachersResult {
  teachers: LoadableTeacher[];
  hasStaffNode: boolean; // teacherStaff/{year} 존재 여부 — 없으면 공식스탭이 비어 나옴(연도 가드용)
}

export async function loadTeachersFromDB(year: number): Promise<LoadTeachersResult> {
  const [classSnap, staffSnap, specialSnap, extraSnap] = await Promise.all([
    get(ref(db, paths.classes(year))),
    get(ref(db, paths.teacherStaff(year))),
    get(ref(db, paths.teacherSpecial(year))),
    get(ref(db, paths.teacherExtra(year))),
  ]);

  const result: LoadableTeacher[] = [];
  const extraData = extraSnap.exists()
    ? extraSnap.val() as Record<string, Record<string, { title?: string; name?: string }>>
    : {};

  if (classSnap.exists()) {
    const classesData = classSnap.val() as Record<string, { teacher?: string }>;
    Object.entries(classesData).forEach(([classKey, cd]) => {
      const parsed = parseClassKey(classKey);
      if (!parsed) return;
      const { buNum, grade, classNum: cls } = parsed;
      const extraKey = classKey.replaceAll("-", "_");
      const extra = extraData[String(buNum)]?.[extraKey];
      const teacherName = extra?.name?.trim() || cd.teacher?.trim();
      if (!teacherName) return;
      result.push({
        name: teacherName,
        bu: buNum === 1 ? "1부" : "2부",
        classKey: extra?.title?.trim() || `${grade}학년 ${cls}반`,
        originKey: `class:${classKey}`, // 반 단위 안정 키 (부-학년-반)
      });
    });
  }

  if (specialSnap.exists()) {
    const specialData = specialSnap.val() as Record<string, Array<{ title?: string; name?: string }>>;
    Object.entries(specialData).forEach(([part, list]) => {
      if (!Array.isArray(list)) return;
      list.forEach((teacher, index) => {
        const name = teacher?.name?.trim();
        if (!name) return;
        result.push({
          name,
          bu: part === "1" ? "1부" : "2부",
          classKey: teacher.title?.trim() || "비반담임",
          originKey: `special:${part}:${index}`,
        });
      });
    });
  }

  if (staffSnap.exists()) {
    const staffData = staffSnap.val() as Record<string, { name?: string; title?: string }>;
    Object.entries(staffData).forEach(([staffKey, s]) => {
      if (!s.name) return;
      result.push({
        name: s.name,
        bu: "스탭",
        classKey: s.title || "스탭",
        originKey: `staff:${staffKey}`, // teacherStaff 노드키 = 인물 단위 안정 키
      });
    });
  }

  return {
    teachers: result.sort((a, b) => a.bu.localeCompare(b.bu) || a.classKey.localeCompare(b.classKey, "ko")),
    hasStaffNode: staffSnap.exists(),
  };
}
