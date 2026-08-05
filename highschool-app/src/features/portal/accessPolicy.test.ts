import { describe, expect, it } from "vitest";
import { canAccessPortalArea, retreatEntryHref, type PortalAccess } from "./accessPolicy";

const cases: Array<{
  name: string;
  access: PortalAccess;
  expected: Record<"home" | "semester" | "retreat-admin" | "retreat-field", boolean>;
}> = [
  {
    name: "미승인 사용자",
    access: { accessLevel: "none", iguardAccessLevel: "none" },
    expected: { home: false, semester: false, "retreat-admin": false, "retreat-field": false },
  },
  {
    name: "이가드 전용 스탭",
    access: { accessLevel: "none", iguardAccessLevel: "staff" },
    expected: { home: true, semester: false, "retreat-admin": false, "retreat-field": true },
  },
  {
    name: "이가드팀",
    access: { accessLevel: "none", iguardAccessLevel: "team" },
    expected: { home: true, semester: false, "retreat-admin": false, "retreat-field": true },
  },
  {
    name: "행정팀",
    access: { accessLevel: "member", iguardAccessLevel: "team" },
    expected: { home: true, semester: true, "retreat-admin": true, "retreat-field": true },
  },
  {
    name: "전체 관리자",
    access: { accessLevel: "admin", iguardAccessLevel: "admin" },
    expected: { home: true, semester: true, "retreat-admin": true, "retreat-field": true },
  },
];

describe("canAccessPortalArea", () => {
  for (const item of cases) {
    it(`${item.name}의 영역을 분리해 판정한다`, () => {
      for (const [area, allowed] of Object.entries(item.expected)) {
        expect(canAccessPortalArea(area as keyof typeof item.expected, item.access)).toBe(allowed);
      }
    });
  }
});

describe("retreatEntryHref", () => {
  it("행정 권한이 있으면 행정 화면으로 연결한다", () => {
    expect(retreatEntryHref("summer 2026", { accessLevel: "member", iguardAccessLevel: "team" }))
      .toBe("/retreat/summer%202026");
  });

  it("이가드 전용 계정은 현장 화면으로 연결한다", () => {
    expect(retreatEntryHref("summer 2026", { accessLevel: "none", iguardAccessLevel: "staff" }))
      .toBe("/retreat/summer%202026/field");
  });
});
