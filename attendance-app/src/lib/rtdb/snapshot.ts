// Firebase DataSnapshot 과 같은 읽기 도구. 값은 불변 트리를 가리키고 val() 은 매번 새 객체를 만든다.
import { nodeToValue } from "./ordering";
import { normalizePath, validatePathString } from "./path";
import { orderedKeys, type IndexSpec } from "./queryParams";
import { childReference, type DatabaseReference } from "./reference";
import { countChildren, getChild, isBranch, type Node } from "./tree";

const PRIORITY_INDEX: IndexSpec = { type: "priority" };

export class DataSnapshot {
  /** @internal */
  readonly _node: Node;
  /** @internal */
  readonly _index: IndexSpec;

  constructor(node: Node, readonly ref: DatabaseReference, index: IndexSpec = PRIORITY_INDEX) {
    this._node = node;
    this._index = index;
  }

  get key(): string | null {
    return this.ref.key;
  }

  /** 이 저장소는 우선순위(priority)를 쓰지 않는다. */
  get priority(): string | number | null {
    return null;
  }

  get size(): number {
    return countChildren(this._node);
  }

  child(path: string): DataSnapshot {
    validatePathString("DataSnapshot.child", path, false);
    const childPath = normalizePath(path);
    return new DataSnapshot(getChild(this._node, childPath), childReference(this.ref, childPath));
  }

  exists(): boolean {
    return this._node !== null;
  }

  exportVal(): unknown {
    return nodeToValue(this._node, true);
  }

  /** 자식을 query 순서(기본은 키 순서)로 돈다. 콜백이 true 를 돌려주면 멈추고 true 를 돌려준다. */
  forEach(action: (child: IteratedDataSnapshot) => boolean | void): boolean {
    const node = this._node;
    if (!isBranch(node)) return false;
    for (const key of orderedKeys(node, this._index)) {
      const child = new DataSnapshot(node[key], childReference(this.ref, key)) as IteratedDataSnapshot;
      if (action(child) === true) return true;
    }
    return false;
  }

  hasChild(path: string): boolean {
    validatePathString("DataSnapshot.hasChild", path, false);
    return getChild(this._node, normalizePath(path)) !== null;
  }

  hasChildren(): boolean {
    return isBranch(this._node);
  }

  numChildren(): number {
    return countChildren(this._node);
  }

  toJSON(): object | null {
    return this.exportVal() as object | null;
  }

  // Firebase 의 val() 반환형(any)을 그대로 따른다 — 앱 코드가 import 경로만 바꿔도 컴파일되도록.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  val(): any {
    return nodeToValue(this._node, false);
  }
}

export interface IteratedDataSnapshot extends DataSnapshot {
  readonly key: string;
}
