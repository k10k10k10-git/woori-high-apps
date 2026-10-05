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
    expect(editor).toContain("onCreateMeeting");
    expect(editor).toContain("onConvertDecision");
  });

  it("목록은 사후 문서 수가 아니라 지금 처리할 작업과 현장 점검을 분리해 보여준다", () => {
    const list = source("src/app/retreat/[id]/programs/ProgramList.tsx");
    expect(list).toContain("지금 처리할 것");
    expect(list).toContain("programTaskProgress");
    expect(list).toContain("다가오는 할 일");
    expect(list).toContain("현장 점검");
    const catalog = source("src/app/retreat/[id]/programs/ProgramWorkspaceViews.tsx");
    expect(catalog).toContain("PROGRAM_TEMPLATE_META");
  });

  it("첫 화면은 다음 준비와 기본 정보 뒤에 실행 할 일을 두고 회의 결정은 기존 작업을 덮지 않는다", () => {
    const editor = source("src/app/retreat/[id]/programs/ProgramEditor.tsx");
    const meeting = source("src/app/retreat/[id]/programs/ProgramMeetingMode.tsx");
    const db = source("src/lib/db/programs.ts");
    const paths = source("src/lib/paths.ts");
    expect(editor.indexOf("program-readiness-checklist")).toBeLessThan(editor.indexOf("program-form--manual"));
    expect(editor.indexOf("program-form--manual")).toBeLessThan(editor.indexOf("<ProgramTaskBoard"));
    expect(meeting).toContain("결정과 실행");
    expect(meeting).toContain("할 일로 보내기");
    expect(db).toContain("convertRetreatProgramDecisionToTask");
    expect(db).toContain("programDecisionTaskId");
    expect(db).toContain("await update(ref(db), payload)");
    expect(paths).toContain("programDecision");
  });

  it("회의 원문은 private 경로에서만 구독하고 공개 캐시에 남기지 않는다", () => {
    const client = source("src/app/retreat/[id]/programs/ProgramPreparationClient.tsx");
    const paths = source("src/lib/paths.ts");
    expect(paths).toContain("retreatsPrivate/${id}/programMeetings");
    expect(client).toContain("subscribeToRetreatProgramMeetings");
    expect(client).toContain("setMeetingsByProgram({})");
    expect(client).toContain("stripPrivateMeetings");
    expect(client).toContain("delete publicProgram.meetings");
    expect(client).toContain("meetingsAvailable={!meetingLoadError}");
  });

  it("진행 블록은 테스트와 막힘 상태를 현장 순서에서 바로 드러낸다", () => {
    const sections = source("src/app/retreat/[id]/programs/ProgramSections.tsx");
    const runSheet = source("src/app/retreat/[id]/programs/ProgramRunOfShow.tsx");
    expect(sections).toContain("사전 테스트");
    expect(sections).toContain("막힌 준비");
    expect(runSheet).toContain("준비 막힘");
    expect(runSheet).toContain("테스트 완료");
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

  it("프로그램 안의 선택은 서버 라우트를 다시 탐색하지 않는다", () => {
    // 프로그램·섹션 선택은 URL로 공유할 수 있어야 하지만 같은 Firebase 구독과
    // 편집 화면을 유지해야 한다. router.push/replace는 로딩 경계를 다시 실행한다.
    const client = source("src/app/retreat/[id]/programs/ProgramPreparationClient.tsx");
    const localNavigation = client.slice(
      client.indexOf("function goToProgram"),
      client.indexOf("const { user, loading: authLoading"),
    );
    expect(localNavigation).toContain("window.history.pushState");
    expect(localNavigation).toContain("window.history.replaceState");
    expect(localNavigation).not.toContain("router.push");
    expect(localNavigation).not.toContain("router.replace");
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
    // 자기 저장의 RTDB 로컬 이벤트는 충돌로 오인하지 않고, 실패한 저장만 dirty를 되살린다.
    expect(source("src/app/retreat/[id]/programs/ProgramEditor.tsx")).toContain("const restoreDirty = dirtyRef.current");
    expect(source("src/app/retreat/[id]/programs/ProgramEditor.tsx")).toContain("setDirty(restoreDirty)");
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

  it("준비 체크는 필요한 입력 탭과 정확한 필드로 바로 이동한다", () => {
    const editor = source("src/app/retreat/[id]/programs/ProgramEditor.tsx");
    const client = source("src/app/retreat/[id]/programs/ProgramPreparationClient.tsx");
    expect(editor).toContain("program-readiness-checklist");
    expect(editor).toContain("goToReadinessTarget(item.section, item.targetId)");
    expect(editor).toContain("document.getElementById(pendingTarget.targetId)");
    expect(editor).toContain('target.focus({ preventScroll: true })');
    expect(client).toContain("onSelectSection={selectSection}");
  });

  it("수동 저장은 변경 중에만 상단 도크로 노출하고 행 자동 저장과 중복 안내하지 않는다", () => {
    const editor = source("src/app/retreat/[id]/programs/ProgramEditor.tsx");
    const css = source("src/app/program-preparation.css");
    expect(editor).not.toContain("const SAVE_GUIDANCE");
    expect(editor).toContain("program-dirty-save-dock");
    expect(editor).toContain("저장하지 않은 초안");
    expect(editor).toContain("program-form--manual");
    expect(css).toContain("position: sticky; top: 8px");
    expect(css).not.toContain(".program-save-guidance");
  });

  it("현장 공유를 일반 상태 변경과 분리하고 준비 완료 뒤 확인한다", () => {
    const editor = source("src/app/retreat/[id]/programs/ProgramEditor.tsx");
    const publication = source("src/app/retreat/[id]/programs/ProgramPublicationPanel.tsx");
    expect(editor).toContain('.filter(([value]) => value !== "published"');
    expect(editor).toContain('publicationAction === "publish" && !canPublishProgram');
    expect(editor).toContain("이가드 현장에 공유할까요?");
    expect(publication).toContain('disabled={busy || !ready}');
    expect(publication).toContain("변경사항 다시 공유");
    expect(publication).toContain("hasUnsavedChanges");
    expect(publication).toContain("새 배포본 미리보기");
    expect(publication).toContain("<PublishedProgramCard");
  });

  it("수련회 준비는 여섯 업무 화면을 URL로 유지하고 프로그램 원본으로 돌아간다", () => {
    const preparation = source("src/lib/programPreparation.ts");
    const client = source("src/app/retreat/[id]/programs/ProgramPreparationClient.tsx");
    const views = source("src/app/retreat/[id]/programs/ProgramWorkspaceViews.tsx");
    for (const label of ["전체 준비", "프로그램 준비", "시간·장소", "준비물·비용", "담당자·할 일", "현장 공유"]) {
      expect(preparation).toContain(`label: "${label}"`);
    }
    expect(client).toContain('params.set("workspace", next)');
    expect(client).toContain("<ProgramScheduleWorkspace");
    expect(client).toContain("<ProgramSupplyWorkspace");
    expect(views).toContain('onOpen(program.id, "roles")');
  });

  it("처음 온 스탭에게 네 단계 순서와 각 프로그램의 다음 행동을 바로 안내한다", () => {
    const preparation = source("src/lib/programPreparation.ts");
    const views = source("src/app/retreat/[id]/programs/ProgramWorkspaceViews.tsx");
    for (const label of ["1 기획 시작", "2 진행 순서", "3 준비물·담당", "4 확인·현장 공유"]) {
      expect(preparation).toContain(`label: "${label}"`);
    }
    expect(views).toContain("처음 준비한다면");
    expect(views).toContain("아래 네 단계만 차례로 진행하면 됩니다.");
    expect(views).toContain("catalogNextAction");
    expect(views).toContain("다음 할 일");
    expect(views).not.toContain("활동 형식 미정");
    const editor = source("src/app/retreat/[id]/programs/ProgramEditor.tsx");
    expect(editor).toContain("needsProgramIdentity");
    expect(editor).toContain("프로그램 이름과 총괄 입력");
    expect(editor).toContain('id="program-title"');
  });

  it("현장은 활성 배포본만 읽고 편집 원본의 후속 변경을 노출하지 않는다", () => {
    const db = source("src/lib/db/programs.ts");
    const field = source("src/app/retreat/[id]/field/PublishedProgramsView.tsx");
    expect(db).toContain("publishRetreatProgramRelease");
    expect(db).toContain("sourceUpdatedAt: current.updatedAt");
    expect(db).toContain("if (!canPublishProgram(current))");
    expect(db).toContain("runTransaction(ref(db, programPath)");
    expect(db).toContain("activeReleaseId: releaseId");
    expect(field).toContain("publishedProgramForField");
  });

  it("프로그램 탭은 방향키 이동과 tabpanel 연결을 제공한다", () => {
    const client = source("src/app/retreat/[id]/programs/ProgramPreparationClient.tsx");
    expect(client).toContain('aria-controls={`program-panel-${entry.key}`}');
    expect(client).toContain('role="tabpanel"');
    expect(client).toContain('["ArrowLeft", "ArrowRight", "Home", "End"]');
  });

  it("프로그램 구성은 폼보다 먼저 현장 진행 순서를 보여준다", () => {
    const sections = source("src/app/retreat/[id]/programs/ProgramSections.tsx");
    const runSheet = source("src/app/retreat/[id]/programs/ProgramRunOfShow.tsx");
    const db = source("src/lib/db/programs.ts");
    expect(sections).toContain("<ProgramRunOfShow");
    expect(sections).toContain("블록 이름");
    expect(runSheet).toContain("현장 진행 순서");
    expect(runSheet).toContain("scrollIntoView");
    expect(runSheet).toContain("program-run-sheet__order");
    expect(runSheet).toContain("한 칸 위로");
    expect(runSheet).toContain("한 칸 아래로");
    expect(db).toContain("reorderRetreatProgramPosts");
    expect(db).toContain("await update(ref(db), payload)");
    expect(db).not.toContain("set(ref(db), payload)");
  });

  it("이가드 현장과 준비 화면 미리보기는 같은 읽기 전용 카드를 쓴다", () => {
    const field = source("src/app/retreat/[id]/field/PublishedProgramsView.tsx");
    const publication = source("src/app/retreat/[id]/programs/ProgramPublicationPanel.tsx");
    expect(field).toContain('from "@/components/PublishedProgramCard"');
    expect(publication).toContain('from "@/components/PublishedProgramCard"');
  });

  it("모바일 역할과 물품 표는 가로 표 대신 같은 입력의 카드 레이아웃을 사용한다", () => {
    const sections = source("src/app/retreat/[id]/programs/ProgramSections.tsx");
    const css = source("src/app/program-preparation.css");
    expect(sections.match(/program-table--adaptive/g)?.length).toBe(2);
    expect(sections).toContain('data-label="세부 내용"');
    expect(sections).toContain('data-label="금액"');
    expect(css).toContain(".program-table--adaptive tr");
    expect(css).toContain(".program-alliance-teams { grid-template-columns: 1fr; }");
  });

  it("프로그램 삭제는 준비 보드의 위험 영역에서만 노출한다", () => {
    const editor = source("src/app/retreat/[id]/programs/ProgramEditor.tsx");
    expect(editor).toContain('section === "overview"');
    expect(editor).toContain("program-danger-zone");
    expect(editor.match(/onRequestDelete\(program\)/g)?.length).toBe(1);
  });
});
