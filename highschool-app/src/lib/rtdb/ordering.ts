// Firebase 키 순서·값 순서·배열 변환. 원본은 Firebase JS SDK 의 nameCompare·LeafNode.compareTo·ChildrenNode.val.
import { isBranch, type Node } from "./tree";

export const MIN_NAME = "[MIN_NAME]";
export const MAX_NAME = "[MAX_NAME]";

const INT_KEY = /^-?(0*)\d{1,10}$/;
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const ARRAY_INDEX_KEY = /^(0|[1-9]\d*)$/;

function tryParseInt(key: string): number | null {
  if (!INT_KEY.test(key)) return null;
  const value = Number(key);
  return value >= INT32_MIN && value <= INT32_MAX ? value : null;
}

/** 32비트 정수 키 오름차순 → 나머지 문자열 사전순. */
export function compareKeys(a: string, b: string): number {
  if (a === b) return 0;
  if (a === MIN_NAME || b === MAX_NAME) return -1;
  if (b === MIN_NAME || a === MAX_NAME) return 1;
  const aInt = tryParseInt(a);
  const bInt = tryParseInt(b);
  if (aInt !== null) {
    if (bInt === null) return -1;
    return aInt - bInt === 0 ? a.length - b.length : aInt - bInt;
  }
  if (bInt !== null) return 1;
  return a < b ? -1 : 1;
}

export function sortedKeys(node: Node): string[] {
  return isBranch(node) ? Object.keys(node).sort(compareKeys) : [];
}

const typeRank = (value: Node): number => {
  if (value === null) return 0;
  if (value === false) return 1;
  if (value === true) return 2;
  if (typeof value === "number") return 3;
  if (typeof value === "string") return 4;
  return 5;
};

/** 색인 값 순서: 없음 < false < true < 숫자 < 문자열 < 객체(객체끼리는 같다). */
export function compareIndexValues(a: Node, b: Node): number {
  const rankA = typeRank(a);
  const rankB = typeRank(b);
  if (rankA !== rankB) return rankA - rankB;
  if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
  if (typeof a === "string" && typeof b === "string") return a === b ? 0 : a < b ? -1 : 1;
  return 0;
}

/**
 * 스냅샷 값 꺼내기. exportFormat 이 아니면 Firebase 처럼 키가 모두 0 이상 정수이고
 * 최댓값이 자식 수의 두 배보다 작을 때 배열로 바꾼다(빈 자리는 구멍으로 남는다).
 * 매번 새 객체를 만들어 호출자가 바꿔도 캐시가 오염되지 않는다.
 */
export function nodeToValue(node: Node, exportFormat = false): unknown {
  if (!isBranch(node)) return node;
  const object: Record<string, unknown> = {};
  let count = 0;
  let maxKey = 0;
  let allIntegerKeys = true;
  for (const key of sortedKeys(node)) {
    object[key] = nodeToValue(node[key], exportFormat);
    count += 1;
    if (allIntegerKeys && ARRAY_INDEX_KEY.test(key)) maxKey = Math.max(maxKey, Number(key));
    else allIntegerKeys = false;
  }
  if (!exportFormat && allIntegerKeys && maxKey < 2 * count) {
    const array: unknown[] = [];
    for (const key of Object.keys(object)) array[Number(key)] = object[key];
    return array;
  }
  return object;
}
