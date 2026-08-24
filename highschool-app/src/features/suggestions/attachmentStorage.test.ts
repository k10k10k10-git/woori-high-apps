import { describe, expect, it } from "vitest";
import { siteRequestAttachmentPath } from "./attachmentPath";

describe("사이트 요청 첨부 Storage 경로", () => {
  it("사용자와 요청 번호 아래의 결정적 JPEG 경로를 만든다", () => {
    expect(siteRequestAttachmentPath("user-a", "request-1"))
      .toBe("site-requests/user-a/request-1/attachment.jpg");
  });
});
