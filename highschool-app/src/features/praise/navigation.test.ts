import { expect, it } from "vitest";
import { praiseFixture } from "./components/praiseTestFixtures";
import { praiseReturnHref, praiseSemesterHref } from "./navigation";
it("학기 배치와 찬양팀 왕복에서 workspace와 회차를 보존한다", () => {
  const view = praiseFixture(); view.meta.semesterId = "2026-2"; view.meta.teamId = "team-1";
  const href = praiseSemesterHref(view.meta, view.meetings[0])!;
  const query = new URL(href, "https://test.invalid").searchParams;
  expect(query.get("team")).toBe("team-1");
  expect(query.get("tab")).toBe("배치");
  expect(praiseReturnHref(query)).toBe("/sunday-ministry/praise?workspace=synthetic-workspace&tab=week&meeting=meeting-1");
});
it("외부 주소나 경로 구분자가 있는 복귀 대상으로 이동하지 않는다", () => {
  expect(praiseReturnHref(new URLSearchParams({ praiseWorkspace: "https://evil.example" }))).toBeNull();
  expect(praiseReturnHref(new URLSearchParams({ praiseWorkspace: "valid", praiseMeeting: "../../escape" }))).toBe("/sunday-ministry/praise?workspace=valid&tab=week");
  expect(praiseSemesterHref(praiseFixture().meta)).toBeNull();
});
