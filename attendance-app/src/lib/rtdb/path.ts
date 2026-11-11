// RTDB 경로 도우미. 경로는 Firebase 처럼 "/" 로 이은 키이며 앞뒤 "/" 가 없고 루트는 "" 이다.

const INVALID_PATH = /[[\].#$\u0000-\u001f\u007f]/;
const INVALID_KEY = /[[\].#$/\u0000-\u001f\u007f]/;
const MAX_KEY_BYTES = 768;

export const INFO_ROOT = ".info";

/** "a//b/" 같은 입력을 "a/b" 로 맞춘다(Firebase `new Path()` 와 같다). */
export function normalizePath(input: string): string {
  return input.split("/").filter(Boolean).join("/");
}

export function pathSegments(path: string): string[] {
  return path === "" ? [] : path.split("/");
}

export function joinPath(base: string, relative: string): string {
  const rel = normalizePath(relative);
  if (!base) return rel;
  return rel ? `${base}/${rel}` : base;
}

export function parentPath(path: string): string | null {
  if (path === "") return null;
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

export function lastKey(path: string): string | null {
  if (path === "") return null;
  const index = path.lastIndexOf("/");
  return index < 0 ? path : path.slice(index + 1);
}

/** ancestor 가 path 의 조상이거나 같으면 참(세그먼트 단위). */
export function isAncestorOrSelf(ancestor: string, path: string): boolean {
  return ancestor === "" || path === ancestor || path.startsWith(`${ancestor}/`);
}

/** 조상·자손·같은 경로 중 하나면 겹친다. */
export function pathsOverlap(a: string, b: string): boolean {
  return isAncestorOrSelf(a, b) || isAncestorOrSelf(b, a);
}

/** ancestor 아래에서 본 path 의 상대 경로. */
export function relativePath(ancestor: string, path: string): string {
  if (ancestor === "") return path;
  return path === ancestor ? "" : path.slice(ancestor.length + 1);
}

export function isInfoPath(path: string): boolean {
  return path === INFO_ROOT || path.startsWith(`${INFO_ROOT}/`);
}

export function isValidKey(key: unknown): key is string {
  return typeof key === "string" && key.length > 0 && !INVALID_KEY.test(key)
    && new TextEncoder().encode(key).length <= MAX_KEY_BYTES;
}

/** Firebase `validateRootPathString` 처럼 `.info` 로 시작하는 경로만 점을 허용한다. */
export function validatePathString(fnName: string, path: string, allowInfo: boolean): void {
  if (typeof path !== "string") throw new Error(`${fnName} failed: path argument must be a string.`);
  const checked = allowInfo ? path.replace(/^\/*\.info(\/|$)/, "/") : path;
  if (INVALID_PATH.test(checked)) {
    throw new Error(`${fnName} failed: path argument was an invalid path = "${path}". `
      + `Paths must be non-empty strings and can't contain ".", "#", "$", "[", or "]"`);
  }
}

export function validateWritablePath(fnName: string, path: string): void {
  if (isInfoPath(path)) throw new Error(`${fnName} failed: writing to "${path}" is not allowed (.info is read-only).`);
}
