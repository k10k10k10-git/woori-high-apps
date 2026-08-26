import { describe, expect, it } from "vitest";
import { buildClassInfos, stripRosterSuffix } from "./classRosterModel";

describe("class roster model", () => {
  it("sorts classes and student names while preserving roster metadata", () => {
    const result = buildClassInfos({
      "2-2-3": { teacher: "교사B", students: { b: { name: "하늘", num: 2 } } },
      "1-1-2": {
        teacher: "교사A",
        students: {
          z: { name: "지민", num: 2 },
          a: { name: "가람", num: 1, phone: "010", jang: true },
        },
      },
    });

    expect(result.map(item => `${item.buNum}-${item.grade}-${item.classNum}`)).toEqual(["1-1-2", "2-2-3"]);
    expect(result[0].students.map(student => student.name)).toEqual(["가람", "지민"]);
    expect(result[0].students[0]).toMatchObject({ id: "a", phone: "010", jang: true });
  });

  it("normalizes roster-only alphabetic suffixes", () => {
    expect(stripRosterSuffix("김예원B")).toBe("김예원");
  });
});
