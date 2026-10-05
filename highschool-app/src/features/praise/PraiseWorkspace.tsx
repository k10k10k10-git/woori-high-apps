"use client";
import { confirmPraiseNavigation } from "./usePraiseDraftGuard";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, CaretLeft } from "@phosphor-icons/react";
import { createPraiseWorkspace, listPraiseCreateReferences, listPraiseWorkspaces, praiseOperationId } from "./api";
import { canOpenPraiseAttendance } from "./permissions";
import { usePraiseData } from "./usePraiseData";
import { defaultPraiseMeeting } from "./domain/workflow";
import { praiseSemesterHref, selectPraiseWorkspace } from "./navigation";
import { isPraiseHistoricalReadOnly } from "./domain/operatingBoundary";
import { toSeoulDate } from "./domain/terms";
import type { PraiseMeta } from "./types";
import { PraiseAttendance } from "./components/PraiseAttendance";
import { PraiseStage } from "./components/PraiseStage";
import { PraisePeople } from "./components/PraisePeople";
import PraiseSettings from "./components/PraiseSettings";
import { PraiseWeek } from "./components/PraiseWeek";
import { praiseDataWriteLocked, praisePersonWriteLocked } from "./components/shared";
import { PraiseResourceLibrary } from "./content/GuideContent";
import "./praise.css";

export default function PraiseWorkspace({ workspaceId, initialTab, embedded = false }: { workspaceId?: string; initialTab?: string; embedded?: boolean }) {
  const query = useSearchParams();
  const requestedWorkspace = query.get("workspace") ?? workspaceId ?? "";
  const requestedSemester = query.get("semester") ?? "";
  const requestedTab = query.get("tab") ?? initialTab;
  const requestedMeeting = query.get("meeting") ?? "";
  const requestedSection = ["groups", "import"].includes(query.get("section") ?? "") ? query.get("section")! : "people";
  const requestedPerson = query.get("person") ?? "";
  const [workspaces, setWorkspaces] = useState<PraiseMeta[]>([]);
  const [workspaceMeta, setWorkspaceMeta] = useState<Record<string, PraiseMeta>>({});
  const [canCreate, setCanCreate] = useState(false);
  const [selected, setSelected] = useState(requestedSemester ? "" : requestedWorkspace);
  const requestedSource = `${requestedWorkspace}:${requestedSemester}`;
  const [workspaceSource, setWorkspaceSource] = useState(requestedSource);
  if (workspaceSource !== requestedSource) { setWorkspaceSource(requestedSource); setSelected(selectPraiseWorkspace(workspaces, requestedWorkspace, requestedSemester)); }
  const selectWorkspace = (id: string) => { if (!confirmPraiseNavigation()) return; setSelected(id); updatePraiseLocation({ workspace: id, tab: praiseTab(requestedTab), meeting: null, semester: null }); };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showPeriodControls, setShowPeriodControls] = useState(false);
  const selectedWorkspace = workspaceMeta[selected] ?? workspaces.find((workspace) => workspace.id === selected);
  const syncWorkspaceMeta = useCallback((meta: PraiseMeta) => {
    setWorkspaceMeta((current) => current[meta.id] === meta ? current : { ...current, [meta.id]: meta });
  }, [setWorkspaceMeta]);
  const reloadList = () => { setLoading(true); setError(""); setErrorCode(""); setRetry((value) => value + 1); };
  useEffect(() => {
    const controller = new AbortController();
    void listPraiseWorkspaces(controller.signal).then((result) => { if (controller.signal.aborted) return; setWorkspaces(result.workspaces); setCanCreate(result.canCreate); setSelected((current) => current && result.workspaces.some((item) => item.id === current && (!requestedSemester || item.semesterId === requestedSemester)) ? current : selectPraiseWorkspace(result.workspaces, requestedWorkspace, requestedSemester)); }).catch((failure) => { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "운영 공간을 불러오지 못했습니다."); setErrorCode(failure instanceof Error && "code" in failure && typeof failure.code === "string" ? failure.code : ""); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry, requestedWorkspace, requestedSemester]);
  return <main className={`praise-workspace${embedded ? " praise-workspace--embedded" : ""}`}>
    <header className="praise-header praise-header--compact"><div className="praise-header-copy">{!embedded && <Link className="praise-back" href="/"><CaretLeft size={14} aria-hidden="true" />통합 사이트</Link>}{embedded ? <h2 className="praise-page-title">찬양팀</h2> : <h1 className="praise-page-title">찬양팀</h1>}{!selectedWorkspace && <p>모임 출결부터 주일 등단까지</p>}</div>{errorCode !== "server_not_configured" && <button type="button" className="praise-mobile-context-toggle" aria-label={`운영 기간 ${selectedWorkspace?.name ?? "선택"} ${showPeriodControls ? "접기" : "변경"}`} aria-expanded={showPeriodControls} aria-controls="praise-period-controls" onClick={() => setShowPeriodControls((value) => !value)}>운영 기간 <strong>{selectedWorkspace?.name ?? "선택"}</strong><span aria-hidden="true">{showPeriodControls ? "접기" : "변경"}</span></button>}<div id="praise-period-controls" className={`praise-header-actions${showPeriodControls ? " is-mobile-open" : ""}`} hidden={errorCode === "server_not_configured"}><label className="praise-field praise-period-field"><span>{selectedWorkspace?.semesterId ? "학기" : "운영 기간"}</span><select aria-label="찬양팀 운영 기간" value={selected} onChange={(event) => { selectWorkspace(event.target.value); setShowPeriodControls(false); }} disabled={loading || creating}><option value="">운영 기간 선택</option>{workspaces.map((workspace) => { const current = workspaceMeta[workspace.id] ?? workspace; return <option value={current.id} key={current.id}>{current.name}{current.status === "archived" ? " · 보관됨" : ""}</option>; })}</select></label>{canCreate && <button className="praise-text-button" type="button" disabled={creating} onClick={() => setShowCreate((value) => !value)}>{showCreate ? "개설 닫기" : "새 운영 기간"}</button>}</div></header>
    {error && errorCode !== "server_not_configured" && <div className="praise-error" role="alert">{error}<button className="praise-text-button" onClick={reloadList}>다시 불러오기</button></div>}
    {errorCode === "server_not_configured" && <ConnectionPreparing />}
    {showCreate && canCreate && errorCode !== "server_not_configured" && <CreateWorkspace creating={creating} onCreating={setCreating} onCreated={(id) => { selectWorkspace(id); setShowCreate(false); reloadList(); }} onError={(message) => setError(message)} /> }
    {loading && !selected && <p className="praise-loading" role="status">찬양팀 운영 공간을 불러오고 있습니다…</p>}
    {!loading && !selected && !error && <section className="praise-section praise-welcome"><h2>{requestedSemester ? "이 학기에 연결된 찬양팀 운영이 없습니다" : "찬양팀 운영을 시작해 주세요"}</h2><p>{requestedSemester ? "다른 학기 기록으로 이동하지 않았습니다. 운영 기간을 선택하거나 담당자에게 학기 연결을 확인해 주세요." : canCreate ? "공통 학기와 사역팀을 연결하면 팀원 명단, 출결, 조편성, 주일 등단표를 함께 관리할 수 있습니다." : "아직 접근할 수 있는 운영 기간이 없습니다. 담당자에게 운영 공간과 권한을 확인해 주세요."}</p>{canCreate && <button className="praise-button praise-button--primary" onClick={() => setShowCreate(true)}>팀 운영 개설하기</button>}</section>}
    {selected && errorCode !== "server_not_configured" && <WorkspaceBody key={selected} workspaceId={selected} initialTab={requestedTab} initialMeetingId={requestedMeeting} initialPersonId={requestedPerson} initialSection={requestedSection} onWorkspaceMeta={syncWorkspaceMeta} />}
  </main>;
}

function WorkspaceBody({ workspaceId, initialTab, initialMeetingId, initialPersonId, initialSection, onWorkspaceMeta }: { workspaceId: string; initialTab?: string; initialMeetingId: string; initialPersonId: string; initialSection: string; onWorkspaceMeta: (meta: PraiseMeta) => void }) {
  const { view, busy, error, errorCode, notice, execute, refresh } = usePraiseData(workspaceId);
  useEffect(() => { if (view) onWorkspaceMeta(view.meta); }, [onWorkspaceMeta, view]);
  const [tab, setTab] = useState(() => praiseTab(initialTab));
  const [visited, setVisited] = useState(() => new Set(["week", praiseTab(initialTab)]));
  const [tabSource, setTabSource] = useState(initialTab);
  if (tabSource !== initialTab) { setTabSource(initialTab); setTab(praiseTab(initialTab)); setVisited((current) => new Set([...current, praiseTab(initialTab)])); }
  const [personId, setPersonId] = useState(initialPersonId);
  const [personSource, setPersonSource] = useState(initialPersonId);
  if (personSource !== initialPersonId) { setPersonSource(initialPersonId); setPersonId(initialPersonId); }
  const [peopleSection, setPeopleSection] = useState(initialSection);
  const [showMeetingControls, setShowMeetingControls] = useState(false);
  const [sectionSource, setSectionSource] = useState(initialSection);
  if (sectionSource !== initialSection) { setSectionSource(initialSection); setPeopleSection(initialSection); }
  const selectTab = (target: string) => { const value = target === "groups" ? "people" : target; const section = target === "groups" ? "groups" : peopleSection; setPeopleSection(section); const nextPerson = value === "people" ? personId : ""; setPersonId(nextPerson); setTab(value); setVisited((current) => new Set([...current, value])); updatePraiseLocation({ workspace: workspaceId, tab: value, meeting: meeting?.id ?? null, person: nextPerson || null, section: value === "people" ? section : null }); };
  const [meetingId, setMeetingId] = useState(initialMeetingId);
  const [meetingSource, setMeetingSource] = useState(initialMeetingId);
  if (meetingSource !== initialMeetingId) { setMeetingSource(initialMeetingId); setMeetingId(initialMeetingId); }
  const selectMeeting = (id: string) => { if (!confirmPraiseNavigation("stage")) return; setMeetingId(id); setShowMeetingControls(false); updatePraiseLocation({ workspace: workspaceId, tab: activeTab, meeting: id, person: activeTab === "people" ? personId || null : null }); };
  const tabsRef = useRef<HTMLDivElement>(null);
  if (errorCode === "server_not_configured") return <ConnectionPreparing />;
  if (!view) return <div className="praise-section">{error ? <div className="praise-error" role="alert">{error}<button className="praise-button" onClick={() => { void refresh(); }}>다시 불러오기</button></div> : <p role="status">모임 기록을 불러오고 있습니다…</p>}</div>;
  const meetings = [...view.meetings].sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);
  const today = toSeoulDate(new Date());
  const defaultMeeting = defaultPraiseMeeting(meetings, today);
  if (!meetingId && defaultMeeting) setMeetingId(defaultMeeting.id);
  const meeting = meetings.find((item) => item.id === meetingId) ?? defaultMeeting ?? null;
  const canAttend = canOpenPraiseAttendance(view.permissions);
  const tabs = [{ id: "week", label: "이번 주" }, ...(canAttend ? [{ id: "attendance", label: "출결" }] : []), { id: "stage", label: "등단" }, ...(view.permissions.manage || view.permissions.stageEdit ? [{ id: "people", label: "팀원·조" }] : []), ...(view.permissions.manage ? [{ id: "settings", label: "운영 설정" }] : [])];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : "week";
  const locked = praiseDataWriteLocked(view);
  const statusLabel = view.meta.status === "archived" ? "보관됨" : view.meta.mode === "live" ? "운영 중" : view.meta.mode === "shadow" ? "원본 대조 중" : "운영 준비";
  const statusTone = view.meta.status === "archived" || view.meta.mode === "setup" ? "muted" : view.meta.mode === "shadow" ? "warning" : "live";
  const props = { view, execute: locked ? async () => false : execute, busy };
  const peopleProps = { view, execute: praisePersonWriteLocked(view) ? async () => false : execute, busy };
  const editPerson = (id: string) => { setPeopleSection("people"); setPersonId(id); setTab("people"); setVisited((current) => new Set([...current, "people"])); updatePraiseLocation({ workspace: workspaceId, tab: "people", meeting: meeting?.id ?? null, person: id, section: "people" }); };
  const closeRequestedPerson = () => { setPersonId(""); updatePraiseLocation({ workspace: workspaceId, tab: "people", meeting: meeting?.id ?? null, person: null }); };
  return <>
    <section className="praise-meeting-bar" aria-label="찬양팀 운영 현황">
      <button type="button" className="praise-mobile-context-toggle" aria-label={`모임 ${meeting ? `${meeting.date} · ${meeting.title}` : "등록된 회차 없음"} ${showMeetingControls ? "접기" : "변경"}`} aria-expanded={showMeetingControls} aria-controls="praise-meeting-controls" onClick={() => setShowMeetingControls((value) => !value)}>모임 <strong>{meeting ? `${meeting.date} · ${meeting.title}` : "등록된 회차 없음"}</strong><span aria-hidden="true">{showMeetingControls ? "접기" : "변경"}</span></button>
      <div id="praise-meeting-controls" className={`praise-context-controls${showMeetingControls ? " is-mobile-open" : ""}`}><label className="praise-field"><span>모임 선택</span><select aria-label="모임 회차" value={meeting?.id ?? ""} disabled={busy || meetings.length === 0} onChange={(event) => selectMeeting(event.target.value)}>{meetings.length === 0 && <option value="">등록된 회차 없음</option>}{meetings.map((item) => <option value={item.id} key={item.id}>{item.date} · {item.title}{item.cancelled ? " · 휴강" : ""}{isPraiseHistoricalReadOnly(view.meta, item.date) ? " · 보관" : ""}</option>)}</select></label>{defaultMeeting && meeting?.id !== defaultMeeting.id && <button className="praise-text-button" disabled={busy} onClick={() => selectMeeting(defaultMeeting.id)}>이번 모임</button>}<button className="praise-icon-button" disabled={busy} onClick={() => { void refresh(); }} aria-label="찬양팀 최신 기록 불러오기"><ArrowClockwise size={18} aria-hidden="true" /></button></div>
      <div className="praise-meeting-links"><span className={`praise-badge praise-badge--${statusTone}`}>{statusLabel}</span>{praiseSemesterHref(view.meta, meeting) && <Link className="praise-context-link" href={praiseSemesterHref(view.meta, meeting)!}>학기 찬양팀 명단</Link>}</div>
    </section>
    <div className="praise-tabs" ref={tabsRef} role="tablist" aria-label="찬양팀 업무" onKeyDown={(event) => { const index = tabs.findIndex((item) => item.id === activeTab); const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); selectTab(tabs[next].id); tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus(); } }}>{tabs.map((item) => <button role="tab" type="button" id={`praise-tab-${item.id}`} aria-controls={`praise-panel-${item.id}`} aria-selected={activeTab === item.id} tabIndex={activeTab === item.id ? 0 : -1} key={item.id} onClick={() => selectTab(item.id)}>{item.label}</button>)}</div><p className="praise-tabs-hint">업무 탭을 좌우로 밀어 더 볼 수 있습니다.</p>
    {meeting && isPraiseHistoricalReadOnly(view.meta, meeting.date) && <p className="praise-note">보관된 회차입니다. 이전 출결·등단은 조회만 할 수 있습니다. 확인되지 않은 당시 조편성은 현재 조와 구분합니다.</p>}
    <div className="praise-feedback" aria-live="polite" aria-atomic="true">{busy ? <p role="status">저장하고 있습니다…</p> : error ? <p role="alert" className="praise-error">{error} <button className="praise-text-button" onClick={() => { void refresh(); }}>최신 기록 불러오기</button></p> : notice ? <p className="praise-success">{notice}</p> : null}</div>
    {locked && <p className="praise-note">{view.meta.status === "archived" ? "보관된 운영 기간입니다. 운영 설정에서 다시 열기 전까지 읽기 전용입니다." : view.meta.mode === "shadow" ? "기존 출결·등단·조 기록은 대조가 끝날 때까지 읽기 전용입니다. 관리자는 팀원 정보와 통합 명단 연결을 정리할 수 있습니다." : "운영 책임자가 준비를 마치면 출결과 등단 편성이 열립니다."}</p>}
    <div role="tabpanel" id="praise-panel-week" aria-labelledby="praise-tab-week" hidden={activeTab !== "week"}><PraiseWeek view={view} meeting={meeting} onTab={selectTab} /></div>
    {canAttend && visited.has("attendance") && <div role="tabpanel" id="praise-panel-attendance" aria-labelledby="praise-tab-attendance" hidden={activeTab !== "attendance"}><PraiseAttendance {...props} meeting={meeting} onSelectMeeting={selectMeeting} onEditPerson={view.permissions.manage ? editPerson : undefined} /></div>}
    {visited.has("stage") && <div role="tabpanel" id="praise-panel-stage" aria-labelledby="praise-tab-stage" hidden={activeTab !== "stage"}><PraiseStage key={meeting?.id ?? "no-meeting"} {...props} meeting={meeting} /></div>}
    {(view.permissions.manage || view.permissions.stageEdit) && visited.has("people") && <div role="tabpanel" id="praise-panel-people" aria-labelledby="praise-tab-people" hidden={activeTab !== "people"}><PraisePeople {...peopleProps} requestedSection={peopleSection === "import" && !view.permissions.manage ? "people" : peopleSection} onSectionChange={(section) => { setPeopleSection(section); updatePraiseLocation({ workspace: workspaceId, tab: "people", meeting: meeting?.id ?? null, section }); }} requestedPersonId={personId || undefined} onRequestedPersonClose={closeRequestedPerson} /></div>}
    {view.permissions.manage && visited.has("settings") && <div role="tabpanel" id="praise-panel-settings" aria-labelledby="praise-tab-settings" hidden={activeTab !== "settings"}><PraiseSettings view={view} execute={execute} busy={busy} /></div>}
  </>;
}

/** 선택한 운영 기간·탭·회차를 함께 기록해 새로고침과 뒤로가기에 같은 화면을 연다. */
function updatePraiseLocation(values: { workspace: string; tab: string; meeting: string | null; person?: string | null; section?: string | null; semester?: string | null }) {
  const url = new URL(window.location.href);
  url.searchParams.set("workspace", values.workspace);
  url.searchParams.set("tab", values.tab);
  if (values.semester !== undefined) { if (values.semester) url.searchParams.set("semester", values.semester); else url.searchParams.delete("semester"); }
  if (values.meeting) url.searchParams.set("meeting", values.meeting); else url.searchParams.delete("meeting");
  if (values.person) url.searchParams.set("person", values.person); else url.searchParams.delete("person");
  if (values.section !== undefined) { if (values.section) url.searchParams.set("section", values.section); else url.searchParams.delete("section"); }
  if (url.href !== window.location.href) window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

type SemesterReference = { id: string; title: string; startDate?: string; endDate?: string; teams: { id: string; name: string }[] };
function CreateWorkspace({ creating, onCreating, onCreated, onError }: { creating: boolean; onCreating: (value: boolean) => void; onCreated: (id: string) => void; onError: (message: string) => void }) {
  const [references, setReferences] = useState<SemesterReference[]>([]);
  const [referenceState, setReferenceState] = useState<"loading" | "ready" | "error">("loading");
  const [referenceRetry, setReferenceRetry] = useState(0);
  const [independent, setIndependent] = useState(false);
  const [semesterId, setSemesterId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [newName, setNewName] = useState("");
  const [startDate, setStartDate] = useState(() => toSeoulDate(new Date()));
  const [endDate, setEndDate] = useState("");
  const createId = useRef(praiseOperationId());
  const semester = references.find((item) => item.id === semesterId);
  useEffect(() => {
    const controller = new AbortController();
    void listPraiseCreateReferences(controller.signal).then((result) => { if (!controller.signal.aborted) { setReferences(result.semesters); setReferenceState("ready"); } }).catch(() => { if (!controller.signal.aborted) setReferenceState("error"); });
    return () => controller.abort();
  }, [referenceRetry]);
  return <form className="praise-section praise-create" onSubmit={async (event) => {
    event.preventDefault(); if (creating || (!independent && (!semester || !semester.teams.some((item) => item.id === teamId)))) return;
    onCreating(true); onError("");
    try {
      const result = await createPraiseWorkspace({ id: `p_${createId.current}`, name: newName, startDate, endDate, ...(!independent ? { semesterId, teamId } : {}) }, createId.current);
      onCreated(result.workspaceId);
    } catch (failure) { onError(failure instanceof Error ? failure.message : "팀 운영을 개설하지 못했습니다."); }
    finally { onCreating(false); }
  }}><fieldset className="praise-edit-fieldset" disabled={creating} onChange={() => { createId.current = praiseOperationId(); }}>
    <h2>찬양팀 운영 개설</h2><p className="praise-note">먼저 공통 학기와 찬양 사역팀을 선택하세요. 기간 안의 토요일 모임을 준비 상태로 생성합니다. 기존 운영 기록은 별도 이관 절차로 연결합니다.</p>
    <label className="praise-field"><span>운영 기준</span><select value={independent ? "independent" : "semester"} onChange={(event) => setIndependent(event.target.value === "independent")}><option value="semester">공통 학기·팀에 연결 (기본)</option><option value="independent">학기에 속하지 않는 별도 기간</option></select></label>
    {!independent ? <>
      {referenceState === "loading" && <p role="status">연결할 학기와 팀을 불러오고 있습니다…</p>}
      {referenceState === "error" && <p role="alert" className="praise-error">학기와 팀을 불러오지 못했습니다. <button className="praise-text-button" type="button" onClick={() => { setReferenceState("loading"); setReferenceRetry((value) => value + 1); }}>학기 다시 불러오기</button></p>}
      {referenceState === "ready" && references.length === 0 && <p className="praise-note">연결할 학기가 없습니다. <Link href="/semesters">학기 운영에서 학기와 찬양팀을 먼저 준비해 주세요.</Link></p>}
      <div className="praise-form-grid"><label className="praise-field"><span>공통 학기</span><select required value={semesterId} disabled={referenceState !== "ready"} onChange={(event) => { const next = references.find((item) => item.id === event.target.value); setSemesterId(event.target.value); setTeamId(""); setNewName(next ? `${next.title} 찬양팀` : ""); setStartDate(next?.startDate ?? toSeoulDate(new Date())); setEndDate(next?.endDate ?? ""); }}><option value="">학기 선택</option>{references.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label className="praise-field"><span>학기 사역팀</span><select required value={teamId} disabled={!semester} onChange={(event) => setTeamId(event.target.value)}><option value="">찬양 사역팀 선택</option>{semester?.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      {semester && semester.teams.length === 0 && <p className="praise-note">이 학기에 사역팀이 없습니다. <Link href={`/semester/${encodeURIComponent(semester.id)}?tab=${encodeURIComponent("배치")}`}>학기 팀 배정을 먼저 확인해 주세요.</Link></p>}
    </> : <p className="praise-note">연중 활동·특별행사 등 공통 학기에 속하지 않는 경우에만 선택하세요. 학기 명단과 자동 연결되지 않으며, 운영 설정에서 나중에 학기와 팀을 연결할 수 있습니다.</p>}
    <div className="praise-form-grid"><label className="praise-field"><span>운영 이름</span><input required maxLength={120} value={newName} placeholder="예: 2026년 2학기 찬양팀" onChange={(event) => setNewName(event.target.value)} /></label><label className="praise-field"><span>시작일</span><input type="date" min="2000-01-01" max="2100-12-31" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="praise-field"><span>종료일</span><input type="date" min={startDate} max="2100-12-31" required value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>
    <button type="submit" className="praise-button praise-button--primary" disabled={creating || !newName.trim() || !startDate || !endDate || (!independent && (!semesterId || !teamId || referenceState !== "ready"))}>{creating ? "개설 중…" : "준비 상태로 개설"}</button>
  </fieldset></form>;
}

function praiseTab(value?: string): string {
  switch (value) {
    case "출결": case "praiseAttendance": case "attendance": return "attendance";
    case "등단": case "praiseStage": case "stage": return "stage";
    case "팀원·조": case "praiseRoster": case "people": return "people";
    case "운영 설정": case "praiseSettings": case "settings": return "settings";
    default: return "week";
  }
}

function ConnectionPreparing() {
  return <section className="praise-section praise-welcome"><div role="status"><h2>찬양팀 운영 연결 준비 중</h2><p>서버 연결을 확인하고 있습니다. 잠시 후 다시 열어 주세요. 이미 통합 운영 중이라면 이전 사이트에 중복 입력하지 말고 운영 담당자에게 알려 주세요.</p></div><PraiseResourceLibrary /></section>;
}
