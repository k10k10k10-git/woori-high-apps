import { Group } from "./types";

/**
 * 조 전역 번호 표시 라벨.
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

/**
 * 조 목록을 이름의 숫자 기준 오름차순으로 정렬(1조, 2조, 3조 … 순).
 * 저장 순서(생성 순서)가 뒤섞여 "10조, 11조, 12조, 1조"처럼 보이는 문제를 화면 표시에서만 바로잡는다.
 * 숫자가 없는 커스텀 이름(예: "독수리조")은 숫자 조들 뒤에 이름순으로 붙인다.
 */
export function sortGroupsByNumber<T extends { name: string }>(groups: T[]): T[] {
  const numOf = (g: T): number | null => {
    const m = g.name.match(/^\s*(\d+)\s*조?\s*$/);
    return m ? parseInt(m[1]) : null;
  };
  return [...groups].sort((a, b) => {
    const an = numOf(a), bn = numOf(b);
    if (an !== null && bn !== null) return an - bn;
    if (an !== null) return -1;
    if (bn !== null) return 1;
    return a.name.localeCompare(b.name, "ko");
  });
}

/**
 * 화면에 표시되는 전역 조 번호 기준 정렬.
 * 1부/2부 로컬 번호가 같은 조를 번갈아 놓지 않고 1조, 2조 … 전체 순서로 나열한다.
 */
export function sortGroupsByDisplayNumber<T extends Group>(groups: T[]): T[] {
  const displayNumber = (group: T): number | null => {
    const match = groupDisplayName(group, groups).match(/^\s*(\d+)\s*조?\s*$/);
    return match ? Number(match[1]) : null;
  };
  return [...groups].sort((a, b) => {
    const aNumber = displayNumber(a);
    const bNumber = displayNumber(b);
    if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
    if (aNumber !== null) return -1;
    if (bNumber !== null) return 1;
    return groupDisplayName(a, groups).localeCompare(groupDisplayName(b, groups), "ko", { numeric: true });
  });
}
