import { describe, expect, it } from "vitest";
import type { DataSnapshot } from "firebase/database";
import { snapToList } from "./snapToList";

/** 실제 DataSnapshot 대신 exists()/val()만 흉내 내는 최소 스텁. */
const snap = (value: unknown, exists = value != null): DataSnapshot =>
  ({ exists: () => exists, val: () => value }) as unknown as DataSnapshot;

describe("snapToList", () => {
  it("객체 노드를 id가 붙은 배열로 바꾼다", () => {
    expect(snapToList(snap({ a: { name: "김" }, b: { name: "이" } }))).toEqual([
      { id: "a", name: "김" },
      { id: "b", name: "이" },
    ]);
  });

  it("노드가 없으면 빈 배열", () => {
    expect(snapToList(snap(null, false))).toEqual([]);
  });

  // ── 아래 3개가 이 함수가 공용으로 승격된 이유다 (2026-09-02).
  //    옛 공용 구현에는 이 가드가 없어, 문자열·배열 노드를 넘기면 예외 없이
  //    쓰레기 행을 만들어 화면에 그대로 흘렸다.
  it("문자열 노드를 문자 인덱스 행으로 펼치지 않는다", () => {
    expect(snapToList(snap("여름수련회"))).toEqual([]);
  });

  it("배열 노드를 그대로 통과시키지 않는다", () => {
    expect(snapToList(snap([{ name: "김" }]))).toEqual([]);
  });

  it("자식이 primitive인 항목은 건너뛰고 객체 항목만 남긴다", () => {
    expect(snapToList(snap({ a: { name: "김" }, b: true, c: "x", d: null, e: [1] }))).toEqual([
      { id: "a", name: "김" },
    ]);
  });
});
