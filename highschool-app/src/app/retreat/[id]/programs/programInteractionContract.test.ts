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

  it("protects dirty drafts on every path that leaves the editor", () => {
    // 목록과 상세를 화면으로 나눈 뒤, 편집 중인 초안을 잃을 수 있는 경로는 두 가지뿐이다.
    // 목록 화면에는 편집기가 없어 dirty 상태가 존재하지 않으므로 선택·추가·순서 변경은 가드가 필요 없다.
    // 섹션 탭 전환은 같은 draft를 유지하므로(effect 의존성에 section이 없음) 이탈이 아니다.
    const client = source("src/app/retreat/[id]/programs/ProgramPreparationClient.tsx");
    const guard = source("src/app/retreat/[id]/programs/useProgramDiscardGuard.ts");
    expect(client).toContain('discardGuard.requestAction("프로그램 목록으로 이동"');
    expect(client).toContain('discardGuard.requestAction("다른 화면으로 이동"');
    expect(client).toContain("resetVersion={discardGuard.resetVersion}");
    expect(guard).toContain('window.addEventListener("beforeunload"');
    expect(guard).toContain("setResetVersion((version) => version + 1)");
  });

  it("keeps the list and the editor on separate screens", () => {
    // 한 화면에 붙여 두면 목록도 편집기도 좁아진다. 선택은 주소(?program=)가 들고 있어야
    // 새로고침·링크 공유에서 보던 프로그램을 잃지 않는다.
    const client = source("src/app/retreat/[id]/programs/ProgramPreparationClient.tsx");
    expect(client).toContain('searchParams.get("program")');
    expect(client).toContain("program-list-screen");
    expect(client).toContain("program-detail-screen");
    expect(client).not.toContain("program-workspace\"");
  });

  it("행 단위 입력이 원격 갱신을 반영하고 남의 값을 덮지 않는다", () => {
    // uncontrolled defaultValue 입력은 구독으로 값이 바뀌어도 화면이 그대로라,
    // 그 상태에서 저장하면 다른 사람이 방금 넣은 값을 과거 값으로 덮어쓴다.
    const sections = source("src/app/retreat/[id]/programs/ProgramSections.tsx");
    const field = source("src/app/retreat/[id]/programs/ProgramAutosaveField.tsx");
    expect(sections).not.toContain("defaultValue=");
    expect(sections.match(/<ProgramAutosaveField/g)?.length).toBeGreaterThanOrEqual(20);
    expect(field).toContain("setRemoteConflict(true)");
    expect(field).toContain('data-conflict');
  });

  it("행 삭제는 되돌릴 수 있다", () => {
    // 표를 정리하는 일이라 확인창 대신 되돌리기를 둔다 — 지운 값을 같은 id로 되살린다.
    const sections = source("src/app/retreat/[id]/programs/ProgramSections.tsx");
    const client = source("src/app/retreat/[id]/programs/ProgramPreparationClient.tsx");
    expect(sections.match(/undo\.remember\(/g)?.length).toBe(6);
    // 훅만 쓰고 알림을 렌더하지 않으면 지운 사실도 되돌릴 방법도 화면에 나타나지 않는다.
    // 실제로 집계 두 탭과 게임 카드에서 이 렌더가 빠져 있었다(2026-08-30 운영 확인).
    expect(sections.match(/useProgramUndo\(\)/g)?.length).toBe(
      sections.match(/<ProgramUndoNotice/g)?.length,
    );
    for (const fn of ["restoreRetreatProgramPost", "restoreRetreatProgramItem", "restoreRetreatProgramRole", "restoreRetreatProgramMatch"]) {
      expect(client).toContain(fn);
    }
  });

  it("같은 사실을 표와 자유 입력으로 두 번 받지 않는다", () => {
    // 준비물·스탭 역할은 items·roles 표가 단일 원천이다.
    // 자유 입력 칸을 되살리면 어느 쪽이 진짜인지 알 수 없어진다.
    const sections = source("src/app/retreat/[id]/programs/ProgramSections.tsx");
    const postFields = sections.slice(sections.indexOf("const POST_FIELDS = ["), sections.indexOf("] as const;", sections.indexOf("const POST_FIELDS = [")));
    expect(postFields).not.toContain("materials");
    expect(postFields).not.toContain("staffRoles");
    // 이미 적어 둔 값은 감추지 않고 옮길 때까지 보여 준다.
    expect(sections).toContain("PostLegacyText");
  });

  it("keeps mobile and tablet action targets at least 44px and prevents task-row overflow", () => {
    const css = source("src/app/program-preparation.css");
    expect(css).toContain(".program-order-controls button { width: 44px; height: 44px; }");
    expect(css).toContain(".program-task-list li { grid-template-columns: 44px minmax(0, 1fr) 44px; }");
    expect(css).toContain(".program-task-list li > div { min-width: 0; }");
    expect(css).toContain(".program-confirm-dialog__actions button { min-height: 44px; }");
  });

  it("연합팀 편성은 수련회 기본 조를 수정하지 않고 프로그램 하위 경로만 쓴다", () => {
    const db = source("src/lib/db/programs.ts");
    const paths = source("src/lib/paths.ts");
    const builder = source("src/app/retreat/[id]/programs/ProgramCompetitionTeamsSection.tsx");
    expect(paths).toContain("programCompetitionTeamGroup");
    expect(db).toContain("assignRetreatGroupToProgramCompetitionTeam");
    expect(db).not.toContain("paths.group(retreatId");
    expect(builder).not.toContain('from "@/lib/db"');
    expect(builder).toContain("균등 배치 미리보기");
    expect(builder).toContain("이 배치 적용");
  });

  it("프로그램은 진행 방식과 참가 단위를 서로 독립적으로 편집한다", () => {
    const sections = source("src/app/retreat/[id]/programs/ProgramSections.tsx");
    expect(sections).toContain("PROGRAM_OPERATION_MODE_META");
    expect(sections).toContain("PROGRAM_PARTICIPATION_MODE_META");
    expect(sections).toContain("operationMode");
    expect(sections).toContain("participationMode");
  });
});
