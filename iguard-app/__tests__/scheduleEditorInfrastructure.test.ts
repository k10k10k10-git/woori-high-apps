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
    const sheetEditor = read("src/app/retreat/[id]/ScheduleSheetEditor.tsx");
    const roster = read("src/app/retreat/[id]/ScheduleStaffRoster.tsx");
    const db = read("src/lib/db.ts");
    expect(schedule).toContain("<ScheduleSheetEditor");
    expect(sheetEditor).toContain("<ScheduleSegmentEditor");
    expect(sheetEditor).toContain('role="dialog"');
    expect(sheetEditor).toContain("행을 벗어나면 자동 저장");
    expect(sheetEditor).toContain("advancedTriggerRef.current?.focus()");
    expect(sheetEditor).toContain("if (await save()) onOpenAdvanced()");
    expect(roster).toContain("--schedule-roster-h");
    expect(db).toContain("updateIguardScheduleBlock");
    expect(db).toContain("update(ref(db, paths.iguardScheduleBlock");
    expect(schedule).toContain("<StructureClonePanel");
    expect(schedule).not.toContain("<CueSheetFreshnessBanner");
    expect(read("src/app/retreat/[id]/PostsView.tsx")).toContain("updateIguardPostFields");
  });

  it("orders blocks by editable day and start time", () => {
    const db = read("src/lib/db.ts");
    const editor = read("src/app/retreat/[id]/ScheduleBlockEditor.tsx");

    expect(db).toContain("a.day - b.day || a.start.localeCompare(b.start)");
    expect(editor).toContain("day: block.day");
    expect(editor).toContain("start: block.start");
  });

  it("marks field progress and lets cue cards prefer the progress marker", () => {
    expect(read("src/app/retreat/[id]/ScheduleSheetEditor.tsx")).toContain('activeProgress ? "진행 중" : "지금 여기"');
    const execution = read("src/app/retreat/[id]/ExecutionViews.tsx");
    expect(execution).toContain("progressCurrentBlock(schedule)");
    expect(execution).toContain("progressBlock || currentBlockFor");
    expect(execution).toContain("effectiveTimeRangeLabel");
  });
});
