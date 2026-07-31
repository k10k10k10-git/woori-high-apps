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
    expect(schedule).toContain("movements={movementRecords}");
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
    expect(sheetEditor).toContain("syncIguardScheduleOwner");
    expect(db).toContain("source=sheet 레코드만 교체");
    expect(read("src/app/retreat/[id]/PostsView.tsx")).toContain("스프레드시트처럼 아래 표에 바로 적어 저장하세요");
  });

  it("orders blocks by editable day and start time", () => {
    const db = read("src/lib/db.ts");
    const editor = read("src/app/retreat/[id]/ScheduleBlockEditor.tsx");

    expect(db).toContain("a.day - b.day || a.start.localeCompare(b.start)");
    expect(editor).toContain("day: block.day");
    expect(editor).toContain("start: block.start");
  });

  it("captures owner changes before the realtime block update can refresh committed state", () => {
    const sheetEditor = read("src/app/retreat/[id]/ScheduleSheetEditor.tsx");
    const ownerChanged = sheetEditor.indexOf("const ownerChanged =");
    const blockUpdate = sheetEditor.indexOf("await updateIguardScheduleBlock");
    const ownerSync = sheetEditor.indexOf("if (ownerChanged || forceOwnerSync)");

    expect(ownerChanged).toBeGreaterThan(-1);
    expect(blockUpdate).toBeGreaterThan(ownerChanged);
    expect(ownerSync).toBeGreaterThan(blockUpdate);
  });

  it("reconciles an already-saved owner again when the owner field loses focus", () => {
    const sheetEditor = read("src/app/retreat/[id]/ScheduleSheetEditor.tsx");

    expect(sheetEditor).toContain('data-schedule-owner="true"');
    expect(sheetEditor).toContain("ownerChanged || forceOwnerSync");
    expect(sheetEditor).toContain("void save({ forceOwnerSync })");
  });

  it("uses retreat date and clock instead of a manual progress marker", () => {
    expect(read("src/app/retreat/[id]/ScheduleSheetEditor.tsx")).not.toContain('"지금 여기"');
    const execution = read("src/app/retreat/[id]/ExecutionViews.tsx");
    expect(execution).not.toContain("progressCurrentBlock(schedule)");
    expect(execution).toContain("currentBlockFor(schedule, curDay, clock.time)");
    expect(execution).toContain("const effectiveDay = curDay");
  });
});
