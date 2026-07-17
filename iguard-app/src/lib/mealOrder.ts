import type { Group, IguardMeal } from "./types";
import { groupDisplayName } from "./groupNumber";

export interface MealOrderItem {
  group: Group;
  label: string;
  order: number;
  people: number;
}

const groupSort = (a: Group, b: Group) =>
  a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko", { numeric: true });

/**
 * 저장된 seq 순서에 조를 연결하고, 아직 순번이 없는 조는 자연순으로 뒤에 붙인다.
 * 표시는 알파벳이 아닌 행정 조편성과 동일한 전역 조 번호를 사용한다.
 */
export function buildMealOrderItems(meal: IguardMeal, groups: Group[]): MealOrderItem[] {
  const sortedGroups = [...groups].sort(groupSort);
  const entries = new Map((meal.entries || []).map(entry => [entry.groupId, entry]));
  const present = sortedGroups
    .filter(group => entries.has(group.id))
    .sort((a, b) => entries.get(a.id)!.seq - entries.get(b.id)!.seq);
  const absent = sortedGroups.filter(group => !entries.has(group.id));

  return [...present, ...absent].map((group, index) => ({
    group,
    label: groupDisplayName(group, groups),
    order: index + 1,
    people: group.studentIds?.length || 0,
  }));
}
