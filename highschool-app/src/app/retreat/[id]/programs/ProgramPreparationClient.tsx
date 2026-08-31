"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import OverlayShell from "@/components/OverlayShell";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import {
  createDefaultRetreatPrograms,
  createRetreatProgram,
  createDefaultRetreatProgramCompetitionTeams,
  createRetreatProgramCompetitionTeam,
  createRetreatProgramItem,
  createRetreatProgramMatch,
  createRetreatProgramPost,
  createRetreatProgramRole,
  createRetreatProgramTask,
  deleteRetreatProgram,
  deleteRetreatProgramCompetitionTeam,
  deleteRetreatProgramItem,
  deleteRetreatProgramMatch,
  deleteRetreatProgramPost,
  deleteRetreatProgramRole,
  deleteRetreatProgramTask,
  restoreRetreatProgramItem,
  restoreRetreatProgramCompetitionTeam,
  restoreRetreatProgramMatch,
  restoreRetreatProgramPost,
  restoreRetreatProgramRole,
  reorderRetreatPrograms,
  subscribeToRetreat,
  subscribeToGroups,
  subscribeToRetreatPrograms,
  updateRetreatProgram,
  updateRetreatProgramCompetitionTeam,
  updateRetreatProgramItem,
  updateRetreatProgramMatch,
  updateRetreatProgramPost,
  updateRetreatProgramRole,
  updateRetreatProgramTask,
  assignRetreatGroupToProgramCompetitionTeam,
  replaceRetreatProgramCompetitionAssignments,
} from "@/lib/db";
import { canAccessArea, canEditArea } from "@/features/portal/accessPolicy";
import { useRetreatPinGate } from "@/features/portal/useRetreatPinGate";
import { PROGRAM_SECTIONS, createProgramDraft, programSectionFromParam, type ProgramSectionKey } from "@/lib/programPreparation";
import type {
  Group,
  Retreat,
  RetreatProgram,
  RetreatProgramCompetitionTeam,
  RetreatProgramItem,
  RetreatProgramMatch,
  RetreatProgramPost,
  RetreatProgramRole,
} from "@/lib/types";
import RetreatPinGate from "../field/RetreatPinGate";
import ProgramDiscardDialog from "./ProgramDiscardDialog";
import ProgramEditor from "./ProgramEditor";
import ProgramList from "./ProgramList";
import ProgramWorkspaceHeader from "./ProgramWorkspaceHeader";
import { useProgramDiscardGuard } from "./useProgramDiscardGuard";

export default function ProgramPreparationClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const retreatId = params.id as string;
  // 선택한 항목은 렌더 중 파생 — effect에서 setState로 맞추면 사용자의 선택을 덮는다(실수 13).
  const sectionParam = searchParams.get("section");
  const section: ProgramSectionKey = programSectionFromParam(sectionParam);
  // 목록과 상세를 한 화면에 붙여 두면 둘 다 좁아진다. 선택한 프로그램을 주소에 두고
  // 화면을 가른다 — 목록에서 고르면 상세로, 상세에서 목록으로 되돌아온다.
  const selectedId = searchParams.get("program");

  function goToProgram(programId: string, nextSection: ProgramSectionKey = section) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("program", programId);
    params.set("section", nextSection);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function goToList() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("program");
    params.delete("section");
    const query = params.toString();
    router.push(query ? `?${query}` : `/retreat/${encodeURIComponent(retreatId)}/programs`, { scroll: false });
  }

  function selectSection(next: ProgramSectionKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const { user, loading: authLoading, roles } = useAuth();
  const { toast } = useUI();
  const adminAllowed = canAccessArea("retreat-admin", roles);
  const fieldAllowed = canAccessArea("retreat-field", roles);
  const canEdit = canEditArea("retreat-admin", roles);
  const { lock, unlocked, lockError, markUnlocked } = useRetreatPinGate(retreatId, {
    enabled: !authLoading && !!user && adminAllowed,
    roles,
  });

  const [retreat, setRetreat] = useState<Retreat | null>(null);
  const [programs, setPrograms] = useState<RetreatProgram[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [retreatReady, setRetreatReady] = useState(false);
  const [programsReady, setProgramsReady] = useState(false);
  const [groupsReady, setGroupsReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RetreatProgram | null>(null);
  const discardGuard = useProgramDiscardGuard();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/");
      return;
    }
    if (!adminAllowed || !retreatId) return;
    setRetreatReady(false);
    setProgramsReady(false);
    setGroupsReady(false);
    setLoadError("");
    const unsubscribeRetreat = subscribeToRetreat(
      retreatId,
      (next) => { setRetreat(next); setRetreatReady(true); },
      (error) => { setLoadError(`수련회 정보 - ${error.message}`); setRetreatReady(true); },
    );
    const unsubscribePrograms = subscribeToRetreatPrograms(
      retreatId,
      (next) => {
        setPrograms(next);
        setProgramsReady(true);
      },
      (error) => { setLoadError(`프로그램 정보 - ${error.message}`); setProgramsReady(true); },
    );
    const unsubscribeGroups = subscribeToGroups(
      retreatId,
      (next) => { setGroups(next); setGroupsReady(true); },
      (error) => { setLoadError(`조 편성 정보 - ${error.message}`); setGroupsReady(true); },
    );
    return () => { unsubscribeRetreat(); unsubscribePrograms(); unsubscribeGroups(); };
  }, [adminAllowed, authLoading, retreatId, router, user]);

  const selectedProgram = useMemo(
    () => (selectedId ? programs.find((program) => program.id === selectedId) ?? null : null),
    [programs, selectedId],
  );

  async function addProgram() {
    setBusy(true);
    try {
      const nextOrder = programs.reduce((max, program) => Math.max(max, program.order), 0) + 1;
      const id = await createRetreatProgram(retreatId, createProgramDraft(nextOrder));
      goToProgram(id, "overview");
      toast("프로그램 초안을 만들었습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "프로그램을 만들지 못했습니다.", "error");
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
      toast(error instanceof Error ? error.message : "기본 프로그램을 만들지 못했습니다.", "error");
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
      toast(error instanceof Error ? error.message : "프로그램 순서를 바꾸지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveProgram(program: Omit<RetreatProgram, "tasks" | "posts" | "items" | "roles" | "competitionTeams">) {
    setSaving(true);
    try {
      const { id } = program;
      const updates = { ...program };
      delete (updates as Partial<RetreatProgram>).id;
      delete (updates as Partial<RetreatProgram>).createdAt;
      await updateRetreatProgram(retreatId, id, updates);
      toast("프로그램을 저장했습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "프로그램을 저장하지 못했습니다.", "error");
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
      toast(error instanceof Error ? error.message : "프로그램을 삭제하지 못했습니다.", "error");
    } finally {
      setBusy(false);
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

  if (!retreatReady || !programsReady || !groupsReady || lock === undefined) return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-6xl"><WorkspaceSkeleton label="프로그램 준비 화면을 불러오는 중입니다." rows={7} variant="page" /></div>
    </div>
  );

  if (lockError) return (
    <div className="program-access-state" role="alert"><h1>잠금 상태를 확인하지 못했습니다</h1><p>{lockError}</p><button type="button" className="btn-secondary" onClick={() => router.push("/programs")}>목록으로</button></div>
  );
  if (lock && !unlocked) return <RetreatPinGate retreatId={retreatId} lock={lock} onUnlocked={markUnlocked} onBack={() => router.push("/programs")} />;
  if (!retreat) return (
    <div className="program-access-state"><h1>수련회를 찾을 수 없습니다</h1><button type="button" className="btn-secondary" onClick={() => router.push("/programs")}>목록으로</button></div>
  );

  return (
    <div className="app-page program-preparation-page">
      <ProgramWorkspaceHeader
        retreat={retreat}
        fieldAllowed={fieldAllowed}
        onNavigate={(href) => discardGuard.requestAction("다른 화면으로 이동", () => router.push(href))}
      >
        {/* 2단 탭 — 행정·이가드와 같은 workspace-tabs 구조를 그대로 쓴다. */}
        {selectedProgram && (
          <div className="workspace-tabs">
            <div className="mx-auto flex max-w-6xl gap-0 overflow-x-auto px-3 scrollbar-hide sm:px-4" role="tablist" aria-label="프로그램 준비 항목">
              {PROGRAM_SECTIONS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={entry.key === section}
                  className="workspace-tab shrink-0"
                  onClick={() => selectSection(entry.key)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </ProgramWorkspaceHeader>
      <main className="program-preparation-main">
        {/* 목록 화면용 안내와 집계다. 특정 프로그램을 편집하는 중에는 자리만 차지한다. */}
        {!selectedProgram && (
          <div className="program-page-intro">
            <div>
              <h2>프로그램 준비</h2>
              <p>기획, 진행안, 브리핑과 현장 전달 내용을 프로그램별로 정리합니다.</p>
            </div>
            <div className="program-page-summary" aria-label="프로그램 상태 요약">
              <span>전체 <strong>{programs.length}</strong></span>
              <span>검토와 확정 <strong>{programs.filter((program) => program.status === "review" || program.status === "confirmed").length}</strong></span>
              <span>현장 공유 <strong>{programs.filter((program) => program.status === "published").length}</strong></span>
            </div>
          </div>
        )}

        {loadError && <div className="program-load-error" role="alert">{loadError} 새로고침하면 다시 연결합니다.</div>}
        {!canEdit && <ReadOnlyBanner what="프로그램 준비 자료" why="편집은 행정팀, 교역자, 통합관리자만 가능합니다." />}

        {programs.length === 0 ? (
          <ProgramList programs={programs} selectedId={null} canEdit={canEdit} busy={busy} onSelect={(id) => goToProgram(id)} onAdd={() => void addProgram()} onCreateDefaults={() => void createDefaults()} onMove={() => {}} />
        ) : !selectedProgram ? (
          <div className="program-list-screen">
            <ProgramList
              programs={programs}
              selectedId={null}
              canEdit={canEdit}
              busy={busy}
              onSelect={(id) => goToProgram(id)}
              onAdd={() => void addProgram()}
              onCreateDefaults={() => void createDefaults()}
              onMove={(id, direction) => moveProgram(id, direction)}
            />
          </div>
        ) : (
          <div className="program-detail-screen">
            <button type="button" className="program-back-to-list"
              onClick={() => discardGuard.requestAction("프로그램 목록으로 이동", goToList)}>
              <ArrowLeft aria-hidden="true" size={15} weight="bold" />
              프로그램 목록
            </button>
            {selectedProgram && (
              <ProgramEditor
                program={selectedProgram}
                canEdit={canEdit}
                saving={saving}
                resetVersion={discardGuard.resetVersion}
                onSave={saveProgram}
                onDirtyChange={discardGuard.setDirty}
                onRequestDelete={setDeleteTarget}
                onSelectSection={selectSection}
                onCreateTask={(data) => createRetreatProgramTask(retreatId, selectedProgram.id, data).then(() => undefined)}
                onUpdateTask={(taskId, data) => updateRetreatProgramTask(retreatId, selectedProgram.id, taskId, data)}
                onDeleteTask={(taskId) => deleteRetreatProgramTask(retreatId, selectedProgram.id, taskId)}
                section={section}
                onCreatePost={(name, order) => createRetreatProgramPost(retreatId, selectedProgram.id, {
                  name,
                  order,
                  operationMode: "whole",
                  participationMode: "retreatGroup",
                  scoreEnabled: false,
                }).then(() => undefined)}
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
            )}
          </div>
        )}
      </main>

      {deleteTarget && (
        <OverlayShell label="프로그램 삭제" onClose={() => { if (!busy) setDeleteTarget(null); }} closeOnBackdrop={!busy} panelClassName="program-confirm-dialog w-full max-w-sm">
          <div className="program-confirm-dialog__body">
            <h2>프로그램을 삭제할까요?</h2>
            <p><strong>{deleteTarget.title}</strong>의 진행안, 대본과 할 일이 함께 삭제됩니다.</p>
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
