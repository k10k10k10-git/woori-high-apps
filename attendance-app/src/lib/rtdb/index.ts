// `firebase/database` 자리에 쓰는 Supabase 기반 RTDB 모듈. 이름·인자·반환 모양을 Firebase 모듈과 같게 둔다.
// 동작 계약: docs/SUPABASE_PLATFORM_CONTRACT.md 2장. 서버 함수: api.rtdb_* (계약 1장).
import { getDatabase, repoOf, type Database } from "./database";
import { joinPath, normalizePath, validatePathString, validateWritablePath } from "./path";
import { nextPushId } from "./pushId";
import { endBound, startBound, type BoundValue, type QueryParams } from "./queryParams";
import { asQuery, asReference, childReference, QueryImpl, ReferenceImpl, type DatabaseReference, type Query, type ThenableReference } from "./reference";
import { TransactionResult, type ListenerCallback, type ListenerType, type Repo } from "./repo";
import { DataSnapshot } from "./snapshot";
import { validateData, validateUpdateValues } from "./values";

export { getDatabase, DataSnapshot, TransactionResult };
export type { Database, DatabaseReference, Query, ThenableReference };
export type { IteratedDataSnapshot } from "./snapshot";
// 출석부 복사본에만 있는 부분: 연결 끊김 예약(페이지가 닫힐 때 보내는 최선 노력). onDisconnect.ts 참고.
export { onDisconnect } from "./onDisconnect";
export type { OnDisconnect } from "./onDisconnect";

export type Unsubscribe = () => void;
export type EventType = "value" | "child_added" | "child_changed" | "child_moved" | "child_removed";
export interface ListenOptions {
  readonly onlyOnce?: boolean;
}
export interface TransactionOptions {
  readonly applyLocally?: boolean;
}

const repoFor = (target: QueryImpl): Repo => target._repo as Repo;

// ── 참조 ─────────────────────────────────────────────────

export function ref(db: Database, path?: string): DatabaseReference {
  const repo = repoOf(db);
  if (path === undefined) return new ReferenceImpl(repo, "");
  validatePathString("ref", path, true);
  return new ReferenceImpl(repo, normalizePath(path));
}

export function child(parent: DatabaseReference, path: string): DatabaseReference {
  return childReference(parent, path);
}

// ── 쓰기 ─────────────────────────────────────────────────

export function set(reference: DatabaseReference, value: unknown): Promise<void> {
  const target = asReference("set", reference);
  validateWritablePath("set", target._path);
  validateData("set", value);
  if (target._path === "") throw new Error("set failed: overwriting the database root is not supported. Use update() with paths.");
  return repoFor(target).write([[target._path, value]]);
}

export function update(reference: DatabaseReference, values: object): Promise<void> {
  const target = asReference("update", reference);
  validateWritablePath("update", target._path);
  const entries = validateUpdateValues("update", values).map(([path, value]) => [joinPath(target._path, path), value] as [string, unknown]);
  for (const [path] of entries) validateWritablePath("update", path);
  return repoFor(target).write(entries);
}

export function remove(reference: DatabaseReference): Promise<void> {
  return set(reference, null);
}

export function push(parent: DatabaseReference, value?: unknown): ThenableReference {
  const base = asReference("push", parent);
  validateWritablePath("push", base._path);
  validateData("push", value, [], true);
  const repo = repoFor(base);
  const path = joinPath(base._path, nextPushId(repo.now()));
  const pushed = new ReferenceImpl(repo, path);
  const promise: Promise<DatabaseReference> = value !== undefined && value !== null
    ? set(pushed, value).then(() => pushed)
    : Promise.resolve(pushed);
  const thenable = new ReferenceImpl(repo, path) as ReferenceImpl & {
    then: Promise<DatabaseReference>["then"];
    catch: Promise<DatabaseReference>["catch"];
  };
  thenable.then = promise.then.bind(promise) as Promise<DatabaseReference>["then"];
  thenable.catch = promise.catch.bind(promise) as Promise<DatabaseReference>["catch"];
  return thenable as unknown as ThenableReference;
}

export function runTransaction(
  reference: DatabaseReference,
  // Firebase 와 같은 서명(currentData: any) — 호출부가 자기 타입으로 받을 수 있게 한다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactionUpdate: (currentData: any) => unknown,
  options?: TransactionOptions,
): Promise<TransactionResult> {
  const target = asReference("runTransaction", reference);
  validateWritablePath("runTransaction", target._path);
  if (typeof transactionUpdate !== "function") throw new Error("runTransaction failed: transactionUpdate must be a function.");
  return repoFor(target).runTransaction(target._path, transactionUpdate, options?.applyLocally !== false);
}

/** 서버가 저장 시각(ms)으로 바꾸는 표식. 화면에는 바로 지금 시각으로 보인다. */
export function serverTimestamp(): object {
  return { ".sv": "timestamp" };
}

export function increment(delta: number): object {
  return { ".sv": { increment: delta } };
}

// ── 읽기 ─────────────────────────────────────────────────

export function get(query: Query): Promise<DataSnapshot> {
  const target = asQuery("get", query);
  return repoFor(target).get(target);
}

function listen(
  fnName: string,
  query: Query,
  type: ListenerType,
  callback: ListenerCallback,
  cancelOrOptions?: ((error: Error) => unknown) | ListenOptions,
  options?: ListenOptions,
): Unsubscribe {
  const target = asQuery(fnName, query);
  if (typeof callback !== "function") throw new Error(`${fnName} failed: callback must be a function.`);
  const cancel = typeof cancelOrOptions === "function" ? cancelOrOptions : undefined;
  const onlyOnce = Boolean((typeof cancelOrOptions === "object" && cancelOrOptions?.onlyOnce) || options?.onlyOnce);
  return repoFor(target).addListener(target, type, callback, cancel, onlyOnce);
}

export function onValue(
  query: Query,
  callback: (snapshot: DataSnapshot) => unknown,
  cancelCallbackOrListenOptions?: ((error: Error) => unknown) | ListenOptions,
  options?: ListenOptions,
): Unsubscribe {
  return listen("onValue", query, "value", callback as ListenerCallback, cancelCallbackOrListenOptions, options);
}

export function onChildAdded(
  query: Query,
  callback: (snapshot: DataSnapshot, previousChildName?: string | null) => unknown,
  cancelCallbackOrListenOptions?: ((error: Error) => unknown) | ListenOptions,
  options?: ListenOptions,
): Unsubscribe {
  return listen("onChildAdded", query, "child_added", callback, cancelCallbackOrListenOptions, options);
}

export function onChildChanged(
  query: Query,
  callback: (snapshot: DataSnapshot, previousChildName?: string | null) => unknown,
  cancelCallbackOrListenOptions?: ((error: Error) => unknown) | ListenOptions,
  options?: ListenOptions,
): Unsubscribe {
  return listen("onChildChanged", query, "child_changed", callback, cancelCallbackOrListenOptions, options);
}

export function onChildRemoved(
  query: Query,
  callback: (snapshot: DataSnapshot) => unknown,
  cancelCallbackOrListenOptions?: ((error: Error) => unknown) | ListenOptions,
  options?: ListenOptions,
): Unsubscribe {
  return listen("onChildRemoved", query, "child_removed", callback as ListenerCallback, cancelCallbackOrListenOptions, options);
}

// ── Query 조건 ───────────────────────────────────────────

export type QueryConstraintType =
  | "endAt" | "endBefore" | "startAt" | "startAfter" | "limitToFirst" | "limitToLast"
  | "orderByChild" | "orderByKey" | "orderByPriority" | "orderByValue" | "equalTo";

export abstract class QueryConstraint {
  abstract readonly type: QueryConstraintType;
  /** @internal */
  abstract _apply(params: QueryParams): QueryParams;
}

class Constraint extends QueryConstraint {
  constructor(readonly type: QueryConstraintType, private readonly applyFn: (params: QueryParams) => QueryParams) {
    super();
  }

  _apply(params: QueryParams): QueryParams {
    return this.applyFn(params);
  }
}

function orderBy(name: QueryConstraintType, index: QueryParams["index"]): QueryConstraint {
  return new Constraint(name, (params) => {
    if (params.orderBySet) throw new Error(`Query.${name}: You can't combine multiple orderBy calls.`);
    return { ...params, index, orderBySet: true };
  });
}

function setStart(name: QueryConstraintType, value: BoundValue, key: string | undefined, inclusive: boolean) {
  return (params: QueryParams): QueryParams => {
    if (params.start) throw new Error(`Query.${name}: Starting point was already set (by another call to startAt, startAfter, or equalTo).`);
    return { ...params, start: startBound(value, key, inclusive) };
  };
}

function setEnd(name: QueryConstraintType, value: BoundValue, key: string | undefined, inclusive: boolean) {
  return (params: QueryParams): QueryParams => {
    if (params.end) throw new Error(`Query.${name}: Ending point was already set (by another call to endAt, endBefore, or equalTo).`);
    return { ...params, end: endBound(value, key, inclusive) };
  };
}

function setLimit(name: QueryConstraintType, count: number, from: "first" | "last"): QueryConstraint {
  if (typeof count !== "number" || Math.floor(count) !== count || count <= 0) {
    throw new Error(`${name}: First argument must be a positive integer.`);
  }
  return new Constraint(name, (params) => {
    if (params.limit) throw new Error(`Query.${name}: Limit was already set (by another call to limitToFirst or limitToLast).`);
    return { ...params, limit: { count, from } };
  });
}

export function orderByChild(path: string): QueryConstraint {
  if (path === "$key") throw new Error('orderByChild: "$key" is invalid. Use orderByKey() instead.');
  if (path === "$priority") throw new Error('orderByChild: "$priority" is invalid. Use orderByPriority() instead.');
  if (path === "$value") throw new Error('orderByChild: "$value" is invalid. Use orderByValue() instead.');
  validatePathString("orderByChild", path, false);
  return orderBy("orderByChild", { type: "child", path: normalizePath(path) });
}

export function orderByKey(): QueryConstraint {
  return orderBy("orderByKey", { type: "key" });
}

export function orderByValue(): QueryConstraint {
  return orderBy("orderByValue", { type: "value" });
}

export function orderByPriority(): QueryConstraint {
  return orderBy("orderByPriority", { type: "priority" });
}

export function startAt(value: BoundValue = null, key?: string): QueryConstraint {
  return new Constraint("startAt", setStart("startAt", value, key, true));
}

export function startAfter(value: BoundValue = null, key?: string): QueryConstraint {
  return new Constraint("startAfter", setStart("startAfter", value, key, false));
}

export function endAt(value: BoundValue = null, key?: string): QueryConstraint {
  return new Constraint("endAt", setEnd("endAt", value, key, true));
}

export function endBefore(value: BoundValue = null, key?: string): QueryConstraint {
  return new Constraint("endBefore", setEnd("endBefore", value, key, false));
}

export function equalTo(value: BoundValue, key?: string): QueryConstraint {
  return new Constraint("equalTo", (params) => setEnd("equalTo", value, key, true)(setStart("equalTo", value, key, true)(params)));
}

export function limitToFirst(limit: number): QueryConstraint {
  return setLimit("limitToFirst", limit, "first");
}

export function limitToLast(limit: number): QueryConstraint {
  return setLimit("limitToLast", limit, "last");
}

export function query(base: Query, ...constraints: QueryConstraint[]): Query {
  const target = asQuery("query", base);
  let params = target._params;
  for (const constraint of constraints) {
    if (!(constraint instanceof QueryConstraint)) throw new Error("query failed: constraint is not a QueryConstraint from @/lib/rtdb.");
    params = constraint._apply(params);
  }
  return new QueryImpl(target._repo, target._path, params);
}
