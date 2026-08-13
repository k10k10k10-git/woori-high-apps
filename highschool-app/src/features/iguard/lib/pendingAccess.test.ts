import { describe, expect, it } from "vitest";
import { normalizeIguardPendingRequests } from "./pendingAccess";

describe("이가드 접근 승인 대기 정규화", () => {
  it("사이트 요청만 가진 사용자는 팀원 승인 대기에 섞지 않는다", () => {
    expect(normalizeIguardPendingRequests({
      suggestionOnly: { siteRequests: { req1: { title: "요청" } } },
      accessAndSuggestion: {
        email: "member@example.com",
        name: "김교사",
        requestedAt: 200,
        siteRequests: { req2: { title: "요청" } },
      },
    })).toEqual([{ uid: "accessAndSuggestion", email: "member@example.com", name: "김교사", requestedAt: 200 }]);
  });
});
