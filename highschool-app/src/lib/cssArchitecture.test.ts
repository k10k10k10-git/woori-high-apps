import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("limits important overrides to compatibility boundaries", () => {
    const globalCount = read("src/app/globals.css").match(/!important/g)?.length ?? 0;
    const themeCount = read("src/app/theme-compat.css").match(/!important/g)?.length ?? 0;
    expect(globalCount).toBeLessThanOrEqual(20);
    expect(themeCount).toBeLessThanOrEqual(50);
  });
});
