"use client";

import { Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { useUI } from "@/context/UIContext";
import { PROGRAM_TASK_STATUS_META, programTaskStatus } from "@/lib/programPreparation";
import type { RetreatProgramPost, RetreatProgramTask } from "@/lib/types";
import ProgramAutosaveField from "./ProgramAutosaveField";
import ProgramUndoNotice from "./ProgramUndoNotice";
import { useProgramUndo } from "./useProgramUndo";

type Props = {
  tasks: RetreatProgramTask[];
  posts: RetreatProgramPost[];
  canEdit: boolean;
  onCreate: (data: Omit<RetreatProgramTask, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onUpdate: (taskId: string, data: Partial<Omit<RetreatProgramTask, "id" | "createdAt">>) => Promise<void>;
  onDelete: (task: RetreatProgramTask) => Promise<RetreatProgramTask>;
  onRestore: (task: RetreatProgramTask) => Promise<void>;
};

const EMPTY = { title: "", assignee: "", dueDate: "", postId: "" };

export default function ProgramTaskBoard({ tasks, posts, canEdit, onCreate, onUpdate, onDelete, onRestore }: Props) {
  const { toast } = useUI();
  const undo = useProgramUndo();
  const [form, setForm] = useState(EMPTY);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const savingCountsRef = useRef(new Map<string, number>());
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(() => new Set());
  const ordered = useMemo(() => [...tasks].sort((a, b) => {
    const rank = { blocked: 0, doing: 1, todo: 2, done: 3 };
    return rank[programTaskStatus(a)] - rank[programTaskStatus(b)]
      || (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31")
      || a.createdAt - b.createdAt;
  }), [tasks]);
  const done = tasks.filter((task) => programTaskStatus(task) === "done").length;
  const blocked = tasks.filter((task) => programTaskStatus(task) === "blocked").length;

  async function addTask() {
    if (!form.title.trim()) return;
    setAdding(true);
    try {
      await onCreate({
        title: form.title.trim(), assignee: form.assignee.trim() || undefined,
        dueDate: form.dueDate || undefined, postId: form.postId || undefined,
        status: "todo", done: false,
      });
      setForm(EMPTY);
    } catch (error) {
      toast(error instanceof Error ? error.message : "할 일을 추가하지 못했습니다.", "error");
    } finally {
      setAdding(false);
    }
  }

  async function updateTask(taskId: string, data: Partial<RetreatProgramTask>) {
    setBusyId(taskId);
    try { await onUpdate(taskId, data); }
    catch (error) { toast(error instanceof Error ? error.message : "할 일을 수정하지 못했습니다.", "error"); }
    finally { setBusyId(null); }
  }

  async function deleteTask(task: RetreatProgramTask) {
    if ((savingCountsRef.current.get(task.id) ?? 0) > 0) {
      toast("입력 내용을 저장한 뒤 삭제해 주세요.", "warning");
      return;
    }
    setBusyId(task.id);
    try {
      const deleted = await onDelete(task);
      undo.remember(deleted.title, () => onRestore(deleted));
    }
    catch (error) { toast(error instanceof Error ? error.message : "할 일을 삭제하지 못했습니다.", "error"); }
    finally { setBusyId(null); }
  }

  function setTaskSaving(taskId: string, saving: boolean) {
    const current = savingCountsRef.current.get(taskId) ?? 0;
    const next = Math.max(0, current + (saving ? 1 : -1));
    if (next === 0) savingCountsRef.current.delete(taskId);
    else savingCountsRef.current.set(taskId, next);
    setSavingTaskIds(new Set(savingCountsRef.current.keys()));
  }

  return (
    <section className="program-task-board" aria-labelledby="program-task-board-heading">
      <div className="program-subsection-heading">
        <div><h3 id="program-task-board-heading">실행 할 일</h3></div>
        <span className="program-count">{done}/{tasks.length} 완료{blocked > 0 ? ` · 막힘 ${blocked}` : ""}</span>
      </div>
      {canEdit && (
        <div className="program-task-capture">
          <label className="program-field program-field--wide"><span>할 일</span><input className="input" value={form.title} maxLength={120} placeholder="예: 코스별 규칙 초안 작성" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
          <label className="program-field"><span>담당</span><input className="input" value={form.assignee} maxLength={60} placeholder="이름" onChange={(event) => setForm((current) => ({ ...current, assignee: event.target.value }))} /></label>
          <label className="program-field"><span>기한</span><input type="date" className="input" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>
          <label className="program-field"><span>관련 블록</span><select className="input" value={form.postId} onChange={(event) => setForm((current) => ({ ...current, postId: event.target.value }))}><option value="">프로그램 전체</option>{posts.map((post) => <option key={post.id} value={post.id}>{post.name}</option>)}</select></label>
          <button type="button" className="btn-primary" disabled={adding || !form.title.trim()} onClick={() => void addTask()}><Plus aria-hidden="true" size={16} /> 추가</button>
        </div>
      )}
      {ordered.length === 0 ? <p className="program-task-empty">아직 할 일이 없습니다.</p> : (
        <ul className="program-work-list">
          {ordered.map((task) => {
            const status = programTaskStatus(task);
            const post = posts.find((entry) => entry.id === task.postId);
            return (
              <li key={task.id} data-status={status} aria-busy={busyId === task.id || undefined}>
                <div className="program-work-list__status">
                  <select aria-label={`${task.title} 상태`} className="input" value={status} disabled={!canEdit || busyId === task.id} onChange={(event) => {
                    const next = event.target.value as NonNullable<RetreatProgramTask["status"]>;
                    void updateTask(task.id, { status: next, done: next === "done" });
                  }}>{Object.entries(PROGRAM_TASK_STATUS_META).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                </div>
                <div className="program-work-list__title"><ProgramAutosaveField value={task.title} ariaLabel={`${task.title} 할 일 이름`} maxLength={120} allowEmpty={false} disabled={!canEdit} onSaveStateChange={(saving) => setTaskSaving(task.id, saving)} onSave={(title) => onUpdate(task.id, { title })} errorMessage="할 일을 수정하지 못했습니다." />{post && <small>{post.name}</small>}</div>
                <div><ProgramAutosaveField value={task.assignee ?? ""} ariaLabel={`${task.title} 담당`} maxLength={60} placeholder="담당 없음" disabled={!canEdit} onSaveStateChange={(saving) => setTaskSaving(task.id, saving)} onSave={(assignee) => onUpdate(task.id, { assignee })} errorMessage="담당을 수정하지 못했습니다." /></div>
                <label className="program-work-list__date"><span className="sr-only">{task.title} 기한</span><input type="date" className="input" value={task.dueDate ?? ""} disabled={!canEdit || busyId === task.id} onChange={(event) => void updateTask(task.id, { dueDate: event.target.value || null })} /></label>
                {status === "blocked" && <div className="program-work-list__blocker"><WarningCircle aria-hidden="true" size={16} /><ProgramAutosaveField value={task.blocker ?? ""} ariaLabel={`${task.title} 막힌 이유`} maxLength={240} placeholder="무엇을 확인해야 다시 진행할 수 있나요?" disabled={!canEdit} onSaveStateChange={(saving) => setTaskSaving(task.id, saving)} onSave={(blocker) => onUpdate(task.id, { blocker })} errorMessage="막힌 이유를 저장하지 못했습니다." /></div>}
                {canEdit && <button type="button" className="program-task-delete" disabled={busyId === task.id || savingTaskIds.has(task.id)} onClick={() => void deleteTask(task)} aria-label={`${task.title} 삭제`}><Trash aria-hidden="true" size={16} /></button>}
              </li>
            );
          })}
        </ul>
      )}
      {undo.pending && (
        <ProgramUndoNotice label={undo.pending.label} busy={undo.busy} onUndo={() => void undo.undo()} onDismiss={undo.dismiss} />
      )}
    </section>
  );
}
