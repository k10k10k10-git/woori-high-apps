import { describe, expect, it } from "vitest";
import type { Group } from "@/lib/types";
import { moveGroupStudent } from "./GroupComponents";

const groups: Group[] = [
  { id: "g1", name: "1조", bu: "1부", teachers: [], leader: "", studentIds: ["s1", "s2"] },
  { id: "g2", name: "2조", bu: "1부", teachers: [], leader: "", studentIds: ["s3"] },
];

describe("수련회 학생 수동 이동", () => {
  it("드래그와 선택 이동이 같은 조 목록 변경을 사용하며 중복 배정을 만들지 않는다", () => {
    const moved = moveGroupStudent(groups, "s1", "g2");
    expect(moved[0].studentIds).toEqual(["s2"]);
    expect(moved[1].studentIds).toEqual(["s3", "s1"]);
    expect(moveGroupStudent(moved, "s1", "g2")[1].studentIds).toEqual(["s3", "s1"]);
    expect(moveGroupStudent(moved, "s1", null)[1].studentIds).toEqual(["s3"]);
    expect(groups[0].studentIds).toEqual(["s1", "s2"]);
  });

  it("존재하지 않는 조로는 옮기지 않는다", () => {
    expect(moveGroupStudent(groups, "s1", "missing")).toBe(groups);
  });
});
