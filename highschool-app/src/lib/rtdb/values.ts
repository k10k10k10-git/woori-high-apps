// 쓰기 값 검사(Firebase validateFirebaseData)와 서버값(`.sv`) 처리.
import { isAncestorOrSelf, isValidKey, normalizePath, pathSegments, validatePathString } from "./path";
import { getChild, normalize, type Node } from "./tree";

function describe(path: string[]): string {
  return path.length ? `in property '${path.join(".")}'` : "";
}

function isServerValue(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, ".sv");
}

/** Firebase 처럼 undefined·함수·NaN·잘못된 키를 쓰기 전에 막는다(동기 예외). */
export function validateData(fnName: string, value: unknown, path: string[] = [], optional = false): void {
  if (optional && value === undefined) return;
  if (value === undefined) throw new Error(`${fnName} failed: value argument contains undefined ${describe(path)}`.trim());
  if (typeof value === "function") throw new Error(`${fnName} failed: value argument contains a function ${describe(path)} with contents = ${String(value)}`);
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${fnName} failed: value argument contains ${String(value)} ${describe(path)}`.trim());
  }
  if (value === null || typeof value !== "object") return;
  if (!Array.isArray(value) && isServerValue(value as Record<string, unknown>)) return;
  let hasDotValue = false;
  let hasActualChild = false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === ".value") hasDotValue = true;
    else if (key !== ".priority" && key !== ".sv") {
      hasActualChild = true;
      if (!isValidKey(key)) {
        throw new Error(`${fnName} failed: value argument ${describe(path)} contains an invalid key (${key}). `
          + `Keys must be non-empty strings and can't contain ".", "#", "$", "/", "[", or "]"`);
      }
    }
    validateData(fnName, child, [...path, key]);
  }
  if (hasDotValue && hasActualChild) {
    throw new Error(`${fnName} failed: value argument ${describe(path)} contains ".value" child as well as actual children.`);
  }
}

/** update() 인자 검사: 객체여야 하고, 키는 경로이며, 서로 조상·자손 관계면 안 된다. */
export function validateUpdateValues(fnName: string, values: unknown): Array<[string, unknown]> {
  if (values === null || typeof values !== "object" || Array.isArray(values)) {
    throw new Error(`${fnName} failed: values argument must be an object containing the children to replace.`);
  }
  const entries: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    validatePathString(fnName, key, false);
    const path = normalizePath(key);
    if (path === "") throw new Error(`${fnName} failed: values argument contains an invalid key (${key}).`);
    validateData(fnName, value, pathSegments(path));
    entries.push([path, value]);
  }
  const sorted = entries.map(([path]) => path).sort();
  for (let i = 1; i < sorted.length; i += 1) {
    if (isAncestorOrSelf(sorted[i - 1], sorted[i])) {
      throw new Error(`${fnName} failed: values argument contains a path ${sorted[i - 1]} that is ancestor of another path ${sorted[i]}`);
    }
  }
  return entries;
}

/** 서버로 보낼 값. 배열은 인덱스 키 객체로 펼치고 `.sv` 는 그대로 둔다. */
export function toServerJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    value.forEach((item, index) => {
      const child = toServerJson(item);
      if (child !== null) out[String(index)] = child;
    });
    return Object.keys(out).length ? out : null;
  }
  const record = value as Record<string, unknown>;
  if (isServerValue(record)) return { ".sv": record[".sv"] };
  if (Object.prototype.hasOwnProperty.call(record, ".value")) return toServerJson(record[".value"]);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key.startsWith(".")) continue;
    const converted = toServerJson(child);
    if (converted !== null) out[key] = converted;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * 화면에 바로 보일 값. `{".sv":"timestamp"}` 는 지금 시각, `{".sv":{"increment":n}}` 은
 * 지금 보이는 값(existing)에 n 을 더한다. 서버가 확정한 값은 다음 새로고침에서 덮인다.
 */
export function resolveLocally(value: unknown, existing: Node, now: number): Node {
  return normalize(resolveRaw(value, existing, now));
}

function resolveRaw(value: unknown, existing: Node, now: number): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item, index) => resolveRaw(item, getChild(existing, String(index)), now));
  const record = value as Record<string, unknown>;
  if (isServerValue(record)) {
    const sv = record[".sv"];
    if (sv === "timestamp") return now;
    if (sv && typeof sv === "object" && typeof (sv as { increment?: unknown }).increment === "number") {
      const delta = (sv as { increment: number }).increment;
      return typeof existing === "number" ? existing + delta : delta;
    }
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) out[key] = resolveRaw(child, getChild(existing, key), now);
  return out;
}
