// 메모리 안의 RTDB 트리. Firebase 노드처럼 값이 없거나 빈 객체면 null, 배열은 인덱스 키 객체로 둔다.
// 트리는 바꾸지 않고(불변) 바뀐 경로만 새 객체로 만들어, 바뀌지 않은 하위 트리는 같은 객체를 공유한다.
import { pathSegments } from "./path";

export type Leaf = string | number | boolean;
export interface Branch { readonly [key: string]: TreeNode }
export type TreeNode = Leaf | Branch;
/** null 은 "값 없음"이다. 객체 자식에는 null 이 들어가지 않는다. */
export type Node = TreeNode | null;

export function isBranch(node: Node | undefined): node is Branch {
  return node !== null && node !== undefined && typeof node === "object";
}

/**
 * 임의의 JS 값을 트리 노드로 바꾼다. 배열은 인덱스 키 객체, null·undefined 자식은 버리고,
 * 비거나 자식이 모두 비면 null. `.value`·`.priority` 래퍼는 Firebase 처럼 풀거나 버린다.
 */
export function normalize(value: unknown): Node {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) {
    const out: Record<string, TreeNode> = {};
    value.forEach((item, index) => {
      const child = normalize(item);
      if (child !== null) out[String(index)] = child;
    });
    return Object.keys(out).length ? out : null;
  }
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, ".value")) return normalize(record[".value"]);
  const out: Record<string, TreeNode> = {};
  for (const key of Object.keys(record)) {
    if (key.startsWith(".")) continue;
    const child = normalize(record[key]);
    if (child !== null) out[key] = child;
  }
  return Object.keys(out).length ? out : null;
}

export function getChild(node: Node, path: string): Node {
  let current: Node = node;
  for (const key of pathSegments(path)) {
    if (!isBranch(current)) return null;
    current = current[key] ?? null;
  }
  return current;
}

/** path 위치를 value 로 바꾼 새 트리. 지운 뒤 빈 조상은 함께 없앤다. */
export function setChild(node: Node, path: string, value: Node): Node {
  return setSegments(node, pathSegments(path), 0, value);
}

function setSegments(node: Node, keys: string[], index: number, value: Node): Node {
  if (index === keys.length) return value;
  const key = keys[index];
  const base = isBranch(node) ? node : null;
  const before = base ? base[key] ?? null : null;
  const after = setSegments(before, keys, index + 1, value);
  if (after === before) return node;
  const next: Record<string, TreeNode> = base ? { ...base } : {};
  if (after === null) delete next[key];
  else next[key] = after;
  return Object.keys(next).length ? next : null;
}

export function deepEqual(a: Node, b: Node): boolean {
  if (a === b) return true;
  if (!isBranch(a) || !isBranch(b)) return false;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
}

/** 새 값과 같은 하위 트리는 이전 객체를 그대로 써서, 바뀌지 않은 구독은 비교가 즉시 끝나게 한다. */
export function reconcile(previous: Node, next: Node): Node {
  if (previous === next) return previous;
  if (!isBranch(previous) || !isBranch(next)) return deepEqual(previous, next) ? previous : next;
  const out: Record<string, TreeNode> = {};
  let same = Object.keys(previous).length === Object.keys(next).length;
  for (const key of Object.keys(next)) {
    const before = previous[key] ?? null;
    const child = reconcile(before, next[key]) as TreeNode;
    if (child !== before) same = false;
    out[key] = child;
  }
  return same ? previous : out;
}

export function countChildren(node: Node): number {
  return isBranch(node) ? Object.keys(node).length : 0;
}
