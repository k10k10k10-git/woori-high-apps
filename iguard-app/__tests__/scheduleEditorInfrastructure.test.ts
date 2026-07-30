import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("in-app schedule editor infrastructure", () => {
  it("uses granular and atomic movement updates instead of list overwrite", () => {
    const db = read("src/lib/db.ts");
    expect(db).toContain("updateIguardMovementById");
    expect(db).toContain("replaceIguardSegmentMovement");
    expect(db).toContain("[paths.iguardMovement(retreatId, oldId)]: null");
    expect(db).toContain("[paths.iguardMovement(retreatId, nextId)]");
  });

  it("exposes block, segment, assignee, clone, and bulk post editing", () => {
    const schedule = read("src/app/retreat/[id]/ScheduleView.tsx");
    expect(schedule).toContain("<ScheduleBlockEditor");
    expect(schedule).toContain("<ScheduleSegmentEditor");
    expect(schedule).toContain("<StructureClonePanel");
    expect(schedule).not.toContain("<CueSheetFreshnessBanner");
    expect(read("src/app/retreat/[id]/PostsView.tsx")).toContain("updateIguardPostFields");
  });

  it("marks field progress and lets cue cards prefer the progress marker", () => {
    expect(read("src/app/retreat/[id]/ScheduleView.tsx")).toContain("지금 여기까지");
    const execution = read("src/app/retreat/[id]/ExecutionViews.tsx");
    expect(execution).toContain("progressCurrentBlock(schedule)");
    expect(execution).toContain("progressBlock || currentBlockFor");
    expect(execution).toContain("effectiveTimeRangeLabel");
  });
});
