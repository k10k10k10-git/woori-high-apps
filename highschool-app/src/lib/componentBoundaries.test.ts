import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const retreatDir = resolve(process.cwd(), "src/app/retreat/[id]");

describe("large component boundaries", () => {
  it.each([
    ["AutoAssignConfigPanel.tsx", "AutoAssignNamePickers"],
    ["ClassRosterTab.tsx", "classRosterModel"],
    ["RoomsTab.tsx", "RoomComponents"],
    ["GroupsTab.tsx", "GroupComponents"],
  ])("keeps %s as an orchestrator with an extracted boundary", (file, extractedImport) => {
    const source = readFileSync(resolve(retreatDir, file), "utf8");
    expect(source).toContain(extractedImport);
    expect(source.split("\n").length).toBeLessThan(1_000);
  });
});
