/** classKey "{부}-{학년}-{반}" (예: "1-2-3" = 1부 2학년 3반) 파싱 — 여러 탭·db.ts에 흩어져 있던 split("-") 파싱의 단일 원천.
 *  features/semester/classKey.ts에도 같은 이름이 있으나 반환 형태와 검증이 다르다(그쪽 주석 참조). */
export function parseClassKey(classKey: string): { buNum: number; grade: number; classNum: number } | null {
  const parts = classKey.split("-");
  const buNum = parseInt(parts[0]);
  const grade = parseInt(parts[1]);
  const classNum = parseInt(parts[2]);
  if (!buNum || !grade || !classNum) return null;
  return { buNum, grade, classNum };
}
