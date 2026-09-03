import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("CSS architecture", () => {
  it("keeps theme and interaction compatibility outside the global foundation", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('import "./theme-compat.css"');
    expect(layout).toContain('import "./interaction-controls.css"');
    expect(layout).toContain('import "./portal-surfaces.css"');
    expect(read("src/app/globals.css").split("\n").length).toBeLessThan(2_350);
  });

  // 리디자인마다 "20XX redesign" 섹션을 globals.css 아래에 덧붙이면, 같은 클래스가
  // 본문과 지층 두 곳에서 정의되어 어느 규칙이 이기는지 알 수 없게 된다.
  // 2026-09-03에 마지막 지층("2026 Preserve redesign")을 표면 파일로 접어 없앴다.
  it("globals.css에 리디자인 지층을 쌓지 않는다", () => {
    const css = read("src/app/globals.css");
    expect(css, "리디자인 규칙은 globals가 아니라 해당 표면 파일(portal-surfaces.css 등)에 둘 것")
      .not.toMatch(/redesign|리디자인 지층/i);
  });

  it("limits important overrides to compatibility boundaries", () => {
    const globalCount = read("src/app/globals.css").match(/!important/g)?.length ?? 0;
    const themeCount = read("src/app/theme-compat.css").match(/!important/g)?.length ?? 0;
    expect(globalCount).toBeLessThanOrEqual(20);
    expect(themeCount).toBeLessThanOrEqual(50);
  });
});

// ════════════════════════════════════════════════════════════
// 색 계약 (2026-09-02 신설)
//
// 이 저장소는 두 계보가 합쳐진 결과다 — 학생 출석부 계열의 "CSS 변수 디자인
// 시스템"과 수련회 계열의 Tailwind. 그래서 화면에서 색을 쓰는 방법이 두 가지가
// 되었고, Tailwind 임의값(bg-[#edf4ff])이 섞이면 다크 대응이 토큰 재정의로
// 따라오지 못해 theme-compat.css가 !important로 덮어야 했다.
//
// 규칙은 하나다: **화면(TSX)에서 색을 임의값 hex로 박지 않는다.**
//   · 팔레트 유틸리티(bg-amber-50 등)는 theme-compat.css가 다크로 리매핑한다 — 허용
//   · var(--token) 참조도 허용
//   · `[#rrggbb]` 형태만 금지. 색은 CSS 파일에서 토큰으로 정한다.
// ════════════════════════════════════════════════════════════

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(process.cwd(), rel)).isDirectory()) { out.push(...tsxFiles(rel)); continue; }
    if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) out.push(rel);
  }
  return out;
}

/** 색을 임의값으로 박는 Tailwind 유틸리티. 배경·글자·테두리·그라디언트·링·SVG. */
const ARBITRARY_COLOR = /\b(?:bg|text|border|from|via|to|ring|fill|stroke|decoration|outline|shadow|accent|caret|divide)-\[#[0-9a-fA-F]{3,8}\]/g;

describe("색 계약", () => {
  const files = tsxFiles("src");

  it("화면을 실제로 수집한다", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("화면(TSX)에 임의값 hex 색이 없다 — 색은 CSS 토큰으로 정한다", () => {
    const violations: string[] = [];
    for (const file of files) {
      const hits = readFileSync(join(process.cwd(), file), "utf8").match(ARBITRARY_COLOR);
      if (hits) violations.push(`${file}: ${[...new Set(hits)].join(", ")}`);
    }
    expect(
      violations,
      `\n화면에 임의값 색이 있다. globals.css에 --domain-*류 토큰을 정의하고\n` +
      `컴포넌트 클래스(portal-surfaces.css 등)에서 참조하도록 옮길 것.\n${violations.join("\n")}\n`,
    ).toEqual([]);
  });

  it("도메인 색 토큰은 라이트·다크 양쪽에 정의돼 있다", () => {
    const css = read("src/app/globals.css");
    const light = css.slice(0, css.indexOf('[data-theme="dark"]'));
    const dark = css.slice(css.indexOf('[data-theme="dark"]'));
    for (const token of [
      "--domain-semester-soft", "--domain-semester-ink",
      "--domain-sunday-soft", "--domain-sunday-ink",
      "--domain-retreat-soft", "--domain-retreat-ink",
      "--domain-field-soft", "--domain-field-ink",
      "--domain-vacation-soft", "--domain-vacation-ink",
      "--domain-area-surface",
    ]) {
      expect(light, `${token}이 라이트(:root)에 없다`).toContain(`${token}:`);
      expect(dark, `${token}이 다크에 없다 — 다크에서 라이트 값이 그대로 남는다`).toContain(`${token}:`);
    }
  });
});
