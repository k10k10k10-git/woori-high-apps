"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  FileText,
  MapPin,
  Package,
  Plus,
  UsersThree,
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

function EmptyWorkspace({ title, description }: { title: string; description: string }) {
  return <div className="program-workspace-empty"><strong>{title}</strong><p>{description}</p></div>;
}

function SectionHeading({ title, description, aside }: { title: string; description: string; aside?: React.ReactNode }) {
  return (
    <header className="program-workspace-section-heading">
      <div><h2>{title}</h2><p>{description}</p></div>
      {aside}
    </header>
  );
}

export function ProgramCatalog({
  programs, canEdit, busy, onOpen, onAdd,
}: {
  programs: RetreatProgram[];
  canEdit: boolean;
  busy: boolean;
  onOpen: OpenProgram;
  onAdd: (template: ProgramTemplateKey) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = programs.filter((program) => {
    const haystack = [program.title, program.lead, program.team, program.place, ...programFormatLabels(program)].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
    return haystack.includes(query.trim().toLocaleLowerCase("ko-KR"));
  });

  return (
    <section className="program-workspace-surface">
      <SectionHeading
        title="프로그램"
        description="수련회 안의 프로그램을 각각 관리하고, 한 프로그램 안에서도 여러 진행 형식을 섞을 수 있습니다."
        aside={canEdit ? (
          <details className="program-add-menu">
            <summary><Plus aria-hidden="true" size={16} weight="bold" /> 프로그램 추가</summary>
            <div>{(Object.entries(PROGRAM_TEMPLATE_META) as Array<[ProgramTemplateKey, (typeof PROGRAM_TEMPLATE_META)[ProgramTemplateKey]]>).map(([key, meta]) => (
              <button key={key} type="button" onClick={() => onAdd(key)} disabled={busy}><strong>{meta.label}</strong><span>{meta.description}</span></button>
            ))}</div>
          </details>
        ) : undefined}
      />
      {programs.length > 4 && <label className="program-workspace-search"><span>프로그램 찾기</span><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 담당, 장소로 검색" /></label>}
      {filtered.length === 0 ? <EmptyWorkspace title={query ? "검색 결과가 없습니다" : "프로그램이 없습니다"} description={query ? "검색어를 바꾸거나 전체 목록으로 돌아가세요." : "진행 형식에서 시작하면 기본 활동까지 함께 만들어집니다."} /> : (
        <div className="program-catalog-list">
          {filtered.map((program, index) => {
            const readiness = programReadiness(program);
            const tasks = programTaskProgress(program);
            const formats = programFormatLabels(program);
            return (
              <button key={program.id} type="button" className="program-catalog-row" onClick={() => onOpen(program.id, "overview")}>
                <span className="program-catalog-row__number">{String(index + 1).padStart(2, "0")}</span>
                <span className="program-catalog-row__main">
                  <small>{programKindMeta(program.kind)} · {programStatusMeta(program.status).label}</small>
                  <strong>{program.title}</strong>
                  <span>{formats.length ? formats.slice(0, 4).join(" · ") : "활동 형식 미정"}</span>
                </span>
                <span className="program-catalog-row__when"><CalendarBlank aria-hidden="true" size={16} />{program.date || "날짜 미정"}<br />{program.startTime || "시간 미정"}</span>
                <span className="program-catalog-row__owner"><UsersThree aria-hidden="true" size={16} />{program.lead?.trim() || "담당 미정"}<br />{program.place?.trim() || "장소 미정"}</span>
                <span className="program-catalog-row__progress"><b>{readiness.ready}/{readiness.total}</b> 현장 점검<small>{tasks.done}/{tasks.total} 할 일 완료</small></span>
                <ArrowRight aria-hidden="true" size={18} />
              </button>
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
      <SectionHeading title="일정·배치" description="프로그램과 활동의 시간·장소·담당을 한 흐름으로 봅니다. 수정은 연결된 프로그램 원본에 한 번만 반영합니다." aside={<div className="program-workspace-pulse"><span data-alert={conflicts.length > 0 || undefined}>{conflicts.length} 충돌</span><span>{incomplete} 미정</span></div>} />
      {conflicts.length > 0 && <div className="program-workspace-alert" role="alert"><WarningCircle aria-hidden="true" size={18} weight="fill" /><span><strong>같은 장소에 시간이 겹치는 프로그램이 있습니다.</strong> 각 프로그램을 열어 확정 시간을 조정해 주세요.</span></div>}
      {sorted.length === 0 ? <EmptyWorkspace title="배치할 프로그램이 없습니다" description="프로그램을 만든 뒤 날짜·시간·장소를 지정하세요." /> : (
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
      <SectionHeading title="물품·비용" description="모든 프로그램의 요청을 모아 주문, 수령, 포장, 현장 도착과 실제 지출을 구분합니다." />
      <div className="program-supply-summary" aria-label="물품과 비용 요약">
        <span><small>전체 요청</small><strong>{entries.length}건</strong></span>
        <span><small>현장 도착</small><strong>{onsite}건</strong></span>
        <span><small>예상 비용</small><strong>{budget.total.toLocaleString("ko-KR")}원</strong></span>
        <span><small>실제 지출</small><strong>{actual.toLocaleString("ko-KR")}원</strong></span>
      </div>
      {entries.length === 0 ? <EmptyWorkspace title="등록된 물품이 없습니다" description="활동 작업실에서 활동별 준비물을 넣으면 이곳에 자동으로 모입니다." /> : (
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
      <SectionHeading title="회의·할 일" description="프로그램별 회의 결정과 실행 업무를 한곳에서 찾습니다. 상세 회의록은 권한 있는 담당자만 프로그램에서 엽니다." aside={<span className="program-workspace-count">회의 {meetingCount}회</span>} />
      <div className="program-segmented" role="group" aria-label="할 일 필터">
        <button type="button" data-active={filter === "open" || undefined} onClick={() => setFilter("open")}>진행할 일</button>
        <button type="button" data-active={filter === "blocked" || undefined} onClick={() => setFilter("blocked")}>막힌 일</button>
        <button type="button" data-active={filter === "done" || undefined} onClick={() => setFilter("done")}>완료</button>
      </div>
      {entries.length === 0 ? <EmptyWorkspace title="이 조건에 맞는 할 일이 없습니다" description="프로그램을 열어 회의를 시작하거나 첫 실행 업무를 추가하세요." /> : (
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
  if (programs.length === 0) return <section className="program-workspace-surface"><SectionHeading title="자료·현장" description="브리핑, 대본과 현장 공유 상태를 함께 확인합니다." /><EmptyWorkspace title="확인할 프로그램이 없습니다" description="프로그램을 만든 뒤 자료와 현장 공유 상태를 관리하세요." /></section>;
  return (
    <section className="program-workspace-surface">
      <SectionHeading title="자료·현장" description="브리핑과 진행자 대본을 확인하고, 준비가 끝난 프로그램만 현장에 공유합니다." />
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
      <div className="program-workspace-note"><Package aria-hidden="true" size={18} /><span><strong>현장 공유와 실제 준비 완료는 별도입니다.</strong> 브리핑을 먼저 공유해도 물품 도착·리허설 상태는 준비 현황에 계속 남습니다.</span></div>
    </section>
  );
}
