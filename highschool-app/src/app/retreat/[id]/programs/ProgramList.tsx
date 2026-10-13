"use client";

import { ArrowRight } from "@phosphor-icons/react";
import {
  PROGRAM_TASK_STATUS_META, programReadiness, programTaskProgress, programTaskStatus, programTasks,
} from "@/lib/programPreparation";
import { seoulDateKey } from "@/features/portal/dailyMinistryMessage";
import type { RetreatProgram } from "@/lib/types";

type Props = {
  programs: RetreatProgram[];
  busy: boolean;
  onSelect: (id: string) => void;
  onOpenPrograms: () => void;
};

function dueLabel(value?: string | null) {
  if (!value) return "기한 미정";
  const today = seoulDateKey();
  if (value < today) return `기한 지남 · ${value.slice(5).replace("-", "/")}`;
  if (value === today) return "오늘까지";
  return `${value.slice(5).replace("-", "/")}까지`;
}

export default function ProgramList({ programs, busy, onSelect, onOpenPrograms }: Props) {
  const progress = programs.map((program) => ({ program, task: programTaskProgress(program), field: programReadiness(program) }));
  const actionCounts = progress.reduce((sum, entry) => ({
    overdue: sum.overdue + entry.task.overdue,
    blocked: sum.blocked + entry.task.blocked + Object.values(entry.program.posts ?? {}).filter((post) => post.blocker?.trim()).length,
    unassigned: sum.unassigned + entry.task.unassigned,
    fieldMissing: sum.fieldMissing + (entry.field.total - entry.field.ready),
  }), { overdue: 0, blocked: 0, unassigned: 0, fieldMissing: 0 });
  const nextTasks = programs.flatMap((program) => programTasks(program)
    .filter((task) => programTaskStatus(task) !== "done")
    .map((task) => ({ program, task })))
    .sort((a, b) => (a.task.dueDate || "9999-12-31").localeCompare(b.task.dueDate || "9999-12-31") || a.task.createdAt - b.task.createdAt)
    .slice(0, 8);

  return (
    <div className="program-dashboard">
      <section className="program-attention" aria-labelledby="program-attention-heading">
        <div className="program-attention__heading">
          <div><h2 id="program-attention-heading">지금 처리할 것</h2></div>
          <button type="button" className="btn-primary" onClick={onOpenPrograms} disabled={busy}>프로그램 준비 열기<ArrowRight aria-hidden="true" size={16} /></button>
        </div>
        <div className="program-attention__signals">
          <span data-alert={actionCounts.overdue > 0 ? "true" : undefined}><b>{actionCounts.overdue}</b> 기한 지남</span>
          <span data-alert={actionCounts.blocked > 0 ? "true" : undefined}><b>{actionCounts.blocked}</b> 막힌 준비</span>
          <span data-alert={actionCounts.unassigned > 0 ? "true" : undefined}><b>{actionCounts.unassigned}</b> 담당 없음</span>
          <span><b>{actionCounts.fieldMissing}</b> 현장 점검 남음</span>
        </div>
      </section>

      <section className="program-global-tasks" aria-labelledby="program-global-tasks-heading">
        <div className="program-list-heading"><div><h2 id="program-global-tasks-heading">다가오는 할 일</h2></div></div>
        {nextTasks.length === 0 ? <p className="program-task-empty">{programs.length === 0 ? "아직 프로그램이 없습니다." : "아직 할 일이 없습니다."}</p> : <ul>{nextTasks.map(({ program, task }) => (
          <li key={`${program.id}-${task.id}`}><button type="button" disabled={busy} onClick={() => onSelect(program.id)}>
            <span data-status={programTaskStatus(task)}>{PROGRAM_TASK_STATUS_META[programTaskStatus(task)]}</span><strong>{task.title}</strong><small>{program.title}</small><em>{task.assignee?.trim() || "담당 없음"} · {dueLabel(task.dueDate)}</em><ArrowRight aria-hidden="true" size={16} />
          </button></li>
        ))}</ul>}
      </section>
    </div>
  );
}
