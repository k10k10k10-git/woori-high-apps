"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { listPraiseAccounts, listPraiseReferences } from "../api";
import { personName, stampTime } from "./shared";
import GuideContent from "../content/GuideContent";
import { createFirstMeetingGuide } from "../content/templates";
import type { PraiseGuideRole, PraiseGuideStep, PraiseMeetingGuide } from "../content/types";
import { PRAISE_ROLE_LABELS, PRAISE_ROLE_OPTIONS, type PraiseCommand, type PraiseMeetingInput, type PraisePendingAttendanceReview, type PraiseView } from "../types";

type CommandOf<T extends PraiseCommand["type"]> = Extract<PraiseCommand, { type: T }>;
type Draft<T> = { value: T; revision: number };
type Props = { view: PraiseView; execute: (command: PraiseCommand) => Promise<boolean>; busy: boolean };
type AccountOption = { uid: string; name: string; roleLabel: string };
type SemesterOption = { id: string; title: string; startDate?: string; endDate?: string; teams: { id: string; name: string }[] };
const buttonClass = "praise-button";
const primaryClass = "praise-button praise-button--primary";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="praise-field"><span>{label}</span>{children}</label>;
}
function Check({ label, value, change }: { label: string; value: boolean; change: (value: boolean) => void }) {
  return <label className="praise-check"><input type="checkbox" checked={value} onChange={(event) => change(event.target.checked)} />{label}</label>;
}
function LineField({ label, value, change }: { label: string; value: string[]; change: (value: string[]) => void }) {
  return <Field label={label}><textarea rows={Math.min(8, Math.max(3, value.length))} value={value.join("\n")} onChange={(event) => change(event.target.value.split("\n"))} /></Field>;
}
function Actions({ cancel, saveLabel }: { cancel: () => void; saveLabel: string }) {
  return <div className="praise-toolbar"><button className={primaryClass} type="submit">{saveLabel}</button><button className={buttonClass} type="button" onClick={cancel}>취소</button></div>;
}
const cleanLines = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);
function cleanGuide(content: PraiseMeetingGuide): PraiseMeetingGuide {
  return {
    ...content, title: content.title.trim(), description: content.description.trim(), location: content.location.trim(), interviewLocation: content.interviewLocation.trim(),
    preparation: cleanLines(content.preparation), interviewGuidelines: cleanLines(content.interviewGuidelines), fallbacks: cleanLines(content.fallbacks),
    roles: content.roles.map((role) => ({ ...role, title: role.title.trim(), responsibilities: cleanLines(role.responsibilities) })),
    steps: content.steps.map((step) => ({ ...step, title: step.title.trim(), instructions: cleanLines(step.instructions) })),
  };
}
function newId(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }

function GuideEditor({ content, change }: { content: PraiseMeetingGuide; change: (value: PraiseMeetingGuide) => void }) {
  const patch = (value: Partial<PraiseMeetingGuide>) => change({ ...content, ...value });
  const rolePatch = (index: number, value: Partial<PraiseGuideRole>) => patch({ roles: content.roles.map((role, at) => at === index ? { ...role, ...value } : role) });
  const stepPatch = (index: number, value: Partial<PraiseGuideStep>) => patch({ steps: content.steps.map((step, at) => at === index ? { ...step, ...value } : step) });
  return <>
    <div className="praise-form-grid">
      <Field label="가이드 제목"><input required value={content.title} onChange={(event) => patch({ title: event.target.value })} /></Field>
      <Field label="전체 운영 시간(분)"><input type="number" min="0" max="600" required value={content.durationMinutes} onChange={(event) => patch({ durationMinutes: Number(event.target.value) })} /></Field>
      <Field label="나눔 장소"><input value={content.location} onChange={(event) => patch({ location: event.target.value })} /></Field>
      <Field label="면접 장소"><input value={content.interviewLocation} onChange={(event) => patch({ interviewLocation: event.target.value })} /></Field>
    </div>
    <Field label="가이드 설명"><textarea rows={3} value={content.description} onChange={(event) => patch({ description: event.target.value })} /></Field>
    <LineField label="준비물·사전 준비 (한 줄에 하나)" value={content.preparation} change={(preparation) => patch({ preparation })} />
    <h4>역할별 안내</h4>
    {content.roles.map((role, index) => <div className="praise-section" key={role.id}>
      <Field label={`역할 ${index + 1} 이름`}><input required value={role.title} onChange={(event) => rolePatch(index, { title: event.target.value })} /></Field>
      <LineField label={`역할 ${index + 1} 안내 (한 줄에 하나)`} value={role.responsibilities} change={(responsibilities) => rolePatch(index, { responsibilities })} />
      <button type="button" className={buttonClass} onClick={() => patch({ roles: content.roles.filter((_, at) => at !== index) })}>역할 {index + 1} 삭제</button>
    </div>)}
    <button type="button" className={buttonClass} onClick={() => patch({ roles: [...content.roles, { id: newId("role"), title: "", responsibilities: [] }] })}>역할 추가</button>
    <h4>진행 순서</h4>
    {content.steps.map((step, index) => <div className="praise-section" key={step.id}>
      <div className="praise-form-grid">
        <Field label={`순서 ${index + 1} 제목`}><input required value={step.title} onChange={(event) => stepPatch(index, { title: event.target.value })} /></Field>
        <Field label={`순서 ${index + 1} 시간(분)`}><input type="number" min="0" max="600" required value={step.durationMinutes} onChange={(event) => stepPatch(index, { durationMinutes: Number(event.target.value) })} /></Field>
      </div>
      <LineField label={`순서 ${index + 1} 진행 안내 (한 줄에 하나)`} value={step.instructions} change={(instructions) => stepPatch(index, { instructions })} />
      <div className="praise-toolbar">
        <button type="button" className={buttonClass} disabled={index === 0} onClick={() => { const steps = [...content.steps]; [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]; patch({ steps }); }}>순서 {index + 1} 위로</button>
        <button type="button" className={buttonClass} disabled={index === content.steps.length - 1} onClick={() => { const steps = [...content.steps]; [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]]; patch({ steps }); }}>순서 {index + 1} 아래로</button>
        <button type="button" className={buttonClass} onClick={() => patch({ steps: content.steps.filter((_, at) => at !== index) })}>순서 {index + 1} 삭제</button>
      </div>
    </div>)}
    <button type="button" className={buttonClass} onClick={() => patch({ steps: [...content.steps, { id: newId("step"), title: "", durationMinutes: 10, instructions: [] }] })}>진행 순서 추가</button>
    <LineField label="면접 진행 참고 (한 줄에 하나)" value={content.interviewGuidelines} change={(interviewGuidelines) => patch({ interviewGuidelines })} />
    <LineField label="현장 상황별 안내 (한 줄에 하나)" value={content.fallbacks} change={(fallbacks) => patch({ fallbacks })} />
  </>;
}

function SharedAttendanceReviewRow({ review, view, disabled, resolve }: {
  review: PraisePendingAttendanceReview;
  view: PraiseView;
  disabled: boolean;
  resolve: (command: CommandOf<"attendance.resolve">) => Promise<void>;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const headingId = useId(), explanationId = useId();
  const meeting = view.meetings.find((item) => item.id === review.meetingId);
  const person = personName(view, review.personId);
  const heading = `${meeting?.date ?? "모임일 확인 필요"} · ${meeting?.title ?? "연결된 모임 확인 필요"} · ${person}`;
  const status = (value: PraisePendingAttendanceReview["status"]) => value === "PRESENT" ? "출석" : value === "ABSENT" ? "결석" : "미입력";
  const action = review.canFinalize ? "감사 기록 완료" : "원장 변경 없이 요청 종료";
  return <form className="praise-disclosure" aria-labelledby={headingId} aria-describedby={explanationId} onSubmit={(event) => {
    event.preventDefault();
    if (!acknowledged || disabled) return;
    void resolve({ type: "attendance.resolve", pendingOperationId: review.operationId,
      resolution: review.canFinalize ? "finalize" : "close", expectedSourceRevision: review.sourceRevision, acknowledge: true });
  }}>
    <h4 id={headingId} className="break-words">{heading}</h4>
    <p className="praise-note">요청 시각: {Number.isFinite(review.requestedAt) && review.requestedAt > 0 ? stampTime(review.requestedAt) : "확인 필요"} (한국 시간)</p>
    <div className="praise-toolbar">
      <p><span className="praise-note">요청한 출석</span> <strong>{status(review.status)}</strong></p>
      <p><span className="praise-note">현재 출석</span> <strong>{status(review.currentStatus)}</strong></p>
      <p><span className="praise-note">저장 증거</span> <strong>{review.canFinalize ? "확인됨" : "확인되지 않음"}</strong></p>
    </div>
    <p className="praise-note" id={explanationId}>{review.canFinalize
      ? "해당 요청이 저장된 증거가 있습니다. 현재 출석은 유지하고 원래 요청의 감사 기록을 완료합니다."
      : "저장 성공을 확정할 증거가 없습니다. 현재 출석을 유지한 채 요청을 종료합니다. 출석 변경이 필요하면 종료 후 출석 화면에서 다시 입력해 주세요."}</p>
    <div className="praise-save-bar">
      <label className="praise-check min-h-11"><input type="checkbox" checked={acknowledged} disabled={disabled}
        onChange={(event) => setAcknowledged(event.target.checked)} />현재 출석과 요청 내용을 확인했습니다.</label>
      <button type="submit" className={review.canFinalize ? primaryClass : buttonClass} disabled={disabled || !acknowledged}>{action}</button>
    </div>
  </form>;
}

function PraiseSettingsWorkspace({ view, execute, busy }: Props) {
  const [metaDraft, setMetaDraft] = useState<Draft<CommandOf<"meta.save">["meta"]> | null>(null);
  const [meetingDraft, setMeetingDraft] = useState<Draft<PraiseMeetingInput> | null>(null);
  const [accessDraft, setAccessDraft] = useState<Draft<CommandOf<"access.save">["access"]> | null>(null);
  const [policyDraft, setPolicyDraft] = useState<Draft<CommandOf<"policy.save">["policy"]> | null>(null);
  const [guideDraft, setGuideDraft] = useState<Draft<CommandOf<"guide.save">["guide"]> | null>(null);
  const [meetingSelection, setMeetingSelection] = useState("");
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState("");
  const [accountsRetry, setAccountsRetry] = useState(0);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [referencesError, setReferencesError] = useState("");
  const [referencesRetry, setReferencesRetry] = useState(0);
  const disabled = busy || saving;
  const dataLocked = view.meta.status === "archived" || view.meta.mode === "shadow";
  const importModeLocked = view.meta.mode === "shadow" && Boolean(view.meta.importBlockers?.length);
  const hasLinkedMeetings = view.meetings.some((meeting) => meeting.linkedSessionId);
  const selectedMeetingId = meetingSelection || view.meetings[0]?.id || "";
  const selectedGuide = view.guides.find((guide) => guide.meetingId === selectedMeetingId);
  const staff = view.people.filter((person) => person.kind === "STAFF");
  const editingAccount = !!accessDraft;
  const editingMeta = !!metaDraft;
  const selectedSemester = semesters.find((semester) => semester.id === metaDraft?.value.semesterId);
  const teams = selectedSemester?.teams ?? [];

  useEffect(() => {
    if (!view.permissions.manage || !editingMeta) return;
    const controller = new AbortController(); let active = true;
    setReferencesLoading(true); setReferencesError("");
    void listPraiseReferences(view.meta.id, controller.signal).then((result) => {
      if (active) { setSemesters(result.semesters); setReferencesLoading(false); }
    }).catch((reason: unknown) => {
      if (active) { setReferencesLoading(false); setReferencesError(reason instanceof Error ? reason.message : "학기와 사역팀을 불러오지 못했습니다."); }
    });
    return () => { active = false; controller.abort(); };
  }, [view.meta.id, view.permissions.manage, editingMeta, referencesRetry]);

  useEffect(() => {
    if (!view.permissions.manage || !editingAccount || dataLocked) return;
    const controller = new AbortController(); let active = true;
    setAccountsLoading(true); setAccountsError("");
    void listPraiseAccounts(view.meta.id, controller.signal).then((result) => {
      if (active) { setAccounts(result.accounts); setAccountsLoading(false); }
    }).catch((reason: unknown) => {
      if (active) { setAccountsLoading(false); setAccountsError(reason instanceof Error ? reason.message : "담당 계정을 불러오지 못했습니다."); }
    });
    return () => { active = false; controller.abort(); };
  }, [view.meta.id, view.permissions.manage, editingAccount, accountsRetry, dataLocked]);

  async function save(event: FormEvent, command: PraiseCommand, done: () => void) {
    event.preventDefault();
    if (!view.permissions.manage || disabled || savingLock.current || (command.type !== "meta.save" && dataLocked)) return;
    if (command.type === "guide.save" && command.guide.published && (!command.guide.content.title || !command.guide.content.location || !command.guide.content.steps.length)) {
      setError("게시 전에 가이드 제목·나눔 장소·진행 순서를 입력해 주세요."); return;
    }
    if (command.type === "access.save" && command.expectedRevision === 0 && (accountsLoading || !!accountsError || !accounts.some((account) => account.uid === command.access.uid))) {
      setError("등록 계정 목록에서 담당자를 선택해 주세요."); return;
    }
    if (command.type === "access.save" && command.access.active && view.access.some((access) => access.active && access.staffId === command.access.staffId && access.uid !== command.access.uid)) {
      setError("이 스탭에는 다른 담당 계정이 연결되어 있습니다. 기존 연결을 먼저 확인해 주세요."); return;
    }
    savingLock.current = true; setSaving(true); setError(null); setNotice(null);
    try {
      if (await execute(command)) { done(); setNotice("설정을 저장했습니다."); }
      else setError("저장하지 못했습니다. 입력 내용은 유지됩니다. 오류 내용을 확인한 뒤 다시 시도해 주세요.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { savingLock.current = false; setSaving(false); }
  }
  async function resolveAttendance(command: CommandOf<"attendance.resolve">) {
    if (!view.permissions.manage || disabled || savingLock.current) return;
    const current = view.pendingAttendance?.find((review) => review.operationId === command.pendingOperationId);
    if (!current || current.sourceRevision !== command.expectedSourceRevision || current.canFinalize !== (command.resolution === "finalize")) {
      setError("검토할 출석 상태가 변경됐습니다. 현재 내용을 다시 확인해 주세요."); return;
    }
    savingLock.current = true; setSaving(true); setError(null); setNotice(null);
    try {
      if (await execute(command)) {
        setNotice(command.resolution === "finalize"
          ? "저장 증거를 확인하고 원래 요청의 감사 기록을 완료했습니다. 현재 출석은 유지됩니다."
          : "현재 출석을 변경하지 않고 요청을 종료했습니다.");
        reviewHeadingRef.current?.focus();
      }
      else setError("검토 처리를 완료하지 못했습니다. 오류 안내와 현재 출석을 확인한 뒤 다시 시도해 주세요.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "검토 처리를 완료하지 못했습니다. 현재 출석을 확인한 뒤 다시 시도해 주세요.");
    } finally { savingLock.current = false; setSaving(false); }
  }
  const clearMessage = () => { setError(null); setNotice(null); };
  function editGuide(template: boolean) {
    if (!selectedMeetingId) return;
    clearMessage();
    setGuideDraft({ revision: selectedGuide?.revision ?? 0, value: { meetingId: selectedMeetingId, published: selectedGuide?.published ?? false, content: template ? createFirstMeetingGuide() : structuredClone(selectedGuide?.content ?? createFirstMeetingGuide()) } });
  }

  if (!view.permissions.manage) return <section className="praise-section"><h3>운영 설정</h3><p className="praise-note">운영 설정은 운영 책임자만 변경할 수 있습니다.</p></section>;

  return <div>
    {error && <p className="praise-note" role="alert">{error}</p>}
    {notice && <p className="praise-note" role="status">{notice}</p>}
    <section className="praise-section" aria-label="공통 출석 저장 검토" aria-busy={saving}>
      <div className="praise-section-heading"><div><h3 ref={reviewHeadingRef} tabIndex={-1}>공통 출석 저장 검토</h3><p>저장 결과가 불확실한 요청을 확인하고, 현재 출석을 유지하면서 처리합니다.</p></div><span className="praise-count">{view.pendingAttendance?.length ?? 0}건</span></div>
      {!view.pendingAttendance?.length ? <p className="praise-note">검토 대기 중인 공통 출석 요청이 없습니다.</p> : <>
        {view.pendingAttendance.length >= 50 && <p className="praise-note">먼저 접수된 요청부터 최대 50건을 표시합니다.</p>}
        {view.pendingAttendance.map((review) => <SharedAttendanceReviewRow
          key={`${review.operationId}:${review.sourceRevision}:${review.canFinalize}:${review.phase}:${review.status}:${review.currentStatus}`}
          review={review} view={view} disabled={disabled} resolve={resolveAttendance} />)}
      </>}
    </section>
    <section className="praise-section" aria-label="팀 운영 기간 설정">
      <div className="praise-toolbar"><h3>팀 운영 기간 설정</h3>{!metaDraft && <button type="button" className={buttonClass} disabled={disabled} onClick={() => { clearMessage(); const { name, startDate, endDate, status, mode, semesterId, teamId } = view.meta; setMetaDraft({ revision: view.meta.revision, value: { name, startDate, endDate, status, mode, semesterId: semesterId ?? "", teamId: teamId ?? "" } }); }}>운영 기간 편집</button>}</div>
      {!metaDraft ? <p className="praise-note">{view.meta.name} · {view.meta.startDate} ~ {view.meta.endDate} · {view.meta.status === "active" ? "활성" : "보관"} · {{ setup: "준비", shadow: "비교 운영", live: "실운영" }[view.meta.mode]}</p> : <form onSubmit={(event) => save(event, { type: "meta.save", expectedRevision: metaDraft.revision, meta: { ...metaDraft.value, name: metaDraft.value.name.trim(), semesterId: metaDraft.value.semesterId?.trim() ?? "", teamId: metaDraft.value.teamId?.trim() ?? "" } }, () => setMetaDraft(null))}><fieldset disabled={disabled}>
        <div className="praise-form-grid">
          <Field label="운영 이름"><input required value={metaDraft.value.name} onChange={(event) => setMetaDraft({ ...metaDraft, value: { ...metaDraft.value, name: event.target.value } })} /></Field>
          <Field label="시작일"><input type="date" required value={metaDraft.value.startDate} onChange={(event) => setMetaDraft({ ...metaDraft, value: { ...metaDraft.value, startDate: event.target.value } })} /></Field>
          <Field label="종료일"><input type="date" required min={metaDraft.value.startDate} value={metaDraft.value.endDate} onChange={(event) => setMetaDraft({ ...metaDraft, value: { ...metaDraft.value, endDate: event.target.value } })} /></Field>
          <Field label="연결 학기"><select disabled={hasLinkedMeetings || referencesLoading || !!referencesError} value={metaDraft.value.semesterId ?? ""} onChange={(event) => setMetaDraft({ ...metaDraft, value: { ...metaDraft.value, semesterId: event.target.value, teamId: "" } })}><option value="">{referencesLoading ? "학기를 불러오는 중…" : "학기 연결 안 함"}</option>{metaDraft.value.semesterId && !selectedSemester && <option value={metaDraft.value.semesterId}>기존 연결 학기</option>}{semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.title}{semester.startDate ? ` · ${semester.startDate}` : ""}</option>)}</select></Field>
          <Field label="연결 사역팀"><select disabled={hasLinkedMeetings || referencesLoading || !!referencesError || !selectedSemester} value={metaDraft.value.teamId ?? ""} onChange={(event) => setMetaDraft({ ...metaDraft, value: { ...metaDraft.value, teamId: event.target.value } })}><option value="">사역팀 연결 안 함</option>{metaDraft.value.teamId && !teams.some((team) => team.id === metaDraft.value.teamId) && <option value={metaDraft.value.teamId}>기존 연결 사역팀</option>}{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></Field>
          <Field label="운영 모드"><select disabled={importModeLocked} value={metaDraft.value.mode} onChange={(event) => setMetaDraft({ ...metaDraft, value: { ...metaDraft.value, mode: event.target.value as typeof metaDraft.value.mode } })}><option value="setup">준비</option><option value="shadow">비교 운영</option><option value="live">실운영</option></select></Field>
        </div>
        {importModeLocked && <p className="praise-note">가져온 기록의 대조가 끝날 때까지 읽기 전용으로 유지됩니다.</p>}
        <Check label="운영 기간 활성" value={metaDraft.value.status === "active"} change={(active) => setMetaDraft({ ...metaDraft, value: { ...metaDraft.value, status: active ? "active" : "archived" } })} />
        <p className="praise-note">{hasLinkedMeetings ? "공통 출석에 연결된 회차가 있어 학기·사역팀 연결은 읽기 전용입니다." : "기존 학기와 사역팀을 선택해 연결합니다. 연결을 바꿔도 기존 명단이나 출석은 자동 변경되지 않습니다."}</p>
        {referencesError && <div className="praise-toolbar"><p className="praise-note" role="alert">{referencesError}</p><button type="button" className={buttonClass} onClick={() => setReferencesRetry((value) => value + 1)}>학기·사역팀 다시 불러오기</button></div>}
        {!referencesLoading && !referencesError && !semesters.length && <p className="praise-note">연결할 학기가 없습니다. 학기 사역에서 운영 학기를 먼저 등록해 주세요.</p>}
        <Actions cancel={() => setMetaDraft(null)} saveLabel="운영 기간 저장" />
      </fieldset></form>}
    </section>

    {dataLocked && <p className="praise-note" role="status">{view.meta.status === "archived" ? "보관된 운영 기간입니다. 운영 기간을 활성화한 뒤 아래 설정을 변경할 수 있습니다." : "비교 운영 중에는 아래 설정이 읽기 전용입니다. 팀 운영 모드를 전환한 뒤 변경할 수 있습니다."}</p>}
    <fieldset disabled={disabled || dataLocked}>
    <section className="praise-section" aria-label="회차 관리">
      <div className="praise-toolbar"><h3>회차 관리</h3><button type="button" className={buttonClass} disabled={disabled || !!meetingDraft} onClick={() => { clearMessage(); setMeetingDraft({ revision: 0, value: { id: newId("meeting"), date: view.meta.startDate, worshipDate: view.meta.startDate, sequence: Math.max(0, ...view.meetings.map((meeting) => meeting.sequence)) + 1, title: "", cancelled: false, temporary: false } }); }}>회차 추가</button></div>
      {view.meetings.length === 0 && <p className="praise-empty">등록된 회차가 없습니다.</p>}
      <div className="praise-table"><table><thead><tr><th scope="col">회차</th><th scope="col">모임일 / 예배일</th><th scope="col">상태</th><th scope="col">편집</th></tr></thead><tbody>{view.meetings.map((meeting) => <tr key={meeting.id}><td>{meeting.sequence}. {meeting.title}</td><td>{meeting.date} / {meeting.worshipDate}</td><td>{meeting.cancelled ? "휴강" : "진행"}{meeting.temporary ? " · 임시회차" : ""}</td><td><button type="button" className={buttonClass} disabled={disabled || !!meetingDraft} aria-label={`${meeting.title} 회차 편집`} onClick={() => { clearMessage(); const { revision, updatedAt: _at, updatedBy: _by, ...value } = meeting; void _at; void _by; setMeetingDraft({ revision, value: structuredClone(value) }); }}>편집</button></td></tr>)}</tbody></table></div>
      {meetingDraft && <form onSubmit={(event) => save(event, { type: "meeting.save", expectedRevision: meetingDraft.revision, meeting: { ...meetingDraft.value, title: meetingDraft.value.title.trim() } }, () => setMeetingDraft(null))}><fieldset disabled={disabled}>
        <h4>{meetingDraft.revision ? "회차 편집" : "새 회차"}</h4><div className="praise-form-grid">
          <Field label="회차 제목"><input required value={meetingDraft.value.title} onChange={(event) => setMeetingDraft({ ...meetingDraft, value: { ...meetingDraft.value, title: event.target.value } })} /></Field>
          <Field label="회차 번호"><input type="number" min="1" max="100" required value={meetingDraft.value.sequence} onChange={(event) => setMeetingDraft({ ...meetingDraft, value: { ...meetingDraft.value, sequence: Number(event.target.value) } })} /></Field>
          <Field label="모임일"><input type="date" required value={meetingDraft.value.date} onChange={(event) => setMeetingDraft({ ...meetingDraft, value: { ...meetingDraft.value, date: event.target.value } })} /></Field>
          <Field label="예배일"><input type="date" required value={meetingDraft.value.worshipDate} onChange={(event) => setMeetingDraft({ ...meetingDraft, value: { ...meetingDraft.value, worshipDate: event.target.value } })} /></Field>
        </div>
        {meetingDraft.value.linkedSessionId && <p className="praise-note">학기 출석과 연결된 회차입니다.</p>}
        <div className="praise-toolbar"><Check label="휴강" value={meetingDraft.value.cancelled} change={(cancelled) => setMeetingDraft({ ...meetingDraft, value: { ...meetingDraft.value, cancelled } })} /><Check label="임시회차" value={meetingDraft.value.temporary} change={(temporary) => setMeetingDraft({ ...meetingDraft, value: { ...meetingDraft.value, temporary } })} /></div>
        <Actions cancel={() => setMeetingDraft(null)} saveLabel="회차 저장" />
      </fieldset></form>}
    </section>

    <section className="praise-section" aria-label="담당 계정 연결">
      <div className="praise-toolbar"><h3>담당 계정 연결</h3><button type="button" className={buttonClass} disabled={disabled || !!accessDraft} onClick={() => { clearMessage(); setAccessDraft({ revision: 0, value: { uid: "", staffId: "", role: "member", active: true } }); }}>담당 계정 추가</button></div>
      <p className="praise-note">사이트에 등록된 계정과 찬양팀 스탭을 연결합니다. 선택한 역할은 이 찬양팀 작업공간에 적용됩니다.</p>
      {view.access.length === 0 && <p className="praise-empty">연결된 담당 계정이 없습니다.</p>}
      <div className="praise-table"><table><thead><tr><th scope="col">계정</th><th scope="col">스탭</th><th scope="col">역할</th><th scope="col">상태</th><th scope="col">편집</th></tr></thead><tbody>{view.access.map((access) => <tr key={access.uid}><td>{accounts.find((account) => account.uid === access.uid)?.name ?? "등록 계정"}</td><td>{staff.find((person) => person.id === access.staffId)?.name ?? "스탭 연결 확인 필요"}</td><td>{PRAISE_ROLE_LABELS[access.role]}</td><td>{access.active ? "활성" : "비활성"}</td><td><button type="button" className={buttonClass} disabled={disabled || !!accessDraft} aria-label={`${staff.find((person) => person.id === access.staffId)?.name ?? "연결된 스탭"} 담당 계정 편집`} onClick={() => { clearMessage(); const { uid, staffId, role, active, revision } = access; setAccessDraft({ revision, value: { uid, staffId, role, active } }); }}>편집</button></td></tr>)}</tbody></table></div>
      {accessDraft && <form onSubmit={(event) => { if (accessDraft.revision === 0 && view.access.some((item) => item.uid === accessDraft.value.uid)) { event.preventDefault(); setError("이미 연결된 계정입니다. 목록에서 해당 계정을 편집해 주세요."); return; } void save(event, { type: "access.save", expectedRevision: accessDraft.revision, access: accessDraft.value }, () => setAccessDraft(null)); }}><fieldset disabled={disabled}>
        <div className="praise-form-grid">
          <Field label="담당자 계정"><select required disabled={accountsLoading || !!accountsError || accessDraft.revision > 0} value={accessDraft.value.uid} onChange={(event) => setAccessDraft({ ...accessDraft, value: { ...accessDraft.value, uid: event.target.value } })}><option value="">{accountsLoading ? "계정을 불러오는 중…" : "등록 계정 선택"}</option>{accessDraft.value.uid && !accounts.some((account) => account.uid === accessDraft.value.uid) && <option value={accessDraft.value.uid}>기존 연결 계정</option>}{accounts.map((account) => <option key={account.uid} value={account.uid}>{account.name} · {account.roleLabel}</option>)}</select></Field>
          <Field label="연결 스탭"><select required value={accessDraft.value.staffId} onChange={(event) => setAccessDraft({ ...accessDraft, value: { ...accessDraft.value, staffId: event.target.value } })}><option value="">스탭 선택</option>{staff.map((person) => <option key={person.id} value={person.id} disabled={!person.active}>{person.name}{person.active ? "" : " · 비활성"}</option>)}</select></Field>
          <Field label="담당 역할"><select value={accessDraft.value.role} onChange={(event) => setAccessDraft({ ...accessDraft, value: { ...accessDraft.value, role: event.target.value as typeof accessDraft.value.role } })}>{PRAISE_ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></Field>
        </div>
        {accountsError && <div className="praise-toolbar"><p className="praise-note" role="alert">{accountsError}</p><button type="button" className={buttonClass} onClick={() => setAccountsRetry((value) => value + 1)}>담당 계정 다시 불러오기</button></div>}
        {!accountsLoading && !accountsError && accounts.length === 0 && <p className="praise-note">선택할 등록 계정이 없습니다. 사이트 로그인과 찬양팀 접근 권한을 먼저 확인해 주세요.</p>}
        <Check label="담당 계정 활성" value={accessDraft.value.active} change={(active) => setAccessDraft({ ...accessDraft, value: { ...accessDraft.value, active } })} />
        {staff.length === 0 && <p className="praise-note">명단에 스탭을 먼저 등록한 뒤 연결해 주세요.</p>}
        <Actions cancel={() => setAccessDraft(null)} saveLabel="담당 계정 저장" />
      </fieldset></form>}
    </section>

    <section className="praise-section" aria-label="등단 기본 정책">
      <div className="praise-toolbar"><h3>등단 기본 정책</h3>{!policyDraft && <button type="button" className={buttonClass} disabled={disabled || !view.policy} onClick={() => { if (!view.policy) return; clearMessage(); setPolicyDraft({ revision: view.policy.revision, value: structuredClone({ grouping: view.policy.grouping, rules: view.policy.rules, stage: view.policy.stage }) }); }}>등단 정책 편집</button>}</div>
      {!view.policy && <p className="praise-empty">정책을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.</p>}
      {!policyDraft && view.policy && <p className="praise-note">학생 비율 {Math.round(view.policy.stage.studentRatio * 100)}% · 여성 싱어 최소 {view.policy.stage.minimumFemaleSingers}명 · 1부 싱어 {view.policy.stage.first.singerTarget}명 / 콰이어 {view.policy.stage.first.choirTarget}명 · 2부 싱어 {view.policy.stage.second.singerTarget}명 / 콰이어 {view.policy.stage.second.choirTarget}명</p>}
      {policyDraft && <form onSubmit={(event) => save(event, { type: "policy.save", expectedRevision: policyDraft.revision, policy: policyDraft.value }, () => setPolicyDraft(null))}><fieldset disabled={disabled}><div className="praise-form-grid">
        <Field label="학생 목표 비율(%)"><input type="number" min="70" max="80" step="1" required value={Math.round(policyDraft.value.stage.studentRatio * 100)} onChange={(event) => setPolicyDraft({ ...policyDraft, value: { ...policyDraft.value, stage: { ...policyDraft.value.stage, studentRatio: Number(event.target.value) / 100 } } })} /></Field>
        <Field label="여성 싱어 최소 인원"><input type="number" min="0" max="50" required value={policyDraft.value.stage.minimumFemaleSingers} onChange={(event) => setPolicyDraft({ ...policyDraft, value: { ...policyDraft.value, stage: { ...policyDraft.value.stage, minimumFemaleSingers: Number(event.target.value) } } })} /></Field>
        {(["first", "second"] as const).flatMap((part) => (["singerTarget", "choirTarget"] as const).map((key) => <Field key={`${part}-${key}`} label={`${part === "first" ? "1부" : "2부"} ${key === "singerTarget" ? "싱어" : "콰이어"} 목표 인원`}><input type="number" min="0" max={key === "singerTarget" ? 50 : 100} required value={policyDraft.value.stage[part][key]} onChange={(event) => setPolicyDraft({ ...policyDraft, value: { ...policyDraft.value, stage: { ...policyDraft.value.stage, [part]: { ...policyDraft.value.stage[part], [key]: Number(event.target.value) } } } })} /></Field>))}
      </div><p className="praise-note">저장한 정책은 이후 등단 생성에 사용합니다. 기존 초안·확정 편성은 자동 변경하지 않습니다.</p><Actions cancel={() => setPolicyDraft(null)} saveLabel="등단 정책 저장" /></fieldset></form>}
    </section>

    <section className="praise-section" aria-label="회차별 첫 모임 가이드">
      <h3>회차별 첫 모임 가이드</h3>
      <Field label="가이드 회차"><select value={selectedMeetingId} disabled={disabled || !!guideDraft || !view.meetings.length} onChange={(event) => { clearMessage(); setMeetingSelection(event.target.value); }}><option value="" disabled>회차 선택</option>{view.meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.sequence}. {meeting.title} · {meeting.date}</option>)}</select></Field>
      {!view.meetings.length && <p className="praise-empty">회차를 먼저 등록해 주세요.</p>}
      {!!selectedMeetingId && !guideDraft && <>
        <div className="praise-toolbar"><p className="praise-note">{selectedGuide ? selectedGuide.published ? "게시됨" : "미게시" : "저장된 가이드 없음"}</p><button type="button" className={buttonClass} disabled={disabled} onClick={() => editGuide(false)}>{selectedGuide ? "가이드 편집" : "기본 가이드로 작성"}</button>{selectedGuide && <button type="button" className={buttonClass} disabled={disabled} onClick={() => editGuide(true)}>기본 템플릿 복제</button>}</div>
        {selectedGuide && <GuideContent guide={selectedGuide.content} showResources={false} />}
      </>}
      {guideDraft && <form onSubmit={(event) => save(event, { type: "guide.save", expectedRevision: guideDraft.revision, guide: { ...guideDraft.value, content: cleanGuide(guideDraft.value.content) } }, () => setGuideDraft(null))}><fieldset disabled={disabled}>
        <p className="praise-note">입력 중에는 다른 회차로 이동하지 않습니다. 저장하거나 취소한 뒤 회차를 바꿀 수 있습니다.</p>
        <GuideEditor content={guideDraft.value.content} change={(content) => setGuideDraft({ ...guideDraft, value: { ...guideDraft.value, content } })} />
        <Check label="가이드 게시" value={guideDraft.value.published} change={(published) => setGuideDraft({ ...guideDraft, value: { ...guideDraft.value, published } })} />
        <p className="praise-note">게시하면 이 작업공간의 가이드 열람 대상에게 표시됩니다. 미게시로 저장하면 운영 책임자만 확인합니다.</p>
        <Actions cancel={() => setGuideDraft(null)} saveLabel={guideDraft.value.published ? "가이드 저장·게시" : "가이드 미게시 저장"} />
      </fieldset></form>}
    </section>
    </fieldset>
  </div>;
}

// 작업공간이 바뀌면 이전 학기의 초안을 새 학기에 저장하지 않도록 분리한다.
export default function PraiseSettings(props: Props) {
  return <PraiseSettingsWorkspace key={props.view.meta.id} {...props} />;
}
