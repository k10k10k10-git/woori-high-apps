"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Circle, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { useUI } from "@/context/UIContext";
import {
  PROGRAM_KIND_META,
  PROGRAM_STATUS_META,
  groupItemsByPost,
  groupRolesByPost,
  itemsOfPost,
  programPosts,
  rolesOfPost,
  programReadiness,
  programStatusMeta,
  programTasks,
  shouldSyncEditorDraft,
  type ProgramSectionKey,
} from "@/lib/programPreparation";
import { ProgramItemsSection, ProgramPostsSection, ProgramRolesSection } from "./ProgramSections";
import type {
  RetreatProgram,
  RetreatProgramItem,
  RetreatProgramKind,
  RetreatProgramMatch,
  RetreatProgramPost,
  RetreatProgramRole,
  RetreatProgramStatus,
  RetreatProgramTask,
} from "@/lib/types";

type EditableProgram = Omit<RetreatProgram, "tasks">;

type Props = {
  program: RetreatProgram;
  canEdit: boolean;
  saving: boolean;
  resetVersion?: number;
  onSave: (program: EditableProgram) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onRequestDelete: (program: RetreatProgram) => void;
  onCreateTask: (data: Omit<RetreatProgramTask, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onUpdateTask: (taskId: string, data: Partial<Omit<RetreatProgramTask, "id" | "createdAt">>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  section: ProgramSectionKey;
  onCreatePost: (name: string, order: number) => Promise<void>;
  onUpdatePost: (postId: string, data: Partial<RetreatProgramPost>) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onRestorePost: (post: RetreatProgramPost) => Promise<void>;
  onRestoreItem: (item: RetreatProgramItem) => Promise<void>;
  onRestoreRole: (role: RetreatProgramRole) => Promise<void>;
  onRestoreMatch: (postId: string, match: RetreatProgramMatch) => Promise<void>;
  onCreateMatch: (postId: string, data: { round: number; order: number }) => Promise<void>;
  onUpdateMatch: (postId: string, matchId: string, data: Partial<RetreatProgramMatch>) => Promise<void>;
  onDeleteMatch: (postId: string, matchId: string) => Promise<void>;
  onCreateRole: (role: string, order: number, postId?: string) => Promise<void>;
  onUpdateRole: (roleId: string, data: Partial<RetreatProgramRole>) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
  onCreateItem: (name: string, order: number, postId?: string) => Promise<void>;
  onUpdateItem: (itemId: string, data: Partial<RetreatProgramItem>) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
};

const OVERVIEW_FIELDS = [
  { key: "objective", label: "목표", placeholder: "이 프로그램으로 학생과 공동체가 얻어야 할 것", rows: 3 },
  { key: "summary", label: "기획 요약", placeholder: "처음 읽는 사람도 이해할 수 있는 전체 구성", rows: 4 },
] as const;

const FLOW_FIELDS = [
  { key: "flow", label: "상세 진행안", placeholder: "오프닝 → 설명 → 본 활동 → 마무리 순으로 적어주세요.", rows: 8 },
  { key: "rules", label: "규칙·안전", placeholder: "판정 기준, 금지 사항, 안전 수칙", rows: 6 },
  { key: "script", label: "진행자 대본", placeholder: "시작 멘트부터 전환·마무리 멘트까지", rows: 10 },
] as const;

const RECORD_FIELDS = [
  { key: "briefing", label: "교사·스탭 브리핑", placeholder: "역할, 준비 시간, 주의할 점", rows: 5 },
  { key: "ideas", label: "아이디어", placeholder: "후보로 나왔던 안, 참고 자료", rows: 5 },
  { key: "decisions", label: "회의록·결정 사항", placeholder: "언제 무엇을 왜 정했는지", rows: 6 },
  { key: "notes", label: "메모", placeholder: "미정 사항, 논의가 필요한 내용", rows: 4 },
] as const;

export default function ProgramEditor({
  program,
  canEdit,
  saving,
  resetVersion = 0,
  onSave,
  onDirtyChange,
  onRequestDelete,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  section,
  onCreatePost, onUpdatePost, onDeletePost,
  onRestorePost, onRestoreItem, onRestoreRole, onRestoreMatch,
  onCreateMatch, onUpdateMatch, onDeleteMatch,
  onCreateRole, onUpdateRole, onDeleteRole,
  onCreateItem, onUpdateItem, onDeleteItem,
}: Props) {
  const { toast } = useUI();
  const programRef = useRef(program);
  programRef.current = program;
  const [draft, setDraft] = useState<EditableProgram>(() => withoutTasks(program));
  const [dirtyState, setDirtyState] = useState(false);
  const dirty = dirtyState;
  // 동기화 판단은 effect 안에서 즉시 읽어야 하므로 ref와 상태를 함께 움직인다.
  const dirtyRef = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  }, []);
  const syncedRef = useRef({ id: program.id, resetVersion });
  const [remoteUpdated, setRemoteUpdated] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", assignee: "", dueDate: "" });
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);

  useEffect(() => {
    // 자식 task만 갱신될 때 작성 중인 본문을 덮지 않고, 프로그램이나 저장 버전이 바뀔 때만 동기화한다.
    // 편집 중에 들어온 갱신은 다른 사람의 저장이므로 덮지 않고 배너로 알린다.
    const next = { id: program.id, resetVersion };
    if (!shouldSyncEditorDraft({ dirty: dirtyRef.current, previous: syncedRef.current, next })) {
      setRemoteUpdated(true);
      return;
    }
    syncedRef.current = next;
    setDraft(withoutTasks(programRef.current));
    setDirty(false);
    setRemoteUpdated(false);
  }, [program.id, program.updatedAt, resetVersion, setDirty]);

  /** 배너의 "새로 불러오기" — 작성 중이던 내용을 버리고 서버 값으로 맞춘다. */
  function reloadFromServer() {
    syncedRef.current = { id: program.id, resetVersion };
    setDraft(withoutTasks(programRef.current));
    setDirty(false);
    setRemoteUpdated(false);
  }

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const readiness = useMemo(() => programReadiness({ ...program, ...draft }), [draft, program]);
  const tasks = useMemo(() => programTasks(program), [program]);
  const posts = useMemo(() => programPosts(program), [program]);
  const doneTasks = tasks.filter((task) => task.done).length;

  function setField<K extends keyof EditableProgram>(key: K, value: EditableProgram[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  }

  async function save() {
    if (!draft.title.trim()) {
      toast("프로그램 이름을 입력해주세요.", "warning");
      return;
    }
    try {
      await onSave({ ...draft, title: draft.title.trim() });
      setDirty(false);
    } catch {
      // 저장 함수가 사용자 안내를 담당한다. 실패 시 편집 내용과 dirty 상태를 보존한다.
    }
  }

  async function addTask() {
    const title = taskForm.title.trim();
    if (!title) return;
    setTaskBusy(true);
    try {
      await onCreateTask({
        title,
        assignee: taskForm.assignee.trim() || undefined,
        dueDate: taskForm.dueDate || undefined,
        done: false,
      });
      setTaskForm({ title: "", assignee: "", dueDate: "" });
    } catch (error) {
      toast(error instanceof Error ? error.message : "할 일을 추가하지 못했습니다.", "error");
    } finally {
      setTaskBusy(false);
    }
  }

  async function toggleTask(taskId: string, done: boolean) {
    setTaskBusyId(taskId);
    try {
      await onUpdateTask(taskId, { done });
    } catch (error) {
      toast(error instanceof Error ? error.message : "할 일 상태를 바꾸지 못했습니다.", "error");
    } finally {
      setTaskBusyId(null);
    }
  }

  async function removeTask(taskId: string) {
    setTaskBusyId(taskId);
    try {
      await onDeleteTask(taskId);
    } catch (error) {
      toast(error instanceof Error ? error.message : "할 일을 삭제하지 못했습니다.", "error");
    } finally {
      setTaskBusyId(null);
    }
  }

  return (
    <section className="program-editor" aria-labelledby="program-editor-title">
      <div className="program-editor-heading">
        <div>
          <span>{programStatusMeta(draft.status).label}</span>
          <h2 id="program-editor-title">{draft.title || "이름 없는 프로그램"}</h2>
          <p>{programStatusMeta(draft.status).description}</p>
        </div>
        <div className="program-readiness" aria-label={`핵심 준비 ${readiness.ready}/${readiness.total}`}>
          <strong>{readiness.percent}%</strong>
          <span>핵심 준비 {readiness.ready}/{readiness.total}</span>
        </div>
      </div>

      {remoteUpdated && (
        <div className="program-remote-updated" role="status">
          <WarningCircle aria-hidden="true" size={17} weight="fill" />
          <span>다른 사람이 이 프로그램을 수정했습니다. 지금 저장하면 그 변경을 덮어씁니다.</span>
          <button type="button" className="btn-secondary btn-sm" onClick={reloadFromServer}>새로 불러오기</button>
        </div>
      )}

      {section === "overview" && readiness.missingLabels.length > 0 && (
        <div className="program-missing" role="status">
          <WarningCircle aria-hidden="true" size={17} weight="fill" />
          <span>아직 필요해요: {readiness.missingLabels.join(" · ")}</span>
        </div>
      )}

      {section === "overview" && (
        <fieldset disabled={!canEdit || saving} className="program-form">
          <section className="program-form-section">
            <h3>기본 정보</h3>
            <div className="program-form-grid">
              <label className="program-field program-field--wide">
                <span>프로그램 이름</span>
                <input className="input" value={draft.title} maxLength={80} onChange={(event) => setField("title", event.target.value)} />
              </label>
              <label className="program-field">
                <span>유형</span>
                <select className="input" value={draft.kind} onChange={(event) => setField("kind", event.target.value as RetreatProgramKind)}>
                  {Object.entries(PROGRAM_KIND_META).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="program-field">
                <span>상태</span>
                <select className="input" value={draft.status} onChange={(event) => setField("status", event.target.value as RetreatProgramStatus)}>
                  {Object.entries(PROGRAM_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                </select>
              </label>
              <label className="program-field"><span>날짜</span><input type="date" className="input" value={draft.date ?? ""} onChange={(event) => setField("date", event.target.value)} /></label>
              <label className="program-field"><span>시작</span><input type="time" className="input" value={draft.startTime ?? ""} onChange={(event) => setField("startTime", event.target.value)} /></label>
              <label className="program-field"><span>종료</span><input type="time" className="input" value={draft.endTime ?? ""} onChange={(event) => setField("endTime", event.target.value)} /></label>
              <label className="program-field"><span>장소</span><input className="input" value={draft.place ?? ""} maxLength={80} onChange={(event) => setField("place", event.target.value)} placeholder="본당, 체육관" /></label>
              <label className="program-field"><span>총괄</span><input className="input" value={draft.lead ?? ""} maxLength={60} onChange={(event) => setField("lead", event.target.value)} placeholder="주 담당자" /></label>
              <label className="program-field"><span>담당 팀</span><input className="input" value={draft.team ?? ""} maxLength={80} onChange={(event) => setField("team", event.target.value)} placeholder="프로그램팀" /></label>
              <label className="program-field"><span>주제</span><input className="input" value={draft.theme ?? ""} maxLength={120} onChange={(event) => setField("theme", event.target.value)} /></label>
              <label className="program-field program-field--wide"><span>말씀</span><input className="input" value={draft.scripture ?? ""} maxLength={160} onChange={(event) => setField("scripture", event.target.value)} placeholder="요한복음 13:34" /></label>
            </div>
          </section>
          <section className="program-form-section">
            <h3>목표·요약</h3>
            <div className="program-text-fields">
              {OVERVIEW_FIELDS.map((field) => (
                <label key={field.key} className="program-field">
                  <span>{field.label}</span>
                  <textarea className="input" rows={field.rows} maxLength={6000} value={(draft[field.key] as string | undefined) ?? ""} onChange={(event) => setField(field.key, event.target.value)} placeholder={field.placeholder} />
                </label>
              ))}
            </div>
          </section>
        </fieldset>
      )}

      {section === "flow" && (
        <fieldset disabled={!canEdit || saving} className="program-form">
          <section className="program-form-section">
            <h3>진행안·대본</h3>
            <p className="program-section-hint">시간표(큐시트)는 이가드 현장의 큐싯이 단일 원본입니다. 여기에는 이 프로그램 안에서의 순서와 멘트를 적습니다.</p>
            <div className="program-text-fields">
              {FLOW_FIELDS.map((field) => (
                <label key={field.key} className="program-field">
                  <span>{field.label}</span>
                  <textarea className="input" rows={field.rows} maxLength={6000} value={(draft[field.key] as string | undefined) ?? ""} onChange={(event) => setField(field.key, event.target.value)} placeholder={field.placeholder} />
                </label>
              ))}
            </div>
          </section>
        </fieldset>
      )}

      {section === "posts" && (
        <ProgramPostsSection posts={posts} canEdit={canEdit} onCreate={onCreatePost} onUpdate={onUpdatePost} onDelete={onDeletePost}
          onCreateMatch={onCreateMatch} onUpdateMatch={onUpdateMatch} onDeleteMatch={onDeleteMatch}
          itemsOf={(postId) => itemsOfPost(program, postId)} rolesOf={(postId) => rolesOfPost(program, postId)}
          onCreateItem={onCreateItem} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem}
          onCreateRole={onCreateRole} onUpdateRole={onUpdateRole} onDeleteRole={onDeleteRole}
          onRestore={onRestorePost} onRestoreItem={onRestoreItem} onRestoreRole={onRestoreRole} onRestoreMatch={onRestoreMatch} />
      )}

      {section === "roles" && (
        <ProgramRolesSection groups={groupRolesByPost(program)} canEdit={canEdit} onCreate={onCreateRole} onUpdate={onUpdateRole} onDelete={onDeleteRole} onRestore={onRestoreRole} />
      )}

      {section === "items" && (
        <>
          <ProgramItemsSection groups={groupItemsByPost(program)} canEdit={canEdit} onCreate={onCreateItem} onUpdate={onUpdateItem} onDelete={onDeleteItem} onRestore={onRestoreItem} />
          <fieldset disabled={!canEdit || saving} className="program-form">
            <section className="program-form-section">
              <h3>물품 메모</h3>
              <label className="program-field">
                <span>자유 기술</span>
                <textarea className="input" rows={4} maxLength={6000} value={draft.materials ?? ""} onChange={(event) => setField("materials", event.target.value)} placeholder="표로 적기 어려운 준비물·대여 정보" />
              </label>
            </section>
          </fieldset>
        </>
      )}

      {section === "tasks" && (
        <>
          <section className="program-task-section" aria-labelledby="program-task-heading">
            <div className="program-task-heading">
              <div><h3 id="program-task-heading">할 일</h3><p>{doneTasks}/{tasks.length} 완료</p></div>
            </div>
            {canEdit && (
              <div className="program-task-form">
                <label><span>할 일</span><input className="input" value={taskForm.title} maxLength={120} onChange={(event) => setTaskForm((previous) => ({ ...previous, title: event.target.value }))} placeholder="예: 교사 브리핑 초안 작성" /></label>
                <label><span>담당</span><input className="input" value={taskForm.assignee} maxLength={60} onChange={(event) => setTaskForm((previous) => ({ ...previous, assignee: event.target.value }))} /></label>
                <label><span>기한</span><input type="date" className="input" value={taskForm.dueDate} onChange={(event) => setTaskForm((previous) => ({ ...previous, dueDate: event.target.value }))} /></label>
                <button type="button" className="btn-secondary" onClick={() => void addTask()} disabled={taskBusy || !taskForm.title.trim()}><Plus aria-hidden="true" size={16} /> 추가</button>
              </div>
            )}
            {tasks.length === 0 ? (
              <p className="program-task-empty">아직 등록된 할 일이 없습니다.</p>
            ) : (
              <ul className="program-task-list">
                {tasks.map((task) => (
                  <li key={task.id} data-done={task.done ? "true" : undefined}>
                    <button type="button" disabled={!canEdit || taskBusyId === task.id} aria-busy={taskBusyId === task.id} onClick={() => void toggleTask(task.id, !task.done)} aria-label={`${task.title} ${task.done ? "미완료로 변경" : "완료로 변경"}`}>
                      {task.done ? <CheckCircle aria-hidden="true" size={21} weight="fill" /> : <Circle aria-hidden="true" size={21} />}
                    </button>
                    <div><strong>{task.title}</strong><span>{[task.assignee, task.dueDate].filter(Boolean).join(" · ") || "담당·기한 미정"}</span></div>
                    {canEdit && <button type="button" className="program-task-delete" disabled={taskBusyId === task.id} onClick={() => void removeTask(task.id)} aria-label={`${task.title} 삭제`}><Trash aria-hidden="true" size={16} /></button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <fieldset disabled={!canEdit || saving} className="program-form">
            <section className="program-form-section">
              <h3>브리핑·기록</h3>
              <div className="program-text-fields">
                {RECORD_FIELDS.map((field) => (
                  <label key={field.key} className="program-field">
                    <span>{field.label}</span>
                    <textarea className="input" rows={field.rows} maxLength={6000} value={(draft[field.key] as string | undefined) ?? ""} onChange={(event) => setField(field.key, event.target.value)} placeholder={field.placeholder} />
                  </label>
                ))}
              </div>
            </section>
          </fieldset>
        </>
      )}

      <div className="program-editor-actions">
        {canEdit && <button type="button" className="btn-danger" disabled={saving} onClick={() => onRequestDelete(program)}><Trash aria-hidden="true" size={16} /> 프로그램 삭제</button>}
        <span className="program-dirty-state" aria-live="polite">{dirty ? "저장하지 않은 변경이 있습니다." : "최신 내용이 저장되어 있습니다."}</span>
        {canEdit && <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "저장 중…" : "변경 사항 저장"}</button>}
      </div>
    </section>
  );
}

/**
 * 본문 저장 payload에서 하위 컬렉션을 전부 걷어낸다.
 * 하나라도 남으면 `update()`가 그 맵을 통째로 덮어써서, 다른 사람이 그 사이 추가한
 * 게임·물품·역할·할 일이 조용히 사라진다(루트 실수 2).
 */
function withoutTasks(program: RetreatProgram): EditableProgram {
  const copy: Partial<RetreatProgram> = { ...program };
  delete copy.tasks;
  delete copy.posts;
  delete copy.items;
  delete copy.roles;
  return copy as EditableProgram;
}
