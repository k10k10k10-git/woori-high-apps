import { Group } from "./types";

/**
 * 조 전역 번호 표시 라벨 (행정 앱 retreat-app/lib/groupNumber.ts 와 동일 규칙).
 * 1부는 자기 번호 그대로, 2부는 1부 조 개수만큼 이어서 번호를 매김.
 *   예) 1부 1~10조 → 1~10조, 2부 1~10조 → 11~20조
 * 저장된 name은 그대로 두고 "표시"만 전역 번호로 바꾸는 용도.
 * 숫자형 이름("3조", "3")만 변환하고, 커스텀 이름(예: "독수리조")은 그대로 반환.
 */
export function groupDisplayName(group: Group, groups: Group[]): string {
  const m = group.name.match(/^\s*(\d+)\s*조?\s*$/);
  if (!m) return group.name;
  const local = parseInt(m[1]);
  if (group.bu === "2부") {
    const bu1Count = groups.filter(g => g.bu === "1부").length;
    return `${local + bu1Count}조`;
  }
  return `${local}조`;
}
