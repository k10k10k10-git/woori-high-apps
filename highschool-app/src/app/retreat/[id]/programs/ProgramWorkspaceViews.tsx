"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  FileText,
  MapPin,
  Plus,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  PROGRAM_ACTIVITY_TYPE_META,
  PROGRAM_FULFILLMENT_STATUS_META,
  PROGRAM_TASK_STATUS_META,
  PROGRAM_TEMPLATE_META,
  canPublishProgram,
  programActualSpend,
  programActivityType,
  programBudget,
  programFormatLabels,
  programFulfillmentStatus,
  programItems,
  programKindMeta,
  programMeetings,
  programPosts,
  programReadiness,
  programReleases,
  programScheduleConflicts,
  programStatusMeta,
  programTaskProgress,
  programTaskStatus,
  programTasks,
  type ProgramSectionKey,
  type ProgramTemplateKey,
} from "@/lib/programPreparation";
import { useUI } from "@/context/UIContext";
import type { RetreatProgram, RetreatProgramFulfillmentStatus, RetreatProgramItem, RetreatProgramSettlementStatus, RetreatProgramTask } from "@/lib/types";
import ProgramAutosaveField from "./ProgramAutosaveField";

type OpenProgram = (programId: string, section?: ProgramSectionKey) => void;

export function catalogNextAction(program: RetreatProgram): { label: string; section: ProgramSectionKey } {
  const title = program.title.trim();
  if (!title || /^프로그램\s*\d+$/u.test(title) || !program.lead?.trim()) {
    return { label: "이름과 담당자를 먼저 정해 주세요", section: "overview" };
  }
  if (programPosts(program).length === 0) {
    return { label: "진행 순서를 만들어 주세요", section: "posts" };
  }
  const missing = programReadiness(program).items.find((item) => !item.ready);
  if (missing) return { label: missing.action, section: missing.section };
  const tasks = programTaskProgress(program);
  if (tasks.done < tasks.total) return { label: "남은 할 일을 완료해 주세요", section: "overview" };
  if (program.status !== "published") return { label: "최종 확인 후 현장에 공유해 주세요", section: "tasks" };
  return { label: "현장에 공유된 내용을 확인하세요", section: "tasks" };
}

function EmptyWorkspace({ title }: { title: string }) {
  return <div className="program-workspace-empty"><strong>{title}</strong></div>;
}

function SectionHeading({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <header className="program-workspace-section-heading">
      <div><h2>{title}</h2></div>
      {aside}
    </header>
  );
}

export function ProgramCatalog({
  programs, canEdit, busy, onOpen, onAdd, onCreateDefaults, onMove,
}: {
  programs: RetreatProgram[];
  canEdit: boolean;
  busy: boolean;
  onOpen: OpenProgram;
  onAdd: (template: ProgramTemplateKey) => void;
  onCreateDefaults: () => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = programs.map((program, index) => ({ program, index })).filter(({ program }) => {
    const haystack = [program.title, program.lead, program.team, program.place, ...programFormatLabels(program)].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
    return haystack.includes(query.trim().toLocaleLowerCase("ko-KR"));
  });

  return (
    <section className="program-workspace-surface">
      <SectionHeading
        title="프로그램 준비"
        aside={canEdit && programs.length > 0 ? (
          <details className="program-add-menu">
            <summary><Plus aria-hidden="true" size={16} weight="bold" /> 새 프로그램 만들기</summary>
            <div>{(Object.entries(PROGRAM_TEMPLATE_META) as Array<[ProgramTemplateKey, (typeof PROGRAM_TEMPLATE_META)[ProgramTemplateKey]]>).map(([key, meta]) => (
              <button key={key} type="button" onClick={() => onAdd(key)} disabled={busy}><strong>{meta.label}</strong><span>{meta.description}</span></button>
            ))}</div>
          </details>
        ) : undefined}
      />
      {programs.length === 0 && canEdit && <div className="program-template-grid program-catalog-templates">
        {(Object.entries(PROGRAM_TEMPLATE_META) as Array<[ProgramTemplateKey, (typeof PROGRAM_TEMPLATE_META)[ProgramTemplateKey]]>).map(([key, meta]) => (
          <button key={key} type="button" className={key === "blank" ? "program-template-option program-template-option--quiet" : "program-template-option"} onClick={() => onAdd(key)} disabled={busy}>
            <strong>{meta.label}</strong><span>{meta.description}</span><ArrowRight aria-hidden="true" size={17} />
          </button>
        ))}
        <button type="button" className="btn-secondary program-template-default" onClick={onCreateDefaults} disabled={busy}>직접 작성할 프로그램 2개 만들기</button>
      </div>}
      {(programs.length > 4 || query.trim().length > 0) && <label className="program-workspace-search"><span>프로그램 찾기</span><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 담당, 장소로 검색" /></label>}
      {filtered.length === 0 ? <EmptyWorkspace title={query ? "검색 결과가 없습니다" : "프로그램이 없습니다"} /> : (
        <div className="program-catalog-list">
          {filtered.map(({ program, index }) => {
            const readiness = programReadiness(program);
            const tasks = programTaskProgress(program);
            const next = catalogNextAction(program);
            const summary = [program.date, program.startTime, program.lead?.trim(), program.place?.trim()].filter(Boolean).join(" · ");
            return (
              <article key={program.id} className="program-catalog-entry" aria-label={program.title}>
              <button type="button" className="program-catalog-row" disabled={busy} onClick={() => onOpen(program.id, next.section)}>
                <span className="program-catalog-row__number">{String(index + 1).padStart(2, "0")}</span>
                <span className="program-catalog-row__main">
                  <small>{programKindMeta(program.kind)} · {programStatusMeta(program.status).label}</small>
                  <strong>{program.title}</strong>
                  <span>{summary || "기본 정보를 입력해 주세요"}</span>
                </span>
                <span className="program-catalog-row__next"><small>다음 할 일</small><strong>{next.label}</strong></span>
                <span className="program-catalog-row__progress"><span><b>{tasks.done}/{tasks.total}</b><small>작업 완료</small></span><span><b>{readiness.ready}/{readiness.total}</b><small>현장 점검</small></span></span>
                <ArrowRight aria-hidden="true" size={18} />
              </button>
              {canEdit && programs.length > 1 && <div className="program-order-controls" role="group" aria-label={`${program.title} 순서 변경`}>
                <button type="button" onClick={() => onMove(program.id, -1)} disabled={busy || index === 0} aria-label="앞으로 이동"><ArrowUp aria-hidden="true" size={14} /></button>
                <button type="button" onClick={() => onMove(program.id, 1)} disabled={busy || index === programs.length - 1} aria-label="뒤로 이동"><ArrowDown aria-hidden="true" size={14} /></button>
              </div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ProgramScheduleWorkspace({ programs, onOpen }: { programs: RetreatProgram[]; onOpen: OpenProgram }) {
  const conflicts = useMemo(() => programScheduleConflicts(programs), [programs]);
  const incomplete = programs.filter((program) => !program.date || !program.startTime || !program.place?.trim()).length;
  const sorted = [...programs].sort((a, b) => `${a.date || "9999"} ${a.startTime || "99:99"}`.localeCompare(`${b.date || "9999"} ${b.startTime || "99:99"}`));

  return (
    <section className="program-workspace-surface">
      <SectionHeading title="시간·장소" aside={<div className="program-workspace-pulse"><span data-alert={conflicts.length > 0 || undefined}>{conflicts.length} 충돌</span><span>{incomplete} 미정</span></div>} />
      {conflicts.length > 0 && <div className="program-workspace-alert" role="alert"><WarningCircle aria-hidden="true" size={18} weight="fill" /><span><strong>같은 장소에 시간이 겹치는 프로그램이 있습니다.</strong> 각 프로그램을 열어 확정 시간을 조정해 주세요.</span></div>}
      {sorted.length === 0 ? <EmptyWorkspace title="배치할 프로그램이 없습니다" /> : (
        <div className="program-schedule-list">
          {sorted.map((program) => {
            const posts = programPosts(program);
            const conflict = conflicts.some((entry) => entry.firstId === program.id || entry.secondId === program.id);
            return (
              <article key={program.id} className="program-schedule-row" data-conflict={conflict || undefined}>
                <button type="button" className="program-schedule-row__summary" onClick={() => onOpen(program.id, "overview")}>
                  <span className="program-schedule-row__time"><b>{program.startTime || "--:--"}</b><small>{program.endTime || "종료 미정"}</small></span>
                  <span className="program-schedule-row__title"><small>{program.date || "날짜 미정"}</small><strong>{program.title}</strong><em>{program.lead?.trim() || "담당 미정"}</em></span>
                  <span><MapPin aria-hidden="true" size={16} /> {program.place?.trim() || "장소 미정"}</span>
                  <ArrowRight aria-hidden="true" size={17} />
                </button>
                {posts.length > 0 && <ol className="program-schedule-activities">{posts.map((post, index) => (
                  <li key={post.id}>
                    <span>{index + 1}</span>
                    <b>{post.startTime || "순서"}</b>
                    <strong>{post.name}</strong>
                    <small>{PROGRAM_ACTIVITY_TYPE_META[programActivityType(post)].label}</small>
                    <em>{post.place?.trim() || program.place?.trim() || "장소 미정"}</em>
                    <i>{post.staff?.trim() || "담당 미정"}</i>
                  </li>
                ))}</ol>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ProgramSupplyWorkspace({
  programs, canEdit, onOpen, onUpdateItem,
}: {
  programs: RetreatProgram[];
  canEdit: boolean;
  onOpen: OpenProgram;
  onUpdateItem: (programId: string, itemId: string, data: Partial<RetreatProgramItem>) => Promise<void>;
}) {
  const { toast } = useUI();
  const entries = programs.flatMap((program) => programItems(program).map((item) => ({ program, item })));
  const budget = programBudget(entries.map(({ item }) => item));
  const actual = programActualSpend(entries.map(({ item }) => item));
  const onsite = entries.filter(({ item }) => programFulfillmentStatus(item) === "onsite").length;
  const [busyId, setBusyId] = useState<string | null>(null);

  async function changeStage(programId: string, itemId: string, status: RetreatProgramFulfillmentStatus) {
    setBusyId(`${programId}-${itemId}`);
    try { await onUpdateItem(programId, itemId, { fulfillmentStatus: status }); }
    catch (error) { toast(error instanceof Error ? error.message : "준비 단계를 저장하지 못했습니다.", "error"); }
    finally { setBusyId(null); }
  }

  async function changeSettlement(programId: string, itemId: string, status: RetreatProgramSettlementStatus) {
    setBusyId(`${programId}-${itemId}`);
    try { await onUpdateItem(programId, itemId, { settlementStatus: status }); }
    catch (error) { toast(error instanceof Error ? error.message : "정산 상태를 저장하지 못했습니다.", "error"); }
    finally { setBusyId(null); }
  }

  return (
    <section className="program-workspace-surface">
      <SectionHeading title="물품·비용" />
      <div className="program-supply-summary" aria-label="물품과 비용 요약">
        <span><small>전체 요청</small><strong>{entries.length}건</strong></span>
        <span><small>현장 도착</small><strong>{onsite}건</strong></span>
        <span><small>예상 비용</small><strong>{budget.total.toLocaleString("ko-KR")}원</strong></span>
        <span><small>실제 지출</small><strong>{actual.toLocaleString("ko-KR")}원</strong></span>
      </div>
      {entries.length === 0 ? <EmptyWorkspace title="등록된 준비물이 없습니다" /> : (
        <div className="program-table-scroll program-workspace-table-wrap"><table className="program-table program-workspace-table">
          <thead><tr><th>프로그램</th><th>물품</th><th>수량</th><th>준비 단계</th><th>담당</th><th>보관·배부</th><th>예상</th><th>실제</th><th>정산</th></tr></thead>
          <tbody>{entries.map(({ program, item }) => <tr key={`${program.id}-${item.id}`}>
            <td><button type="button" className="program-table-link" onClick={() => onOpen(program.id, "roles")}>{program.title}</button></td>
            <td><strong>{item.name}</strong></td>
            <td>{item.quantity ?? "–"}</td>
            <td><select className="input" aria-label={`${item.name} 준비 단계`} disabled={!canEdit || busyId === `${program.id}-${item.id}`} value={programFulfillmentStatus(item)} onChange={(event) => void changeStage(program.id, item.id, event.target.value as RetreatProgramFulfillmentStatus)}>{Object.entries(PROGRAM_FULFILLMENT_STATUS_META).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
            <td><ProgramAutosaveField value={item.assignee ?? ""} ariaLabel={`${item.name} 담당`} placeholder="담당 미정" maxLength={60} disabled={!canEdit} onSave={(next) => onUpdateItem(program.id, item.id, { assignee: next })} errorMessage="담당을 저장하지 못했습니다." /></td>
            <td><ProgramAutosaveField value={item.storagePlace ?? ""} ariaLabel={`${item.name} 보관·배부 위치`} placeholder="위치 미정" maxLength={80} disabled={!canEdit} onSave={(next) => onUpdateItem(program.id, item.id, { storagePlace: next })} errorMessage="보관 위치를 저장하지 못했습니다." /></td>
            <td>{((item.quantity ?? 0) * (item.unitPrice ?? 0)).toLocaleString("ko-KR")}원</td>
            <td><ProgramAutosaveField value={item.actualAmount ?? ""} ariaLabel={`${item.name} 실제 지출`} placeholder="미정" inputMode="numeric" className="program-number" disabled={!canEdit} normalize={(next) => next.replace(/[^0-9]/g, "")} onSave={(next) => onUpdateItem(program.id, item.id, { actualAmount: next ? Number(next) : 0 })} errorMessage="실제 지출을 저장하지 못했습니다." /></td>
            <td><select className="input" aria-label={`${item.name} 정산 상태`} disabled={!canEdit || busyId === `${program.id}-${item.id}`} value={item.settlementStatus ?? "pending"} onChange={(event) => void changeSettlement(program.id, item.id, event.target.value as RetreatProgramSettlementStatus)}><option value="notNeeded">정산 불필요</option><option value="pending">정산 대기</option><option value="submitted">증빙 제출</option><option value="settled">정산 완료</option></select></td>
          </tr>)}</tbody>
        </table></div>
      )}
    </section>
  );
}

export function ProgramCollaborationWorkspace({
  programs, canEdit, onOpen, onUpdateTask,
}: {
  programs: RetreatProgram[];
  canEdit: boolean;
  onOpen: OpenProgram;
  onUpdateTask: (programId: string, taskId: string, data: Partial<RetreatProgramTask>) => Promise<void>;
}) {
  const { toast } = useUI();
  const [filter, setFilter] = useState<"open" | "blocked" | "done">("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const entries = programs.flatMap((program) => programTasks(program).map((task) => ({ program, task }))).filter(({ task }) => {
    const status = programTaskStatus(task);
    return filter === "open" ? status !== "done" : filter === "blocked" ? status === "blocked" : status === "done";
  });
  const meetingCount = programs.reduce((sum, program) => sum + programMeetings(program).length, 0);

  async function changeTaskStatus(programId: string, taskId: string, status: NonNullable<RetreatProgramTask["status"]>) {
    setBusyId(`${programId}-${taskId}`);
    try { await onUpdateTask(programId, taskId, { status, done: status === "done" }); }
    catch (error) { toast(error instanceof Error ? error.message : "할 일 상태를 저장하지 못했습니다.", "error"); }
    finally { setBusyId(null); }
  }

  return (
    <section className="program-workspace-surface">
      <SectionHeading title="담당자·할 일" aside={<span className="program-workspace-count">회의 {meetingCount}회</span>} />
      <div className="program-segmented" role="group" aria-label="할 일 필터">
        <button type="button" data-active={filter === "open" || undefined} onClick={() => setFilter("open")}>진행할 일</button>
        <button type="button" data-active={filter === "blocked" || undefined} onClick={() => setFilter("blocked")}>막힌 일</button>
        <button type="button" data-active={filter === "done" || undefined} onClick={() => setFilter("done")}>완료</button>
      </div>
      {entries.length === 0 ? <EmptyWorkspace title="이 조건에 맞는 할 일이 없습니다" /> : (
        <ul className="program-collaboration-list">{entries.map(({ program, task }) => <li key={`${program.id}-${task.id}`} data-status={programTaskStatus(task)}>
          <select className="input" aria-label={`${task.title} 상태`} disabled={!canEdit || busyId === `${program.id}-${task.id}`} value={programTaskStatus(task)} onChange={(event) => void changeTaskStatus(program.id, task.id, event.target.value as NonNullable<RetreatProgramTask["status"]>)}>{Object.entries(PROGRAM_TASK_STATUS_META).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button type="button" onClick={() => onOpen(program.id, "overview")}><strong>{task.title}</strong><small>{program.title} · {task.assignee?.trim() || "담당 미정"}</small>{task.blocker?.trim() && <span>{task.blocker}</span>}</button>
          <time>{task.dueDate || "기한 미정"}</time>
          <ArrowRight aria-hidden="true" size={16} />
        </li>)}</ul>
      )}
    </section>
  );
}

export function ProgramResourcesWorkspace({ programs, onOpen }: { programs: RetreatProgram[]; onOpen: OpenProgram }) {
  if (programs.length === 0) return <section className="program-workspace-surface"><SectionHeading title="현장 공유" /><EmptyWorkspace title="확인할 프로그램이 없습니다" /></section>;
  return (
    <section className="program-workspace-surface">
      <SectionHeading title="현장 공유" />
      <div className="program-resource-list">{programs.map((program) => {
        const readiness = programReadiness(program);
        const releases = programReleases(program);
        const publishable = canPublishProgram(program);
        const documents = [program.briefing?.trim() && "교사 브리핑", program.script?.trim() && "진행자 대본", program.rules?.trim() && "규칙·안전", program.ideas?.trim() && "기획 기록"].filter(Boolean) as string[];
        return <article key={program.id} data-published={program.status === "published" || undefined}>
          <div className="program-resource-list__status">{program.status === "published" ? <CheckCircle aria-hidden="true" size={21} weight="fill" /> : <FileText aria-hidden="true" size={21} />}<span>{programStatusMeta(program.status).label}{releases.length > 0 ? ` · 배포본 ${releases.length}` : ""}</span></div>
          <div><strong>{program.title}</strong><p>{documents.length ? documents.join(" · ") : "작성된 브리핑·대본 없음"}</p></div>
          <div className="program-resource-list__readiness"><b>{readiness.percent}%</b><small>{publishable ? "현장 공유 가능" : `${readiness.total - readiness.ready}개 점검 남음`}</small></div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => onOpen(program.id, "tasks")}>자료·공유 확인 <ArrowRight aria-hidden="true" size={15} /></button>
        </article>;
      })}</div>
    </section>
  );
}
