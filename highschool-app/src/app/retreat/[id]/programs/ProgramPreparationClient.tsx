"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import OverlayShell from "@/components/OverlayShell";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import LoadFailureNotice from "@/components/LoadFailureNotice";
import WorkspaceAccessGate from "@/components/WorkspaceAccessGate";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import {
  createDefaultRetreatPrograms,
  createRetreatProgram,
  createRetreatProgramMeeting,
  createRetreatProgramDecision,
  convertRetreatProgramDecisionToTask,
  createDefaultRetreatProgramCompetitionTeams,
  createRetreatProgramCompetitionTeam,
  createRetreatProgramItem,
  createRetreatProgramMatch,
  createRetreatProgramPost,
  createRetreatProgramPosts,
  createRetreatProgramRole,
  createRetreatProgramTask,
  deleteRetreatProgram,
  deleteRetreatProgramCompetitionTeam,
  deleteRetreatProgramItem,
  deleteRetreatProgramMatch,
  deleteRetreatProgramPost,
  deleteRetreatProgramRole,
  deleteRetreatProgramTask,
  restoreRetreatProgramTask,
  restoreRetreatProgramItem,
  restoreRetreatProgramCompetitionTeam,
  restoreRetreatProgramMatch,
  restoreRetreatProgramPost,
  restoreRetreatProgramRole,
  reorderRetreatProgramPosts,
  reorderRetreatPrograms,
  subscribeToRetreat,
  subscribeToGroups,
  subscribeToRetreatPrograms,
  subscribeToRetreatProgramMeetings,
  updateRetreatProgram,
  updateRetreatProgramMeeting,
  updateRetreatProgramDecision,
  updateRetreatProgramCompetitionTeam,
  updateRetreatProgramItem,
  updateRetreatProgramMatch,
  updateRetreatProgramPost,
  updateRetreatProgramRole,
  updateRetreatProgramTask,
  assignRetreatGroupToProgramCompetitionTeam,
  replaceRetreatProgramCompetitionAssignments,
  publishRetreatProgramRelease,
  unpublishRetreatProgramRelease,
} from "@/lib/db";
import { canAccessArea, canEditArea } from "@/features/portal/accessPolicy";
import { useRetreatPinGate } from "@/features/portal/useRetreatPinGate";
import {
  PROGRAM_SECTIONS,
  PROGRAM_WORKSPACE_SECTIONS,
  createProgramDraft,
  createProgramFromTemplate,
  programSectionFromParam,
  programWorkspaceSectionFromParam,
  programTaskDecisionLink,
  type ProgramSectionKey,
  type ProgramTemplateKey,
  type ProgramWorkspaceSectionKey,
} from "@/lib/programPreparation";
import type {
  Group,
  Retreat,
  RetreatProgram,
  RetreatProgramCompetitionTeam,
  RetreatProgramDecision,
  RetreatProgramItem,
  RetreatProgramMatch,
  RetreatProgramPost,
  RetreatProgramRole,
  RetreatProgramMeeting,
} from "@/lib/types";
import RetreatPinGate from "../field/RetreatPinGate";
import ProgramDiscardDialog from "./ProgramDiscardDialog";
import ProgramEditor from "./ProgramEditor";
import ProgramList from "./ProgramList";
import ProgramWorkspaceHeader from "./ProgramWorkspaceHeader";
import {
  ProgramCatalog,
  ProgramCollaborationWorkspace,
  ProgramResourcesWorkspace,
  ProgramScheduleWorkspace,
  ProgramSupplyWorkspace,
} from "./ProgramWorkspaceViews";
import { useProgramDiscardGuard } from "./useProgramDiscardGuard";
import { getRetreatWorkspaceSnapshot, mergeRetreatWorkspaceSnapshot } from "@/lib/retreatWorkspaceCache";

function stripPrivateMeetings(program: RetreatProgram): RetreatProgram {
  const publicProgram = { ...program };
  delete publicProgram.meetings;
  return publicProgram;
}

function programWriteFailure(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if ("businessCommitted" in error && error.businessCommitted === true) {
    return "업무는 저장됐으나 활동 로그 저장에 실패했습니다. 새로고침 후 확인해 주세요.";
  }
  // 현재 저장 경계의 계정·충돌·준비 완료 안내는 보존하고 서버 경로·기술 오류는 노출하지 않는다.
  const actionMessages = [
    "활동 기록을 남기려면 로그인 상태를 확인해 주세요. 새로고침 후 다시 저장해 주세요.",
    "저장 중 로그인 계정이 변경되었습니다. 새로고침 후 다시 저장해 주세요.",
    "프로그램이 삭제되어 현장에 공유하지 못했습니다.",
    "다른 변경이 먼저 반영되었습니다. 최신 내용을 확인한 뒤 다시 공유해 주세요.",
    "현장 준비와 실행 할 일을 모두 완료한 뒤 공유해 주세요.",
    "현장 배포본을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  ];
  return actionMessages.includes(error.message) ? error.message : fallback;
}

export default function ProgramPreparationClient() {
  const auth = useAuth();
  const route = useParams();
  const allowed = canAccessArea("retreat-admin", auth.roles);
  // 계정·수련회·회의 조회 범위가 바뀌면 이전 작업 상태를 버린다. 연결 재시도는 이 키를 바꾸지 않는다.
  const scope = `${auth.user?.uid ?? "guest"}:${route.id}:${canEditArea("retreat-admin", auth.roles)}`;
  return <WorkspaceAccessGate allowed={allowed} area="프로그램 준비" backHref="/events" backLabel="행사 목록으로">
    <ProgramPreparationWorkspace key={scope} />
  </WorkspaceAccessGate>;
}

function ProgramPreparationWorkspace() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const retreatId = params.id as string;
  // 선택한 항목은 렌더 중 파생 — effect에서 setState로 맞추면 사용자의 선택을 덮는다(실수 13).
  const sectionParam = searchParams.get("section");
  const section: ProgramSectionKey = programSectionFromParam(sectionParam);
  const workspace: ProgramWorkspaceSectionKey = programWorkspaceSectionFromParam(searchParams.get("workspace"));
  // 목록과 상세를 한 화면에 붙여 두면 둘 다 좁아진다. 선택한 프로그램을 주소에 두고
  // 화면을 가른다 — 목록에서 고르면 상세로, 상세에서 목록으로 되돌아온다.
  const selectedId = searchParams.get("program");

  function goToProgram(programId: string, nextSection: ProgramSectionKey = section) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("workspace", "programs");
    params.set("program", programId);
    params.set("section", nextSection);
    // 프로그램·섹션은 같은 작업 화면 안의 상태다. Next 라우터 탐색을 쓰면
    // 서버 라우트와 로딩 경계가 다시 실행되므로 URL만 갱신해 구독과 화면을 유지한다.
    window.history.pushState(null, "", `?${params.toString()}`);
  }

  function goToList() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("program");
    params.delete("section");
    params.set("workspace", "programs");
    const query = params.toString();
    const pathname = `/events/${encodeURIComponent(retreatId)}/programs`;
    window.history.pushState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  function selectSection(next: ProgramSectionKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  function selectWorkspace(next: ProgramWorkspaceSectionKey, focusIndex?: number) {
    if (next === workspace) {
      if (focusIndex !== undefined) workspaceTabRefs.current[focusIndex]?.focus();
      return;
    }
    discardGuard.requestAction("다른 준비 화면으로 이동", () => {
      applyWorkspace(next);
      if (focusIndex !== undefined) queueMicrotask(() => workspaceTabRefs.current[focusIndex]?.focus());
    });
  }

  function applyWorkspace(next: ProgramWorkspaceSectionKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("workspace", next);
    if (next !== "programs") {
      params.delete("program");
      params.delete("section");
    }
    window.history.pushState(null, "", `?${params.toString()}`);
  }
  const { user, loading: authLoading, roles } = useAuth();
  const { toast } = useUI();
  const adminAllowed = canAccessArea("retreat-admin", roles);
  const fieldAllowed = canAccessArea("retreat-field", roles);
  const canEdit = canEditArea("retreat-admin", roles);
  const { lock, unlocked, lockError, markUnlocked, retryLock } = useRetreatPinGate(retreatId, {
    enabled: !authLoading && !!user && adminAllowed,
    roles,
  });

  // 형제 업무 화면을 오갈 때 직전 실시간 스냅샷을 먼저 그린다. 구독은 즉시 다시
  // 연결되므로 캐시는 로딩 깜빡임만 없애고 서버 값을 대체하지 않는다.
  const [initialSnapshot] = useState(() => getRetreatWorkspaceSnapshot(retreatId));
  const [retreat, setRetreat] = useState<Retreat | null>(initialSnapshot?.retreat ?? null);
  // 공개 프로그램과 관리자 전용 회의 원문은 별도 구독한다. private 기록은 캐시에 넣지 않는다.
  const [publicPrograms, setPublicPrograms] = useState<RetreatProgram[]>(() =>
    (initialSnapshot?.programs ?? []).map(stripPrivateMeetings),
  );
  const [meetingsByProgram, setMeetingsByProgram] = useState<Record<string, Record<string, RetreatProgramMeeting>>>({});
  const programs = useMemo(() => publicPrograms.map((program) => {
    const meetings = meetingsByProgram[program.id];
    return meetings ? { ...program, meetings } : program;
  }), [meetingsByProgram, publicPrograms]);
  const [groups, setGroups] = useState<Group[]>(initialSnapshot?.groups ?? []);
  const [retreatReady, setRetreatReady] = useState(initialSnapshot?.retreat !== undefined);
  const [programsReady, setProgramsReady] = useState(initialSnapshot?.programs !== undefined);
  const [meetingsReady, setMeetingsReady] = useState(!canEdit);
  const [groupsReady, setGroupsReady] = useState(initialSnapshot?.groups !== undefined);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const loadError = Object.keys(loadErrors).length > 0;
  const [subscriptionGeneration, setSubscriptionGeneration] = useState(0);
  const [meetingLoadError, setMeetingLoadError] = useState("");
  const [meetingSessionVersion, setMeetingSessionVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RetreatProgram | null>(null);
  const discardGuard = useProgramDiscardGuard();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const workspaceTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? PROGRAM_SECTIONS.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + PROGRAM_SECTIONS.length) % PROGRAM_SECTIONS.length;
    const next = PROGRAM_SECTIONS[nextIndex];
    selectSection(next.key);
    tabRefs.current[nextIndex]?.focus();
  }

  function handleWorkspaceTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? PROGRAM_WORKSPACE_SECTIONS.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + PROGRAM_WORKSPACE_SECTIONS.length) % PROGRAM_WORKSPACE_SECTIONS.length;
    selectWorkspace(PROGRAM_WORKSPACE_SECTIONS[nextIndex].key, nextIndex);
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/");
      return;
    }
    if (!adminAllowed || !retreatId) return;
    let active = true;
    const clearError = (source: string) => setLoadErrors((previous) => {
      if (!(source in previous)) return previous;
      const next = { ...previous };
      delete next[source];
      return next;
    });
    const fail = (source: string, error: Error) => {
      if (active) setLoadErrors((previous) => ({ ...previous, [source]: error.message }));
    };
    const unsubscribeRetreat = subscribeToRetreat(
      retreatId,
      (next) => {
        if (!active) return;
        setRetreat(next);
        mergeRetreatWorkspaceSnapshot(retreatId, { retreat: next });
        setRetreatReady(true);
        clearError("수련회 정보");
      },
      (error) => fail("수련회 정보", error),
    );
    const unsubscribePrograms = subscribeToRetreatPrograms(
      retreatId,
      (next) => {
        if (!active) return;
        const publicOnly = next.map(stripPrivateMeetings);
        setPublicPrograms(publicOnly);
        mergeRetreatWorkspaceSnapshot(retreatId, { programs: publicOnly });
        setProgramsReady(true);
        clearError("프로그램 정보");
      },
      (error) => fail("프로그램 정보", error),
    );
    const unsubscribeGroups = subscribeToGroups(
      retreatId,
      (next) => {
        if (!active) return;
        setGroups(next);
        mergeRetreatWorkspaceSnapshot(retreatId, { groups: next });
        setGroupsReady(true);
        clearError("조 편성 정보");
      },
      (error) => fail("조 편성 정보", error),
    );
    const unsubscribeMeetings = canEdit
      ? subscribeToRetreatProgramMeetings(
          retreatId,
          (next) => {
            if (!active) return;
            setMeetingsByProgram(next);
            setMeetingLoadError("");
            setMeetingsReady(true);
          },
          (error) => {
            if (!active) return;
            // 권한·연결이 끊긴 뒤 메모리에 남은 private 회의를 계속 편집하면 안 된다.
            setMeetingsByProgram({});
            setMeetingSessionVersion((version) => version + 1);
            setMeetingLoadError(`준비회의 기록 - ${error.message}`);
            setMeetingsReady(true);
          },
        )
      : () => {};
    return () => { active = false; unsubscribeRetreat(); unsubscribePrograms(); unsubscribeGroups(); unsubscribeMeetings(); };
  }, [adminAllowed, authLoading, canEdit, retreatId, router, user, subscriptionGeneration]);

  function retryPreparation() {
    // 초안과 URL 선택은 유지하고 실제 구독만 교체한다. 항목별 실패는 해당 성공 응답으로 해제한다.
    setSubscriptionGeneration((value) => value + 1);
  }
  const editingAllowed = canEdit && !loadError;

  const selectedProgram = useMemo(
    () => (selectedId ? programs.find((program) => program.id === selectedId) ?? null : null),
    [programs, selectedId],
  );

  async function addProgram(template: ProgramTemplateKey = "blank") {
    setBusy(true);
    try {
      const nextOrder = programs.reduce((max, program) => Math.max(max, program.order), 0) + 1;
      const id = await createRetreatProgram(retreatId, template === "blank" ? createProgramDraft(nextOrder) : createProgramFromTemplate(nextOrder, template));
      goToProgram(id, "overview");
      toast("프로그램 초안을 만들었습니다.", "success");
    } catch (error) {
      toast(programWriteFailure(error, "프로그램 초안을 만들지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function createDefaults() {
    if (programs.length > 0) return;
    setBusy(true);
    try {
      const ids = await createDefaultRetreatPrograms(retreatId);
      goToProgram(ids[0], "overview");
      toast("프로그램 초안 2개를 만들었습니다.", "success");
    } catch (error) {
      toast(programWriteFailure(error, "기본 프로그램 초안을 만들지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function moveProgram(id: string, direction: -1 | 1) {
    const index = programs.findIndex((program) => program.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= programs.length) return;
    const next = [...programs];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    try {
      await reorderRetreatPrograms(retreatId, next.map((program) => program.id));
    } catch (error) {
      toast(programWriteFailure(error, "프로그램 순서를 바꾸지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveProgram(program: Omit<RetreatProgram, "tasks" | "meetings" | "posts" | "items" | "roles" | "competitionTeams" | "releases" | "activeReleaseId">) {
    setSaving(true);
    try {
      const { id } = program;
      const updates = { ...program };
      delete (updates as Partial<RetreatProgram>).id;
      delete (updates as Partial<RetreatProgram>).createdAt;
      await updateRetreatProgram(retreatId, id, updates);
      toast("프로그램을 저장했습니다.", "success");
    } catch (error) {
      toast(programWriteFailure(error, "프로그램을 저장하지 못했습니다. 작성 중인 초안은 유지됩니다. 연결 상태를 확인한 뒤 다시 저장해 주세요."), "error");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteRetreatProgram(retreatId, deleteTarget.id);
      setDeleteTarget(null);
      toast("프로그램을 삭제했습니다.", "success");
    } catch (error) {
      toast(programWriteFailure(error, "프로그램을 삭제하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function changeProgramPublication(programId: string, expectedUpdatedAt?: number) {
    const publishing = expectedUpdatedAt !== undefined;
    try {
      if (publishing) await publishRetreatProgramRelease(retreatId, programId, expectedUpdatedAt);
      else await unpublishRetreatProgramRelease(retreatId, programId);
    } catch (error) {
      toast(programWriteFailure(error, publishing
        ? "프로그램을 현장에 공유하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."
        : "현장 공유 상태를 변경하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."), "error");
      throw error;
    }
  }

  if (authLoading) return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-6xl"><WorkspaceSkeleton label="프로그램 준비 화면을 불러오는 중입니다." rows={7} variant="page" /></div>
    </div>
  );

  if (!user || !adminAllowed) return (
    <div className="program-access-state">
      <h1>프로그램 준비 접근 권한이 없습니다</h1>
      <p>수련회 행정 조회 권한이 있는 계정만 사용할 수 있습니다.</p>
      <button type="button" className="btn-secondary" onClick={() => router.push("/")}>통합 홈으로</button>
    </div>
  );

  if (lockError) return <div className="program-access-state">
    <LoadFailureNotice title="프로그램 준비 입장 상태를 확인하지 못했습니다." sources={["PIN 잠금 상태"]} onRetry={retryLock} />
  </div>;
  if (loadError && (!retreatReady || !programsReady || !groupsReady)) return <div className="program-access-state">
    <LoadFailureNotice title="프로그램 준비 자료를 불러오지 못했습니다." sources={Object.keys(loadErrors)} onRetry={retryPreparation} description="프로그램이 없는 상태와는 다릅니다. 다시 불러오기를 눌러 주세요." />
  </div>;

  if (!retreatReady || !programsReady || !groupsReady || !meetingsReady || lock === undefined) return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-6xl"><WorkspaceSkeleton label="프로그램 준비 화면을 불러오는 중입니다." rows={7} variant="page" /></div>
    </div>
  );

  if (lock && !unlocked) return <RetreatPinGate retreatId={retreatId} lock={lock} onUnlocked={markUnlocked} onBack={() => router.push("/events")} />;
  if (!retreat) return (
    <div className="program-access-state"><h1>수련회를 찾을 수 없습니다</h1><button type="button" className="btn-secondary" onClick={() => router.push("/events")}>목록으로</button></div>
  );

  return (
    <div className="app-page program-preparation-page">
      <ProgramWorkspaceHeader
        retreat={retreat}
        fieldAllowed={fieldAllowed}
        onNavigate={(href) => discardGuard.requestAction("다른 화면으로 이동", () => router.push(href))}
      >
        <div className="workspace-tabs program-workspace-tabs">
          <div className="mx-auto flex max-w-6xl gap-0 overflow-x-auto px-3 scrollbar-hide sm:px-4" role="tablist" aria-label="수련회 프로그램 준비">
            {PROGRAM_WORKSPACE_SECTIONS.map((entry, index) => (
              <button
                key={entry.key}
                ref={(node) => { workspaceTabRefs.current[index] = node; }}
                type="button"
                role="tab"
                id={`program-workspace-tab-${entry.key}`}
                aria-controls="program-workspace-panel"
                aria-selected={entry.key === workspace}
                tabIndex={entry.key === workspace ? 0 : -1}
                className="workspace-tab shrink-0"
                onClick={() => selectWorkspace(entry.key)}
                onKeyDown={(event) => handleWorkspaceTabKeyDown(event, index)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
        <label className="program-mobile-workspace-nav">
          <span>준비 메뉴</span>
          <select value={workspace} onChange={(event) => selectWorkspace(event.target.value as ProgramWorkspaceSectionKey)} aria-label="수련회 프로그램 준비 메뉴">
            {PROGRAM_WORKSPACE_SECTIONS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        {workspace === "programs" && selectedProgram && (
          <div className="program-editor-tabs">
            <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 scrollbar-hide sm:px-4" role="tablist" aria-label={`${selectedProgram.title} 편집 항목`}>
              {PROGRAM_SECTIONS.map((entry, index) => (
                <button
                  key={entry.key}
                  ref={(node) => { tabRefs.current[index] = node; }}
                  type="button"
                  role="tab"
                  id={`program-tab-${entry.key}`}
                  aria-controls={`program-panel-${entry.key}`}
                  aria-selected={entry.key === section}
                  tabIndex={entry.key === section ? 0 : -1}
                  onClick={() => selectSection(entry.key)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <label className="program-mobile-section-nav"><span>{selectedProgram.title} 편집 항목</span><select value={section} onChange={(event) => selectSection(event.target.value as ProgramSectionKey)}>{PROGRAM_SECTIONS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label>
          </div>
        )}
      </ProgramWorkspaceHeader>
      <main
        className="program-preparation-main"
        id="program-workspace-panel"
        role="tabpanel"
        aria-labelledby={`program-workspace-tab-${workspace}`}
      >
        {workspace === "overview" && (
          <div className="program-page-intro">
            <div>
              <h2>수련회 준비 공간</h2>
              <p>여러 프로그램의 일정, 물품, 회의와 현장 전달을 한곳에서 이어갑니다.</p>
            </div>
            <div className="program-page-summary" aria-label="프로그램 상태 요약">
              <span>전체 <strong>{programs.length}</strong></span>
              <span>검토와 확정 <strong>{programs.filter((program) => program.status === "review" || program.status === "confirmed").length}</strong></span>
              <span>현장 공유 <strong>{programs.filter((program) => program.status === "published").length}</strong></span>
            </div>
          </div>
        )}

        {loadError && <LoadFailureNotice title="준비 자료의 최신 내용을 확인하지 못했습니다." sources={Object.keys(loadErrors)} onRetry={retryPreparation} description="현재 내용과 작성 중인 초안은 유지됩니다. 다시 불러온 뒤 저장해 주세요." />}
        {meetingLoadError && <LoadFailureNotice title="준비회의 기록을 불러오지 못했습니다." sources={["준비회의 기록"]} onRetry={retryPreparation} description="다른 준비 자료는 계속 볼 수 있습니다. 회의 기록은 다시 불러온 뒤 편집할 수 있습니다." />}
        {!canEdit && <ReadOnlyBanner what="프로그램 준비 자료" why="편집은 행정팀, 교역자, 통합관리자만 가능합니다." />}

        {workspace === "overview" && (
          <div className="program-list-screen">
            <ProgramList
              programs={programs}
              selectedId={null}
              canEdit={editingAllowed}
              busy={busy}
              onSelect={(id) => goToProgram(id)}
              onAddTemplate={(template) => void addProgram(template)}
              onCreateDefaults={() => void createDefaults()}
              onMove={(id, direction) => moveProgram(id, direction)}
            />
          </div>
        )}

        {workspace === "programs" && !selectedProgram && (
          <ProgramCatalog programs={programs} canEdit={editingAllowed} busy={busy} onOpen={goToProgram} onAdd={(template) => void addProgram(template)} />
        )}

        {workspace === "programs" && selectedProgram && (
          <div
            className="program-detail-screen"
            id={`program-panel-${section}`}
            role="tabpanel"
            aria-labelledby={`program-tab-${section}`}
            tabIndex={0}
          >
            <button type="button" className="program-back-to-list"
              onClick={() => discardGuard.requestAction("프로그램 목록으로 이동", goToList)}>
              <ArrowLeft aria-hidden="true" size={15} weight="bold" />
              프로그램 목록
            </button>
            <ProgramEditor
                program={selectedProgram}
                canEdit={editingAllowed}
                meetingsAvailable={!meetingLoadError}
                meetingSessionVersion={meetingSessionVersion}
                saving={saving}
                resetVersion={discardGuard.resetVersion}
                onSave={saveProgram}
                onPublish={(expectedUpdatedAt) => changeProgramPublication(selectedProgram.id, expectedUpdatedAt)}
                onUnpublish={() => changeProgramPublication(selectedProgram.id)}
                onDirtyChange={discardGuard.setDirty}
                onRequestDelete={setDeleteTarget}
                onSelectSection={selectSection}
                onCreateTask={(data) => createRetreatProgramTask(retreatId, selectedProgram.id, data).then(() => undefined)}
                onUpdateTask={(taskId, data) => updateRetreatProgramTask(retreatId, selectedProgram.id, taskId, data)}
                onDeleteTask={async (task) => {
                  const source = programTaskDecisionLink(selectedProgram, task);
                  if (task.sourceDecisionId && !source && meetingLoadError) {
                    throw new Error("준비회의 연결을 다시 불러온 뒤 이 할 일을 삭제해 주세요.");
                  }
                  const restorable = source
                    ? { ...task, sourceMeetingId: source.meetingId, sourceDecisionId: source.decisionId }
                    : task;
                  await deleteRetreatProgramTask(retreatId, selectedProgram.id, task.id, source);
                  return restorable;
                }}
                onRestoreTask={(task) => restoreRetreatProgramTask(retreatId, selectedProgram.id, task)}
                onCreateMeeting={(data) => createRetreatProgramMeeting(retreatId, selectedProgram.id, data)}
                onUpdateMeeting={(meetingId, data) => updateRetreatProgramMeeting(retreatId, selectedProgram.id, meetingId, data)}
                onCreateDecision={(meetingId, data) => createRetreatProgramDecision(retreatId, selectedProgram.id, meetingId, data)}
                onUpdateDecision={(meetingId, decisionId, data) => updateRetreatProgramDecision(retreatId, selectedProgram.id, meetingId, decisionId, data)}
                onConvertDecision={(meetingId, decision: RetreatProgramDecision) => convertRetreatProgramDecisionToTask(retreatId, selectedProgram.id, meetingId, decision)}
                section={section}
                onCreatePost={(name, order) => createRetreatProgramPost(retreatId, selectedProgram.id, {
                  name,
                  order,
                  activityType: "other",
                  operationMode: "whole",
                  participationMode: "retreatGroup",
                  scoreEnabled: false,
                }).then(() => undefined)}
                onCreatePosts={(rows) => createRetreatProgramPosts(retreatId, selectedProgram.id, rows).then(() => undefined)}
                onReorderPosts={(orderedIds) => reorderRetreatProgramPosts(retreatId, selectedProgram.id, orderedIds)}
                onUpdatePost={(postId, data: Partial<RetreatProgramPost>) => updateRetreatProgramPost(retreatId, selectedProgram.id, postId, data)}
                onDeletePost={(postId) => deleteRetreatProgramPost(retreatId, selectedProgram.id, postId)}
                onRestorePost={(post) => restoreRetreatProgramPost(retreatId, selectedProgram.id, post)}
                onRestoreItem={(item) => restoreRetreatProgramItem(retreatId, selectedProgram.id, item)}
                onRestoreRole={(role) => restoreRetreatProgramRole(retreatId, selectedProgram.id, role)}
                onRestoreMatch={(postId, match) => restoreRetreatProgramMatch(retreatId, selectedProgram.id, postId, match)}
                onCreateMatch={(postId, data) => createRetreatProgramMatch(retreatId, selectedProgram.id, postId, data).then(() => undefined)}
                onUpdateMatch={(postId, matchId, data: Partial<RetreatProgramMatch>) => updateRetreatProgramMatch(retreatId, selectedProgram.id, postId, matchId, data)}
                onDeleteMatch={(postId, matchId) => deleteRetreatProgramMatch(retreatId, selectedProgram.id, postId, matchId)}
                onCreateRole={(role, order, postId) => createRetreatProgramRole(retreatId, selectedProgram.id, { role, order, postId }).then(() => undefined)}
                onUpdateRole={(roleId, data: Partial<RetreatProgramRole>) => updateRetreatProgramRole(retreatId, selectedProgram.id, roleId, data)}
                onDeleteRole={(roleId) => deleteRetreatProgramRole(retreatId, selectedProgram.id, roleId)}
                onCreateItem={(name, order, postId) => createRetreatProgramItem(retreatId, selectedProgram.id, { name, order, status: "todo", postId }).then(() => undefined)}
                onUpdateItem={(itemId, data: Partial<RetreatProgramItem>) => updateRetreatProgramItem(retreatId, selectedProgram.id, itemId, data)}
                onDeleteItem={(itemId) => deleteRetreatProgramItem(retreatId, selectedProgram.id, itemId)}
                groups={groups}
                onCreateCompetitionTeam={(name, order, color) => createRetreatProgramCompetitionTeam(retreatId, selectedProgram.id, { name, order, color }).then(() => undefined)}
                onCreateDefaultCompetitionTeams={() => createDefaultRetreatProgramCompetitionTeams(retreatId, selectedProgram.id)}
                onUpdateCompetitionTeam={(teamId, data: Partial<RetreatProgramCompetitionTeam>) => updateRetreatProgramCompetitionTeam(retreatId, selectedProgram.id, teamId, data)}
                onDeleteCompetitionTeam={(teamId) => deleteRetreatProgramCompetitionTeam(retreatId, selectedProgram.id, teamId)}
                onRestoreCompetitionTeam={(team) => restoreRetreatProgramCompetitionTeam(retreatId, selectedProgram.id, team)}
                onAssignCompetitionGroup={(groupId, teamId) => assignRetreatGroupToProgramCompetitionTeam(
                  retreatId,
                  selectedProgram.id,
                  Object.keys(selectedProgram.competitionTeams ?? {}),
                  groupId,
                  teamId,
                )}
                onApplyBalancedCompetitionTeams={(assignment) => replaceRetreatProgramCompetitionAssignments(
                  retreatId,
                  selectedProgram.id,
                  Object.keys(selectedProgram.competitionTeams ?? {}),
                  assignment,
                )}
            />
          </div>
        )}

        {workspace === "schedule" && <ProgramScheduleWorkspace programs={programs} onOpen={goToProgram} />}
        {workspace === "supplies" && (
          <ProgramSupplyWorkspace
            programs={programs}
            canEdit={editingAllowed}
            onOpen={goToProgram}
            onUpdateItem={(programId, itemId, data) => updateRetreatProgramItem(retreatId, programId, itemId, data)}
          />
        )}
        {workspace === "collaboration" && (
          <ProgramCollaborationWorkspace
            programs={programs}
            canEdit={editingAllowed}
            onOpen={goToProgram}
            onUpdateTask={(programId, taskId, data) => updateRetreatProgramTask(retreatId, programId, taskId, data)}
          />
        )}
        {workspace === "resources" && <ProgramResourcesWorkspace programs={programs} onOpen={goToProgram} />}
      </main>

      {deleteTarget && (
        <OverlayShell label="프로그램 삭제" onClose={() => { if (!busy) setDeleteTarget(null); }} closeOnBackdrop={!busy} panelClassName="program-confirm-dialog w-full max-w-sm">
          <div className="program-confirm-dialog__body">
            <h2>프로그램을 삭제할까요?</h2>
            <p><strong>{deleteTarget.title}</strong>의 진행안, 대본, 할 일과 준비회의가 함께 삭제됩니다.</p>
            <div className="program-confirm-dialog__actions">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setDeleteTarget(null)}>취소</button>
              <button type="button" className="btn-danger" disabled={busy} onClick={() => void confirmDelete()}>{busy ? "삭제 중…" : "삭제"}</button>
            </div>
          </div>
        </OverlayShell>
      )}
      <ProgramDiscardDialog
        actionLabel={discardGuard.pendingLabel}
        onCancel={discardGuard.cancelDiscard}
        onConfirm={discardGuard.confirmDiscard}
      />
    </div>
  );
}
