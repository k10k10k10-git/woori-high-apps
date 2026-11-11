// Query 조건과 클라이언트 쪽 거르기. 서버는 위치 전체를 주고, 정렬·범위·개수 제한은 여기서 Firebase 규칙대로 한다.
import { compareIndexValues, compareKeys, MAX_NAME, MIN_NAME, sortedKeys } from "./ordering";
import { getChild, isBranch, normalize, type Node, type TreeNode } from "./tree";

export type IndexSpec =
  | { readonly type: "priority" }
  | { readonly type: "key" }
  | { readonly type: "value" }
  | { readonly type: "child"; readonly path: string };

export type BoundValue = number | string | boolean | null;

export interface Bound {
  readonly value: BoundValue;
  readonly key: string;
  readonly inclusive: boolean;
}

export interface QueryParams {
  readonly index: IndexSpec;
  readonly orderBySet: boolean;
  readonly start?: Bound;
  readonly end?: Bound;
  readonly limit?: { readonly count: number; readonly from: "first" | "last" };
}

export const DEFAULT_PARAMS: QueryParams = { index: { type: "priority" }, orderBySet: false };

export function hasFilter(params: QueryParams): boolean {
  return params.start !== undefined || params.end !== undefined || params.limit !== undefined;
}

/** 같은 거르기면 같은 문자열 — 같은 구독(view)을 공유하는 기준. */
export function queryIdentifier(params: QueryParams): string {
  if (!params.orderBySet && !hasFilter(params)) return "default";
  return JSON.stringify([params.index, params.start ?? null, params.end ?? null, params.limit ?? null]);
}

function indexValue(index: IndexSpec, key: string, child: Node): Node {
  switch (index.type) {
    case "priority": return null;
    case "key": return key;
    case "value": return child;
    case "child": return getChild(child, index.path);
  }
}

/** 색인 순서 비교(같으면 키 순서). */
export function compareChildren(index: IndexSpec, aKey: string, aNode: Node, bKey: string, bNode: Node): number {
  if (index.type === "key") return compareKeys(aKey, bKey);
  const byIndex = compareIndexValues(indexValue(index, aKey, aNode), indexValue(index, bKey, bNode));
  return byIndex !== 0 ? byIndex : compareKeys(aKey, bKey);
}

export function orderedKeys(node: Node, index: IndexSpec): string[] {
  if (!isBranch(node)) return [];
  if (index.type === "priority" || index.type === "key") return sortedKeys(node);
  return Object.keys(node).sort((a, b) => compareChildren(index, a, node[a], b, node[b]));
}

function compareToBound(index: IndexSpec, key: string, child: Node, bound: Bound): number {
  if (index.type === "key") return compareKeys(key, typeof bound.value === "string" ? bound.value : String(bound.value));
  const byIndex = compareIndexValues(indexValue(index, key, child), normalize(bound.value));
  return byIndex !== 0 ? byIndex : compareKeys(key, bound.key);
}

function withinStart(index: IndexSpec, key: string, child: Node, bound: Bound | undefined): boolean {
  if (!bound) return true;
  const cmp = compareToBound(index, key, child, bound);
  return cmp > 0 || (cmp === 0 && bound.inclusive);
}

function withinEnd(index: IndexSpec, key: string, child: Node, bound: Bound | undefined): boolean {
  if (!bound) return true;
  const cmp = compareToBound(index, key, child, bound);
  return cmp < 0 || (cmp === 0 && bound.inclusive);
}

/** 위치 값에 query 를 적용한다. 정렬만 있는 query 는 값이 그대로다. */
export function applyQuery(node: Node, params: QueryParams): Node {
  if (!hasFilter(params)) return node;
  if (!isBranch(node)) return null;
  let keys = orderedKeys(node, params.index)
    .filter((key) => withinStart(params.index, key, node[key], params.start)
      && withinEnd(params.index, key, node[key], params.end));
  if (params.limit) {
    keys = params.limit.from === "first" ? keys.slice(0, params.limit.count) : keys.slice(Math.max(0, keys.length - params.limit.count));
  }
  if (keys.length === 0) return null;
  const out: Record<string, TreeNode> = {};
  for (const key of keys) out[key] = node[key];
  return out;
}

export function startBound(value: BoundValue, key: string | undefined, inclusive: boolean): Bound {
  return { value, key: key ?? (inclusive ? MIN_NAME : MAX_NAME), inclusive };
}

export function endBound(value: BoundValue, key: string | undefined, inclusive: boolean): Bound {
  return { value, key: key ?? (inclusive ? MAX_NAME : MIN_NAME), inclusive };
}
