import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const ADMIN = "src/app/retreat/[id]/RetreatPageClient.tsx";
const FIELD = "src/app/retreat/[id]/field/IguardClient.tsx";
const PROGRAMS = "src/app/retreat/[id]/programs/ProgramWorkspaceHeader.tsx";

describe("수련회 영역 내비게이션 계약", () => {
  it("행정·이가드·프로그램 준비 세 화면이 같은 공용 컴포넌트를 쓴다", () => {
    for (const path of [ADMIN, FIELD, PROGRAMS]) {
      expect(source(path)).toContain("RetreatAreaNav");
    }
  });

  it("각 화면이 자기 영역을 현재로 표시한다", () => {
    expect(source(ADMIN)).toContain('current="admin"');
    expect(source(FIELD)).toContain('current="field"');
    expect(source(PROGRAMS)).toContain('current="programs"');
  });

  it("내비게이션이 제목 바로 뒤에 온다", () => {
    // 제목과 내비 사이에 다른 요소가 끼면 화면마다 위치가 달라 보인다.
    for (const path of [ADMIN, FIELD, PROGRAMS]) {
      const text = source(path);
      const heading = text.indexOf("{retreat.name}</h1>");
      const nav = text.indexOf("<RetreatAreaNav");
      expect(heading).toBeGreaterThan(-1);
      expect(nav).toBeGreaterThan(heading);
      // 사이에 남는 마크업은 줄바꿈·들여쓰기뿐이어야 한다.
      expect(text.slice(heading + "{retreat.name}</h1>".length, nav).trim()).toBe("");
    }
  });

  it("제목이 남는 폭을 다 먹지 않는다", () => {
    // flex:1이면 제목이 늘어나 내비가 오른쪽 끝으로 밀린다 — 세 화면의 위치가 어긋나는 원인.
    expect(source(FIELD)).not.toContain('className="min-w-0 flex-1 truncate text-sm font-bold text-white sm:text-base"');
    expect(source("src/app/program-preparation.css")).not.toContain(".program-workspace-title-row h1 { min-width: 0; overflow: hidden; flex: 1;");
  });

  it("화면별로 따로 만들었던 영역 이동 버튼이 남아 있지 않다", () => {
    expect(source(ADMIN)).not.toContain("이가드 현장 <ArrowRight");
    expect(source(PROGRAMS)).not.toContain("program-area-nav");
    expect(source("src/app/program-preparation.css")).not.toContain("program-area-nav");
  });

  it("세 영역을 탭처럼 오갈 때 목적지를 미리 준비한다", () => {
    const nav = source("src/features/portal/RetreatAreaNav.tsx");
    expect(nav).toContain("router.prefetch(adminHref)");
    expect(nav).toContain("router.prefetch(programsHref)");
    expect(nav).toContain("router.prefetch(fieldHref)");
    expect(nav).toContain("onPointerEnter={() => { if (allowed) router.prefetch(href); }}");
    expect(nav).toContain("onFocus={() => { if (allowed) router.prefetch(href); }}");
  });
});
