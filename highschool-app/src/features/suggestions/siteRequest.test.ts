import { describe, expect, it } from "vitest";
import { canSendSiteRequest, normalizeSiteRequestsRoot, siteRequestAttachmentUrl, unnotifiedResolvedRequests } from "./siteRequest";

describe("사이트 요청함 모델", () => {
  it("짧더라도 제목과 본문이 있으면 전송할 수 있다", () => {
    expect(canSendSiteRequest({ title: "오류", description: "멈춤" })).toBe(true);
    expect(canSendSiteRequest({ title: " ", description: "내용" })).toBe(false);
    expect(canSendSiteRequest({ title: "제목", description: "\n" })).toBe(false);
  });

  it("접근 승인 필드와 잘못된 레코드를 무시하고 사용자별 요청만 최신순으로 추출한다", () => {
    const requests = normalizeSiteRequestsRoot({
      userA: {
        email: "member@example.com",
        requestedAt: 100,
        siteRequests: {
          older: { title: "오래된 요청", description: "설명", createdAt: 200, status: "received" },
          broken: { title: "설명 없음", createdAt: 300 },
        },
      },
      userB: {
        siteRequests: {
          newer: { title: "새 요청", description: "설명", createdAt: 400, status: "resolved", resolvedAt: 500 },
        },
      },
    });

    expect(requests.map((request) => [request.ownerUid, request.id, request.status])).toEqual([
      ["userB", "newer", "resolved"],
      ["userA", "older", "received"],
    ]);
  });

  it("해결됐지만 아직 알림을 확인하지 않은 요청만 고른다", () => {
    const requests = normalizeSiteRequestsRoot({
      me: {
        siteRequests: {
          pending: { title: "대기", description: "설명", createdAt: 100 },
          unread: { title: "해결", description: "설명", createdAt: 200, status: "resolved", resolvedAt: 300 },
          read: { title: "확인", description: "설명", createdAt: 400, status: "resolved", resolvedAt: 500, notifiedAt: 600 },
        },
      },
    });

    expect(unnotifiedResolvedRequests(requests).map((request) => request.id)).toEqual(["unread"]);
  });

  it("새 첨부는 Storage 메타데이터만 읽고 레거시 data URL도 계속 표시한다", () => {
    const requests = normalizeSiteRequestsRoot({
      userA: {
        siteRequests: {
          stored: {
            title: "새 첨부",
            description: "설명",
            createdAt: 200,
            attachment: {
              name: "new.jpg",
              type: "image/jpeg",
              size: 100,
              filePath: "site-requests/userA/stored/attachment.jpg",
              fileUrl: "https://firebasestorage.googleapis.com/v0/b/woori-high/o/new.jpg",
            },
          },
          legacy: {
            title: "옛 첨부",
            description: "설명",
            createdAt: 100,
            attachment: {
              name: "old.jpg",
              type: "image/jpeg",
              size: 80,
              dataUrl: "data:image/jpeg;base64,AAAA",
            },
          },
        },
      },
    });

    expect(requests[0].attachment).not.toHaveProperty("dataUrl");
    expect(siteRequestAttachmentUrl(requests[0].attachment!)).toContain("firebasestorage.googleapis.com");
    expect(siteRequestAttachmentUrl(requests[1].attachment!)).toBe("data:image/jpeg;base64,AAAA");
  });

  it("요청 소유자 경로가 아닌 외부 첨부 주소는 무시한다", () => {
    const [request] = normalizeSiteRequestsRoot({
      userA: {
        siteRequests: {
          requestA: {
            title: "잘못된 첨부",
            description: "설명",
            createdAt: 100,
            attachment: {
              name: "bad.jpg",
              type: "image/jpeg",
              size: 10,
              filePath: "site-requests/other/requestA/attachment.jpg",
              fileUrl: "https://example.com/bad.jpg",
            },
          },
        },
      },
    });

    expect(request.attachment).toBeUndefined();
  });
});
