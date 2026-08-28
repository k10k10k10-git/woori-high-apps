"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import OverlayShell from "@/components/OverlayShell";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import {
  createDefaultRetreatPrograms,
  createRetreatProgram,
  deleteRetreatProgram,
  reorderRetreatPrograms,
  subscribeToRetreat,
  subscribeToRetreatPrograms,
  updateRetreatProgram,
} from "@/lib/db";
import { canAccessArea, canEditArea } from "@/features/portal/accessPolicy";
import { useRetreatPinGate } from "@/features/portal/useRetreatPinGate";
import { createProgramDraft } from "@/lib/programPreparation";
import type { Retreat, RetreatProgram } from "@/lib/types";
import RetreatPinGate from "../field/RetreatPinGate";
import ProgramEditor from "./ProgramEditor";
import ProgramList from "./ProgramList";
import ProgramWorkspaceHeader from "./ProgramWorkspaceHeader";

export default function ProgramPreparationClient() {
  const params = useParams();
  const router = useRouter();
  const retreatId = params.id as string;
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
  const [retreatReady, setRetreatReady] = useState(false);
  const [programsReady, setProgramsReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RetreatProgram | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/");
      return;
    }
    if (!adminAllowed || !retreatId) return;
    setRetreatReady(false);
    setProgramsReady(false);
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
        setSelectedId((previous) => previous && next.some((program) => program.id === previous) ? previous : next[0]?.id ?? null);
        setProgramsReady(true);
      },
      (error) => { setLoadError(`프로그램 정보 - ${error.message}`); setProgramsReady(true); },
    );
    return () => { unsubscribeRetreat(); unsubscribePrograms(); };
  }, [adminAllowed, authLoading, retreatId, router, user]);

  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedId) ?? programs[0] ?? null,
    [programs, selectedId],
  );

  async function addProgram() {
    setBusy(true);
    try {
      const nextOrder = programs.reduce((max, program) => Math.max(max, program.order), 0) + 1;
      const id = await createRetreatProgram(retreatId, createProgramDraft(nextOrder));
      setSelectedId(id);
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
      setSelectedId(ids[0]);
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

  async function saveProgram(program: Omit<RetreatProgram, "tasks">) {
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

  if (!retreatReady || !programsReady || lock === undefined) return (
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
      <ProgramWorkspaceHeader retreat={retreat} fieldAllowed={fieldAllowed} />
      <main className="program-preparation-main">
        <div className="program-page-intro">
          <div>
            <h2>프로그램 준비</h2>
            <p>기획에서 진행안·브리핑·현장 전달까지 프로그램별로 정리합니다.</p>
          </div>
          <div className="program-page-summary" aria-label="프로그램 상태 요약">
            <span>전체 <strong>{programs.length}</strong></span>
            <span>검토·확정 <strong>{programs.filter((program) => program.status === "review" || program.status === "confirmed").length}</strong></span>
            <span>현장 공유 <strong>{programs.filter((program) => program.status === "published").length}</strong></span>
          </div>
        </div>

        {loadError && <div className="program-load-error" role="alert">{loadError} 새로고침하면 다시 연결합니다.</div>}
        {!canEdit && <ReadOnlyBanner what="프로그램 준비 자료" why="편집은 행정팀·교역자·통합관리자만 가능합니다." />}

        {programs.length === 0 ? (
          <ProgramList programs={programs} selectedId={null} canEdit={canEdit} busy={busy} onSelect={setSelectedId} onAdd={() => void addProgram()} onCreateDefaults={() => void createDefaults()} onMove={() => {}} />
        ) : (
          <div className="program-workspace">
            <ProgramList programs={programs} selectedId={selectedProgram?.id ?? null} canEdit={canEdit} busy={busy} onSelect={setSelectedId} onAdd={() => void addProgram()} onCreateDefaults={() => void createDefaults()} onMove={(id, direction) => void moveProgram(id, direction)} />
            {selectedProgram && <ProgramEditor retreatId={retreatId} program={selectedProgram} canEdit={canEdit} saving={saving} onSave={saveProgram} onRequestDelete={setDeleteTarget} />}
          </div>
        )}
      </main>

      {deleteTarget && (
        <OverlayShell label="프로그램 삭제" onClose={() => { if (!busy) setDeleteTarget(null); }} closeOnBackdrop={!busy} panelClassName="w-full max-w-sm">
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-800">프로그램을 삭제할까요?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500"><strong>{deleteTarget.title}</strong>의 진행안·대본·할 일이 함께 삭제됩니다.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setDeleteTarget(null)}>취소</button>
              <button type="button" className="btn-danger" disabled={busy} onClick={() => void confirmDelete()}>{busy ? "삭제 중…" : "삭제"}</button>
            </div>
          </div>
        </OverlayShell>
      )}
    </div>
  );
}
