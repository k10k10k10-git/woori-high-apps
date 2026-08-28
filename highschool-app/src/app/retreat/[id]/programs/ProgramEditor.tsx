"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Circle, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { useUI } from "@/context/UIContext";
import {
  createRetreatProgramTask,
  deleteRetreatProgramTask,
  updateRetreatProgramTask,
} from "@/lib/db";
import { PROGRAM_KIND_META, PROGRAM_STATUS_META, programReadiness, programTasks } from "@/lib/programPreparation";
import type { RetreatProgram, RetreatProgramKind, RetreatProgramStatus } from "@/lib/types";

type EditableProgram = Omit<RetreatProgram, "tasks">;

type Props = {
  retreatId: string;
  program: RetreatProgram;
  canEdit: boolean;
  saving: boolean;
  onSave: (program: EditableProgram) => Promise<void>;
  onRequestDelete: (program: RetreatProgram) => void;
};

const TEXT_FIELDS = [
  { key: "objective", label: "목표", placeholder: "이 프로그램으로 학생과 공동체가 얻어야 할 것", rows: 3 },
  { key: "summary", label: "기획 요약", placeholder: "처음 읽는 사람도 이해할 수 있는 전체 구성", rows: 4 },
  { key: "flow", label: "상세 진행안", placeholder: "오프닝 → 설명 → 본 활동 → 마무리 순으로 적어주세요.", rows: 7 },
  { key: "rules", label: "규칙·안전", placeholder: "판정 기준, 금지 사항, 안전 수칙", rows: 5 },
  { key: "briefing", label: "교사·스탭 브리핑", placeholder: "역할, 준비 시간, 주의할 점", rows: 5 },
  { key: "script", label: "진행자 대본", placeholder: "시작 멘트부터 전환·마무리 멘트까지", rows: 7 },
  { key: "materials", label: "물품·자료", placeholder: "필요한 물품과 수량을 한 줄에 하나씩 적어주세요.", rows: 5 },
  { key: "notes", label: "메모", placeholder: "미정 사항, 논의가 필요한 내용", rows: 4 },
] as const;

export default function ProgramEditor({ retreatId, program, canEdit, saving, onSave, onRequestDelete }: Props) {
  const { toast } = useUI();
  const programRef = useRef(program);
  programRef.current = program;
  const [draft, setDraft] = useState<EditableProgram>(() => withoutTasks(program));
  const [dirty, setDirty] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", assignee: "", dueDate: "" });
  const [taskBusy, setTaskBusy] = useState(false);

  useEffect(() => {
    // 자식 task만 갱신될 때 작성 중인 본문을 덮지 않고, 프로그램이나 저장 버전이 바뀔 때만 동기화한다.
    setDraft(withoutTasks(programRef.current));
    setDirty(false);
  }, [program.id, program.updatedAt]);

  const readiness = useMemo(() => programReadiness({ ...program, ...draft }), [draft, program]);
  const tasks = useMemo(() => programTasks(program), [program]);
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
    await onSave({ ...draft, title: draft.title.trim() });
    setDirty(false);
  }

  async function addTask() {
    const title = taskForm.title.trim();
    if (!title) return;
    setTaskBusy(true);
    try {
      await createRetreatProgramTask(retreatId, program.id, {
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
    try {
      await updateRetreatProgramTask(retreatId, program.id, taskId, { done });
    } catch (error) {
      toast(error instanceof Error ? error.message : "할 일 상태를 바꾸지 못했습니다.", "error");
    }
  }

  async function removeTask(taskId: string) {
    try {
      await deleteRetreatProgramTask(retreatId, program.id, taskId);
    } catch (error) {
      toast(error instanceof Error ? error.message : "할 일을 삭제하지 못했습니다.", "error");
    }
  }

  return (
    <section className="program-editor" aria-labelledby="program-editor-title">
      <div className="program-editor-heading">
        <div>
          <span>{PROGRAM_STATUS_META[draft.status].label}</span>
          <h2 id="program-editor-title">{draft.title || "이름 없는 프로그램"}</h2>
          <p>{PROGRAM_STATUS_META[draft.status].description}</p>
        </div>
        <div className="program-readiness" aria-label={`핵심 준비 ${readiness.ready}/${readiness.total}`}>
          <strong>{readiness.percent}%</strong>
          <span>핵심 준비 {readiness.ready}/{readiness.total}</span>
        </div>
      </div>

      {readiness.missingLabels.length > 0 && (
        <div className="program-missing" role="status">
          <WarningCircle aria-hidden="true" size={17} weight="fill" />
          <span>아직 필요해요: {readiness.missingLabels.join(" · ")}</span>
        </div>
      )}

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
          <h3>기획·진행</h3>
          <div className="program-text-fields">
            {TEXT_FIELDS.map((field) => (
              <label key={field.key} className="program-field">
                <span>{field.label}</span>
                <textarea className="input" rows={field.rows} maxLength={6000} value={(draft[field.key] as string | undefined) ?? ""} onChange={(event) => setField(field.key, event.target.value)} placeholder={field.placeholder} />
              </label>
            ))}
          </div>
        </section>
      </fieldset>

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
                <button type="button" disabled={!canEdit} onClick={() => void toggleTask(task.id, !task.done)} aria-label={`${task.title} ${task.done ? "미완료로 변경" : "완료로 변경"}`}>
                  {task.done ? <CheckCircle aria-hidden="true" size={21} weight="fill" /> : <Circle aria-hidden="true" size={21} />}
                </button>
                <div><strong>{task.title}</strong><span>{[task.assignee, task.dueDate].filter(Boolean).join(" · ") || "담당·기한 미정"}</span></div>
                {canEdit && <button type="button" className="program-task-delete" onClick={() => void removeTask(task.id)} aria-label={`${task.title} 삭제`}><Trash aria-hidden="true" size={16} /></button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="program-editor-actions">
        {canEdit && <button type="button" className="btn-danger" onClick={() => onRequestDelete(program)}><Trash aria-hidden="true" size={16} /> 프로그램 삭제</button>}
        <span className="program-dirty-state" aria-live="polite">{dirty ? "저장하지 않은 변경이 있습니다." : "최신 내용이 저장되어 있습니다."}</span>
        {canEdit && <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "저장 중…" : "변경 사항 저장"}</button>}
      </div>
    </section>
  );
}

function withoutTasks(program: RetreatProgram): EditableProgram {
  const copy: Partial<RetreatProgram> = { ...program };
  delete copy.tasks;
  return copy as EditableProgram;
}
