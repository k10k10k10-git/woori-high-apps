// Query·DatabaseReference 객체. Firebase 처럼 경로와 query 조건만 들고, 실제 일은 저장소(repo)가 한다.
import { joinPath, lastKey, parentPath, pathSegments, validatePathString } from "./path";
import { DEFAULT_PARAMS, queryIdentifier, type QueryParams } from "./queryParams";

/** 참조가 속한 저장소. 순환 import 를 피하려고 필요한 것만 적는다. */
export interface RepoHandle {
  readonly url: string;
}

export interface Query {
  readonly ref: DatabaseReference;
  isEqual(other: Query | null): boolean;
  toJSON(): string;
  toString(): string;
}

export interface DatabaseReference extends Query {
  readonly key: string | null;
  readonly parent: DatabaseReference | null;
  readonly root: DatabaseReference;
}

export interface ThenableReference extends DatabaseReference, Pick<Promise<DatabaseReference>, "then" | "catch"> {
  readonly key: string;
  readonly parent: DatabaseReference;
}

export class QueryImpl implements Query {
  constructor(
    readonly _repo: RepoHandle,
    readonly _path: string,
    readonly _params: QueryParams = DEFAULT_PARAMS,
  ) {}

  get ref(): DatabaseReference {
    return new ReferenceImpl(this._repo, this._path);
  }

  get _queryIdentifier(): string {
    return queryIdentifier(this._params);
  }

  isEqual(other: Query | null): boolean {
    if (!(other instanceof QueryImpl)) return false;
    return other._repo === this._repo && other._path === this._path && other._queryIdentifier === this._queryIdentifier;
  }

  toJSON(): string {
    return this.toString();
  }

  toString(): string {
    const encoded = pathSegments(this._path).map(encodeURIComponent).join("/");
    return `${this._repo.url}/${encoded}`;
  }
}

export class ReferenceImpl extends QueryImpl implements DatabaseReference {
  constructor(repo: RepoHandle, path: string) {
    super(repo, path, DEFAULT_PARAMS);
  }

  get key(): string | null {
    return lastKey(this._path);
  }

  get parent(): DatabaseReference | null {
    const parent = parentPath(this._path);
    return parent === null ? null : new ReferenceImpl(this._repo, parent);
  }

  get root(): DatabaseReference {
    return new ReferenceImpl(this._repo, "");
  }

  override get ref(): DatabaseReference {
    return this;
  }
}

export function asQuery(fnName: string, query: Query): QueryImpl {
  if (!(query instanceof QueryImpl)) throw new Error(`${fnName} failed: argument is not a database Query from @/lib/rtdb.`);
  return query;
}

export function asReference(fnName: string, reference: DatabaseReference): ReferenceImpl {
  if (!(reference instanceof ReferenceImpl)) throw new Error(`${fnName} failed: argument is not a DatabaseReference from @/lib/rtdb.`);
  return reference;
}

export function childReference(parent: DatabaseReference, path: string): ReferenceImpl {
  const base = asReference("child", parent);
  validatePathString("child", path, base._path === "");
  return new ReferenceImpl(base._repo, joinPath(base._path, path));
}
