"use client";

import { ArrowDown, ArrowRight, ArrowUp, CalendarBlank, Plus, WarningCircle } from "@phosphor-icons/react";
import {
  PROGRAM_TASK_STATUS_META, PROGRAM_TEMPLATE_META, programKindMeta, programReadiness,
  programStatusMeta, programTaskProgress, programTaskStatus, programTasks, type ProgramTemplateKey,
} from "@/lib/programPreparation";
import { seoulDateKey } from "@/features/portal/dailyMinistryMessage";
import type { RetreatProgram } from "@/lib/types";

type Props = {
  programs: RetreatProgram[];
  selectedId: string | null;
  canEdit: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onAddTemplate: (template: ProgramTemplateKey) => void;
  onCreateDefaults: () => void;
  onMove: (id: string, direction: -1 | 1) => void;
};

function dueLabel(value?: string | null) {
  if (!value) return "기한 미정";
  const today = seoulDateKey();
  if (value < today) return `기한 지남 · ${value.slice(5).replace("-", "/")}`;
  if (value === today) return "오늘까지";
  return `${value.slice(5).replace("-", "/")}까지`;
}

export default function ProgramList({ programs, selectedId, canEdit, busy, onSelect, onAddTemplate, onCreateDefaults, onMove }: Props) {
  if (programs.length === 0) {
    return (
      <section className="program-empty" aria-labelledby="program-empty-heading">
        <div><h2 id="program-empty-heading">어떤 방식으로 준비할까요?</h2><p>빈 문서 대신 실제 진행 방식에서 시작하세요. 만든 뒤에는 서로 다른 방식을 자유롭게 섞을 수 있습니다.</p></div>
        {canEdit && (
          <div className="program-template-grid">
            {(Object.entries(PROGRAM_TEMPLATE_META) as Array<[ProgramTemplateKey, (typeof PROGRAM_TEMPLATE_META)[ProgramTemplateKey]]>).map(([key, meta]) => (
              <button key={key} type="button" className={key === "blank" ? "program-template-option program-template-option--quiet" : "program-template-option"} onClick={() => onAddTemplate(key)} disabled={busy}>
                <strong>{meta.label}</strong><span>{meta.description}</span><ArrowRight aria-hidden="true" size={17} />
              </button>
            ))}
            <button type="button" className="btn-secondary program-template-default" onClick={onCreateDefaults} disabled={busy}>빈 프로그램 2개 만들기</button>
          </div>
        )}
      </section>
    );
  }

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
          <div><h2 id="program-attention-heading">지금 처리할 것</h2><p>프로그램을 열기 전에 막힌 준비부터 확인합니다.</p></div>
          {canEdit && (
            <details className="program-add-menu">
              <summary><Plus aria-hidden="true" size={16} weight="bold" /> 프로그램 추가</summary>
              <div>{(Object.entries(PROGRAM_TEMPLATE_META) as Array<[ProgramTemplateKey, (typeof PROGRAM_TEMPLATE_META)[ProgramTemplateKey]]>).map(([key, meta]) => (
                <button key={key} type="button" onClick={() => onAddTemplate(key)} disabled={busy}><strong>{meta.label}</strong><span>{meta.description}</span></button>
              ))}</div>
            </details>
          )}
        </div>
        <div className="program-attention__signals">
          <span data-alert={actionCounts.overdue > 0 ? "true" : undefined}><b>{actionCounts.overdue}</b> 기한 지남</span>
          <span data-alert={actionCounts.blocked > 0 ? "true" : undefined}><b>{actionCounts.blocked}</b> 막힌 준비</span>
          <span data-alert={actionCounts.unassigned > 0 ? "true" : undefined}><b>{actionCounts.unassigned}</b> 담당 없음</span>
          <span><b>{actionCounts.fieldMissing}</b> 현장 점검 남음</span>
        </div>
      </section>

      <section className="program-board" aria-labelledby="program-board-heading">
        <div className="program-list-heading"><div><h2 id="program-board-heading">프로그램 준비 현황</h2><p>작업 진행과 현장 점검을 분리해 봅니다.</p></div></div>
        <div className="program-board__grid">
          {progress.map(({ program, task, field }, index) => {
            const openTasks = programTasks(program).filter((entry) => programTaskStatus(entry) !== "done");
            const next = [...openTasks].sort((a, b) => {
              const blockedRank = Number(programTaskStatus(b) === "blocked") - Number(programTaskStatus(a) === "blocked");
              return blockedRank || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.createdAt - b.createdAt;
            })[0];
            return (
              <article key={program.id} className="program-board-card" data-selected={selectedId === program.id ? "true" : undefined}>
                <button type="button" className="program-board-card__main" disabled={busy} onClick={() => onSelect(program.id)}>
                  <span className="program-board-card__meta">{index + 1} · {programKindMeta(program.kind)} · {programStatusMeta(program.status).label}</span>
                  <strong>{program.title}</strong>
                  <div className="program-board-card__progress"><span><b>{task.done}/{task.total}</b> 작업 완료</span><span><b>{field.ready}/{field.total}</b> 현장 점검</span></div>
                  <div className="program-board-card__next">
                    {next && programTaskStatus(next) === "blocked" ? <WarningCircle aria-hidden="true" size={17} weight="fill" /> : <CalendarBlank aria-hidden="true" size={17} />}
                    <span>{next ? <><small>다음 할 일</small><b>{next.title}</b><em>{dueLabel(next.dueDate)}</em></> : <><small>다음 할 일</small><b>등록된 작업이 없습니다</b><em>작업실에서 추가</em></>}</span>
                    <ArrowRight aria-hidden="true" size={17} />
                  </div>
                </button>
                {canEdit && programs.length > 1 && <div className="program-order-controls" aria-label={`${program.title} 순서 변경`}>
                  <button type="button" onClick={() => onMove(program.id, -1)} disabled={busy || index === 0} aria-label="앞으로 이동"><ArrowUp aria-hidden="true" size={14} /></button>
                  <button type="button" onClick={() => onMove(program.id, 1)} disabled={busy || index === programs.length - 1} aria-label="뒤로 이동"><ArrowDown aria-hidden="true" size={14} /></button>
                </div>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="program-global-tasks" aria-labelledby="program-global-tasks-heading">
        <div className="program-list-heading"><div><h2 id="program-global-tasks-heading">다가오는 할 일</h2><p>모든 프로그램의 미완료 작업을 기한순으로 모았습니다.</p></div></div>
        {nextTasks.length === 0 ? <p className="program-task-empty">아직 할 일이 없습니다. 프로그램 작업실에서 첫 작업을 등록해 주세요.</p> : <ul>{nextTasks.map(({ program, task }) => (
          <li key={`${program.id}-${task.id}`}><button type="button" onClick={() => onSelect(program.id)}>
            <span data-status={programTaskStatus(task)}>{PROGRAM_TASK_STATUS_META[programTaskStatus(task)]}</span><strong>{task.title}</strong><small>{program.title}</small><em>{task.assignee?.trim() || "담당 없음"} · {dueLabel(task.dueDate)}</em><ArrowRight aria-hidden="true" size={16} />
          </button></li>
        ))}</ul>}
      </section>
    </div>
  );
}
