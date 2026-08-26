import { parseClassKey } from "@/lib/classKey";

type ClassRosterSource = Record<string, {
  teacher?: string;
  students?: Record<string, { name: string; num?: number; phone?: string; jang?: boolean }>;
}>;

export interface StudentInfo {
  id: string;
  name: string;
  num: number;
  grade: number;
  classNum: number;
  phone?: string;
  jang?: boolean;
}

export interface ClassInfo {
  buNum: number;
  grade: number;
  classNum: number;
  teacher: string;
  students: StudentInfo[];
}

export const CELL_COLORS = ["green", "purple", "blue", "orange", "red"] as const;
export type CellColor = typeof CELL_COLORS[number];

export const COLOR_CLASSES: Record<CellColor, string> = {
  green: "bg-green-100 text-green-800 font-semibold border-green-300 cursor-pointer",
  purple: "bg-purple-100 text-purple-800 font-semibold border-purple-300 cursor-pointer",
  blue: "bg-blue-200 text-blue-900 font-semibold border-blue-400 cursor-pointer",
  orange: "bg-orange-200 text-orange-900 font-semibold border-orange-400 cursor-pointer",
  red: "bg-red-200 text-red-900 font-semibold border-red-400 cursor-pointer",
};

export const COLOR_LABELS: Record<CellColor, string> = {
  green: "1부 신청자",
  purple: "2부 신청자",
  blue: "입금완료",
  orange: "부분참",
  red: "신청취소",
};

export function stripRosterSuffix(name: string) {
  return name.replace(/[A-Za-z]+$/, "").trim();
}

export function buildClassInfos(classesRaw: ClassRosterSource): ClassInfo[] {
  const infos: ClassInfo[] = [];
  Object.entries(classesRaw).forEach(([classKey, classData]) => {
    const parsed = parseClassKey(classKey);
    if (!parsed) return;
    const { buNum, grade, classNum } = parsed;
    const students: StudentInfo[] = Object.entries(classData.students || {})
      .map(([id, student]) => ({ id, grade, classNum, name: student.name, num: student.num ?? 0, phone: student.phone, jang: !!student.jang }))
      .sort((left, right) => left.name.localeCompare(right.name, "ko"));
    infos.push({ buNum, grade, classNum, teacher: classData.teacher || "", students });
  });
  return infos.sort((left, right) => left.buNum - right.buNum || left.grade - right.grade || left.classNum - right.classNum);
}
