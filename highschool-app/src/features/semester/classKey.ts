// classKey "{부}-{학년}-{반}" 파싱 (split 직접 파싱 금지 컨벤션).
//
// lib/classKey.ts에도 같은 이름의 parseClassKey가 있지만 계약이 다르므로 서로 대체할 수 없다.
//   - 이쪽: bu를 "1부"/"2부" 문자열로 돌려주고, parts.length !== 3을 거부하며 0을 허용한다.
//   - lib/: buNum을 숫자로 돌려주고, 자릿수를 검사하지 않으며 0을 거부한다.
// 통합하려면 양쪽 호출부의 기대를 먼저 특성화 테스트로 고정해야 한다.

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
