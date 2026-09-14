import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/features/teams/TeamTermWorkspace", () => ({ default: () => null }));

import Page from "./page";

it("팀 또는 학기가 바뀌면 학기 작업공간을 새 인스턴스로 연다", async () => {
  const first = await Page({ params: Promise.resolve({ team: "media", semesterId: "2026-1", section: "overview" }) });
  const nextTerm = await Page({ params: Promise.resolve({ team: "media", semesterId: "2026-2", section: "overview" }) });
  const nextTeam = await Page({ params: Promise.resolve({ team: "praise", semesterId: "2026-1", section: "overview" }) });

  expect(first.key).toBe("media:2026-1");
  expect(nextTerm.key).toBe("media:2026-2");
  expect(nextTeam.key).toBe("praise:2026-1");
});
