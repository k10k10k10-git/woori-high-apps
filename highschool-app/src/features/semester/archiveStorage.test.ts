import { describe, expect, it } from "vitest";
import { safeArchiveFileName } from "./archiveFile";

describe("safeArchiveFileName", () => {
  it("경로 문자를 제거하고 한글 파일명은 보존한다", () => {
    expect(safeArchiveFileName("2026 여름/자료 최종.pdf")).toBe("2026_여름_자료_최종.pdf");
  });
});
