import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRAISE_RESOURCES } from "./manifest";
import { createFirstMeetingGuide, NANUM_MARBLE_ROUNDS, NANUM_MARBLE_RULES } from "./templates";

// 공개 자료 교체 시 본문·이미지·메타데이터를 다시 검토한 뒤 이 해시를 갱신한다.
const REVIEWED_SHA256: Record<string, string> = {
  "nanum-marble-kit.pptx": "fe367e399033a520b67b5b515389724a5ea379bb487692753e8aad6d95886def",
  "nanum-marble-guide.txt": "eda41b6085654bf5f0ff7ae892b654e3b6fe32de8df6d782e74c29fa8ea2da97",
  "nanum-marble-round-1.png": "b35df5c143b55c15fe914c24798b9964c27a1e825857ace88daee130c71eb4ac",
  "nanum-marble-round-2.png": "b80d797ab94ef06682c49b5d0db045517b350c869d86a41e9e19287f0af3be96",
  "nanum-marble-round-3.png": "dffcb5ef625d2ff1b5b42aebb895eb23bad281b78df3ec235df74b6eabc0842d",
};

describe("첫 모임 기본 콘텐츠", () => {
  it("회차별 초안이 역할·순서·준비물 배열을 공유하지 않는다", () => {
    const first = createFirstMeetingGuide();
    const second = createFirstMeetingGuide();
    first.preparation.push("합성 준비물");
    first.roles[0].responsibilities[0] = "합성 역할";
    first.steps[0].instructions[0] = "합성 순서";
    expect(JSON.stringify(second)).not.toContain("합성");
  });

  it("날짜·명단·담당자 연락처 없이 장소를 회차에서 설정한다", () => {
    const guide = createFirstMeetingGuide();
    expect(guide.location).toBe("");
    expect(guide.interviewLocation).toBe("");
    expect(guide).not.toHaveProperty("students");
    expect(guide).not.toHaveProperty("interviewOrder");
    expect(JSON.stringify(guide)).not.toMatch(/2026|8월\s*29일|01[016789][- .]?\d{3,4}[- .]?\d{4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  });

  it("기본 세 순서의 합이 전체 60분과 같고 편집 식별자가 유일하다", () => {
    const guide = createFirstMeetingGuide();
    expect(guide.steps.reduce((sum, step) => sum + step.durationMinutes, 0)).toBe(guide.durationMinutes);
    expect(new Set(guide.steps.map((step) => step.id)).size).toBe(guide.steps.length);
    expect(new Set(guide.roles.map((role) => role.id)).size).toBe(guide.roles.length);
  });

  it("인쇄 자료와 같은 공동 말 한 개·패스 한 번 규칙을 쓴다", () => {
    const rules = NANUM_MARBLE_RULES.join(" ");
    expect(rules).toContain("함께 움직이는 말 1개");
    expect(rules).toContain("한 번 패스");
    expect(rules).not.toMatch(/말\s*8개|뒤로\s*한\s*칸|뒤로\s*1칸/);
    const text = readFileSync(resolve(process.cwd(), "public/praise-resources/nanum-marble-guide.txt"), "utf8");
    expect(text).toContain("주사위 1개, 말 1개");
    expect(text).toContain("한 번 패스");
  });

  it("각 라운드는 새로운 질문과 네 선택지를 제공한다", () => {
    expect(NANUM_MARBLE_ROUNDS).toHaveLength(3);
    expect(new Set(NANUM_MARBLE_ROUNDS.map((round) => round.question)).size).toBe(3);
    NANUM_MARBLE_ROUNDS.forEach((round) => expect(round.choices).toHaveLength(4));
  });
});

describe("검토된 공개 자료의 배포 경계", () => {
  it("명시된 다섯 파일만 공개하고 다운로드 목록과 실제 파일이 일치한다", () => {
    const files = readdirSync(resolve(process.cwd(), "public/praise-resources")).sort();
    expect(files).toEqual(Object.keys(REVIEWED_SHA256).sort());
    expect(PRAISE_RESOURCES.map((resource) => resource.href.split("/").at(-1)).sort()).toEqual(files);
    expect(new Set(PRAISE_RESOURCES.map((resource) => resource.id)).size).toBe(PRAISE_RESOURCES.length);
  });

  for (const resource of PRAISE_RESOURCES) {
    it(`${resource.id}가 검토한 자산이며 외부 URL을 사용하지 않는다`, () => {
      expect(resource.href).toMatch(/^\/praise-resources\/[a-z0-9-]+\.(pptx|txt|png)$/);
      const fileName = resource.href.split("/").at(-1)!;
      const bytes = readFileSync(resolve(process.cwd(), "public", resource.href.slice(1)));
      expect(bytes.length).toBe(resource.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(REVIEWED_SHA256[fileName]);
    });
  }
});
