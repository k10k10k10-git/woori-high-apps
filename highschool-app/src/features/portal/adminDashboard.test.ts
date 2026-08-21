import { describe, expect, it } from "vitest";
import type { SiteRequest } from "@/features/suggestions/siteRequest";
import {
  buildAdminDashboardSummary,
  buildAdminWorkQueue,
  countUniqueTeamMembers,
  mergeAccessQueue,
  recentResolvedRequests,
} from "./adminDashboard";

function request(overrides: Partial<SiteRequest> = {}): SiteRequest {
  return {
    id: "request-1",
    ownerUid: "user-1",
    kind: "사이트 건의사항",
    category: "통합 홈",
    title: "테스트 요청",
    description: "테스트 설명",
    page: "",
    urgency: "보통",
    reproduction: "",
    expected: "",
    anonymous: false,
    reporterName: "김학생",
    roleLabel: "팀장",
    createdAt: 100,
    status: "received",
    ...overrides,
  };
}

describe("통합관리자 대시보드 읽기 모델", () => {
  it("같은 사용자의 두 권한 요청을 한 건으로 합친다", () => {
    const queue = mergeAccessQueue(
      { uid1: { email: "one@example.com", name: "한사람", requestedAt: 200 } },
      [{ uid: "uid1", email: "one@example.com", name: "한사람", requestedAt: 100 }],
    );

    expect(queue).toEqual([expect.objectContaining({
      uid: "uid1",
      requestedAt: 100,
      sources: ["학기·수련회", "이가드 현장"],
    })]);
  });

  it("여러 권한 경로에 속한 동일 팀원은 한 명으로 센다", () => {
    expect(countUniqueTeamMembers(
      { admin: true, disabled: false },
      { admin: {}, leader: {} },
      { leader: {}, staff: {} },
    )).toBe(3);
  });

  it("긴급 요청을 먼저, 같은 우선순위에서는 오래된 일을 먼저 보여준다", () => {
    const accessQueue = mergeAccessQueue(
      { uid2: { email: "two@example.com", name: "둘", requestedAt: 50 } },
      [],
    );
    const queue = buildAdminWorkQueue([
      request({ id: "normal", createdAt: 40 }),
      request({ id: "urgent", urgency: "높음", createdAt: 60 }),
    ], accessQueue);

    expect(queue.map((item) => item.id)).toEqual([
      "request:user-1:urgent",
      "request:user-1:normal",
      "access:uid2",
    ]);
  });

  it("오늘 해결한 요청과 전체 처리 대기를 정확히 요약한다", () => {
    const now = new Date(2026, 7, 21, 12);
    const summary = buildAdminDashboardSummary({
      requests: [
        request(),
        request({ id: "resolved", status: "resolved", resolvedAt: new Date(2026, 7, 21, 9).getTime() }),
      ],
      accessQueue: [{ uid: "uid2", email: "", name: "둘", requestedAt: 1, sources: ["이가드 현장"] }],
      teamMembers: 7,
      now,
    });

    expect(summary).toEqual({
      totalPending: 2,
      openRequests: 1,
      accessPending: 1,
      teamMembers: 7,
      resolvedToday: 1,
    });
  });

  it("최근 해결 요청은 해결 시각 역순으로 제한한다", () => {
    const recent = recentResolvedRequests([
      request({ id: "old", status: "resolved", resolvedAt: 100 }),
      request({ id: "new", status: "resolved", resolvedAt: 200 }),
      request({ id: "open" }),
    ], 1);

    expect(recent.map((item) => item.id)).toEqual(["new"]);
  });
});
