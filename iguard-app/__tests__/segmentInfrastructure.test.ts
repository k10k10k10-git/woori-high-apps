import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { paths } from "@/lib/paths";

describe("동선 구간 인프라 계약", () => {
  it("segments 경로는 이가드 소유 노드 아래에만 생성한다", () => {
    expect(paths.iguardSegments("retreat-1")).toBe("retreats/retreat-1/iguard/segments");
    expect(paths.iguardSegment("retreat-1", "segment-1"))
      .toBe("retreats/retreat-1/iguard/segments/segment-1");
    expect(paths.iguardGbs("retreat-1")).toBe("retreats/retreat-1/iguard/gbs");
    expect(paths.iguardGbsGroup("retreat-1", "group-1"))
      .toBe("retreats/retreat-1/iguard/gbs/group-1");
  });

  it("segments 구독은 오류 콜백을 전달하고 CRUD는 단일 경로를 사용한다", () => {
    const source = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");

    expect(source).toContain("export function subscribeToIguardSegments(");
    expect(source).toContain('console.warn("subscribeToIguardSegments error:", error); onError?.(error);');
    expect(source).toContain("export async function saveIguardSegment(");
    expect(source).toContain("export async function updateIguardSegment(");
    expect(source).toContain("export async function deleteIguardSegment(");
  });

  it("중앙 데이터 훅이 segments를 로딩 완료·실패 상태에 함께 배선한다", () => {
    const source = readFileSync(new URL("../src/hooks/useRetreatData.ts", import.meta.url), "utf8");

    expect(source).toContain('"schedule", "segments", "posts"');
    expect(source).toContain('ready("segments")');
    expect(source).toContain('fail("segments")');
    expect(source).toContain("movementsForDefaultSegments(segments, movementRecords)");
  });

  it("신규 segments와 gbs 경로가 루트·앱 소유권 문서에 함께 기록된다", () => {
    const ownership = readFileSync(new URL("../../DB_OWNERSHIP.md", import.meta.url), "utf8");
    const appGuide = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");

    expect(ownership).toContain("`retreats/{id}/iguard/segments`");
    expect(ownership).toContain("`retreats/{id}/iguard/gbs`");
    expect(appGuide).toContain("segments/");
    expect(appGuide).toContain("gbs/");
  });
});
