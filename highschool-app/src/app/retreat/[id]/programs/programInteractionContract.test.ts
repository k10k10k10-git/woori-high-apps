import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("program preparation interaction contract", () => {
  it("keeps Firebase writes at the client boundary so the editor is testable without production data", () => {
    const editor = source("src/app/retreat/[id]/programs/ProgramEditor.tsx");
    expect(editor).not.toContain('from "@/lib/db"');
    expect(editor).toContain("onCreateTask");
    expect(editor).toContain("onUpdateTask");
    expect(editor).toContain("onDeleteTask");
  });

  it("protects dirty drafts before selection, creation, ordering, navigation, and browser exit", () => {
    const client = source("src/app/retreat/[id]/programs/ProgramPreparationClient.tsx");
    const guard = source("src/app/retreat/[id]/programs/useProgramDiscardGuard.ts");
    expect(client.match(/discardGuard\.requestAction/g)?.length).toBeGreaterThanOrEqual(4);
    expect(client).toContain("resetVersion={discardGuard.resetVersion}");
    expect(guard).toContain('window.addEventListener("beforeunload"');
    expect(guard).toContain("setResetVersion((version) => version + 1)");
  });

  it("keeps mobile and tablet action targets at least 44px and prevents task-row overflow", () => {
    const css = source("src/app/program-preparation.css");
    expect(css).toContain(".program-order-controls button { width: 44px; height: 44px; }");
    expect(css).toContain(".program-task-list li { grid-template-columns: 44px minmax(0, 1fr) 44px; }");
    expect(css).toContain(".program-task-list li > div { min-width: 0; }");
    expect(css).toContain(".program-confirm-dialog__actions button { min-height: 44px; }");
  });
});
