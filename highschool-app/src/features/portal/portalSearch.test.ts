import { describe, expect, it } from "vitest";
import { buildPortalSearchItems, filterPortalSearchItems } from "./portalSearchCatalog";

const semesters = [{ id: "2026-2", meta: { title: "2026년 2학기", completionRule: { minRate: 0.7 }, createdAt: "2026-08-01" } }];
const retreats = [{ id: "summer", name: "여름수련회", year: 2026, sheetId: "", sheetGid: "", createdAt: 1, groupCount: 21 }];

describe("portal search", () => {
  it("현장 스탭에게 행정 검색 항목을 노출하지 않는다", () => {
    const items = buildPortalSearchItems({ roles: { semester: "staff", retreat: "fieldStaff" }, semesters, retreats });
    expect(items.some((item) => item.id === "retreat-home")).toBe(false);
    expect(items.some((item) => item.id === "field-home")).toBe(true);
    expect(items.some((item) => item.id === "semester-home")).toBe(true);
    expect(items.some((item) => item.id === "sunday-ministry")).toBe(false);
  });

  it("이가드팀에게 학기 항목은 감추고 행정은 조회용으로 남긴다", () => {
    const items = buildPortalSearchItems({ roles: { semester: "none", retreat: "iguardTeam" }, semesters, retreats });
    expect(items.some((item) => item.area === "semester")).toBe(false);
    expect(items.some((item) => item.area === "retreat")).toBe(true);
    expect(items.some((item) => item.area === "field")).toBe(true);
  });

  it("탭 이름을 키워드로 검색한다", () => {
    const items = buildPortalSearchItems({ roles: { semester: "superAdmin", retreat: "superAdmin" }, semesters, retreats });
    expect(filterPortalSearchItems(items, "조편성").map((item) => item.id)).toContain("retreat-home");
    expect(filterPortalSearchItems(items, "커리큘럼").map((item) => item.id)).toContain("semester-home");
    expect(filterPortalSearchItems(items, "처리 대기").map((item) => item.id)).toContain("sunday-ministry");
    expect(filterPortalSearchItems(items, "목양").map((item) => item.id)).toContain("ministry-guide");
    expect(filterPortalSearchItems(items, "진행안").map((item) => item.id)).toContain("program-home");
  });
});

it("찬양팀 검색은 자기 팀으로 이동하고 다른 팀의 업무를 검색어로 노출하지 않는다", () => {
  const items = buildPortalSearchItems({ roles: { semester: "praise", retreat: "none" }, semesters, retreats });
  const sunday = items.find((item) => item.id === "sunday-ministry");
  expect(sunday).toMatchObject({ label: "팀·주일 운영", href: "/sunday-ministry/praise" });
  expect(sunday?.keywords).toContain("등단");
  expect(sunday?.keywords).not.toContain("새친구");
});
