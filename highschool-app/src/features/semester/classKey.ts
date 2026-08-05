// classKey "{부}-{학년}-{반}" 파싱 — retreat-app lib/classKey.ts와 동일 규칙 (split 직접 파싱 금지 컨벤션)

export interface ParsedClassKey {
  bu: string; // "1부" | "2부"
  grade: number;
  classNum: number;
}

export function parseClassKey(classKey: string): ParsedClassKey | null {
  const parts = classKey?.split("-");
  if (!parts || parts.length !== 3) return null;
  const [buNum, grade, cls] = parts.map((p) => parseInt(p, 10));
  if ([buNum, grade, cls].some(Number.isNaN)) return null;
  return { bu: buNum === 1 ? "1부" : "2부", grade, classNum: cls };
}
