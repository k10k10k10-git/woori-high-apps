"use client";
import { useEffect, useId, useRef, useState } from "react";
import { listPraiseRoster } from "../api";
import type { PraisePersonInput, PraiseRosterLink } from "../types";
import { PraiseGroups } from "./PraiseGroups";
import { PraiseImport } from "./PraiseImport";
import { Empty, praiseDataWriteLocked, praisePersonWriteLocked, type PraiseEditorProps } from "./shared";

type RosterResult = Awaited<ReturnType<typeof listPraiseRoster>>;
type RosterPerson = RosterResult["people"][number];
function emptyPerson(): PraisePersonInput { return { id: crypto.randomUUID(), kind: "STUDENT", name: "", grade: 1, gender: "UNSPECIFIED", department: "FIRST", team: "SINGER", active: true, isStudentLeader: false, singerCapable: true, groupStaffCapable: false, preferredService: "BOTH", excludeFromAutoSinger: false }; }
function normalize(value: string) { return value.replaceAll(/\s/g, "").toLowerCase(); }
function candidateLabel(person: RosterPerson) { return `${person.name} · ${person.kind === "STAFF" ? "스탭" : `${person.department === "FIRST" ? "1부" : "2부"} ${person.grade}학년`}`; }
function sameRosterLink(left?: PraiseRosterLink, right?: PraiseRosterLink) { return [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].every((key) => left?.[key as keyof PraiseRosterLink] === right?.[key as keyof PraiseRosterLink]); }
function samePersonInput(left: PraisePersonInput, right: PraisePersonInput) {
  return left.id === right.id && left.kind === right.kind && left.name === right.name && left.grade === right.grade && left.gender === right.gender && left.department === right.department && left.team === right.team && left.active === right.active && left.isStudentLeader === right.isStudentLeader && left.singerCapable === right.singerCapable && left.groupStaffCapable === right.groupStaffCapable && left.preferredService === right.preferredService && left.excludeFromAutoSinger === right.excludeFromAutoSinger && left.sourceId === right.sourceId && sameRosterLink(left.rosterLink, right.rosterLink);
}

type PraisePeopleProps = PraiseEditorProps & {
  requestedPersonId?: string;
  onRequestedPersonClose?: () => void;
};

export function PraisePeople(props: PraisePeopleProps) {
  return <PraisePeopleBody key={props.view.meta.id} {...props} />;
}
function PraisePeopleBody(props: PraisePeopleProps) {
  const { view, execute, busy, requestedPersonId, onRequestedPersonClose } = props;
  const [section, setSection] = useState("people");
  const [visited, setVisited] = useState(() => new Set(["people"]));
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [department, setDepartment] = useState("");
  const [part, setPart] = useState("");
  const [inactive, setInactive] = useState(false);
  const [draft, setDraft] = useState<PraisePersonInput | null>(null);
  const [revision, setRevision] = useState(0);
  const baseline = useRef<PraisePersonInput | null>(null);
  const [savedLink, setSavedLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState("");
  const [roster, setRoster] = useState<RosterResult | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterAttempt, setRosterAttempt] = useState(0);
  const [rosterQuery, setRosterQuery] = useState("");
  const editorId = useId();
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const listSearch = useRef<HTMLInputElement>(null);
  const editorOpener = useRef<HTMLButtonElement | null>(null);
  const focusedPerson = useRef<string | null>(null);
  const restoreFocus = useRef(false);
  const handledRequest = useRef("");
  const locked = busy || saving;
  const dataWriteLocked = praiseDataWriteLocked(view);
  const personWriteLocked = praisePersonWriteLocked(view);
  const editorOpen = Boolean(draft) && view.permissions.manage;
  const editorPersonId = editorOpen ? draft?.id : null;
  const existingDraft = Boolean(draft && view.people.some((person) => person.id === draft.id));
  const editorWriteLocked = existingDraft ? personWriteLocked : dataWriteLocked;
  const dirty = Boolean(draft && baseline.current && !samePersonInput(draft, baseline.current));
  useEffect(() => {
    if (!requestedPersonId) { handledRequest.current = ""; return; }
    if (handledRequest.current === requestedPersonId || !view.permissions.manage || locked) return;
    handledRequest.current = requestedPersonId;
    const person = view.people.find((candidate) => candidate.id === requestedPersonId);
    if (!person) { onRequestedPersonClose?.(); return; }
    if (dirty && !window.confirm("저장하지 않은 팀원 변경을 닫고 선택한 팀원을 열까요?")) { onRequestedPersonClose?.(); return; }
    editorOpener.current = null;
    focusedPerson.current = null;
    restoreFocus.current = false;
    setSection("people");
    setVisited((current) => new Set([...current, "people"]));
    const nextDraft = structuredClone(person);
    baseline.current = structuredClone(nextDraft);
    setDraft(nextDraft);
    setRevision(person.revision);
    setSavedLink(Boolean(person.rosterLink && Object.keys(person.rosterLink).length));
    setRosterQuery("");
    setSaveError("");
  }, [dirty, locked, onRequestedPersonClose, requestedPersonId, view.people, view.permissions.manage]);
  useEffect(() => {
    if (section !== "people") { focusedPerson.current = null; return; }
    if (locked) return;
    if (editorPersonId) {
      if (focusedPerson.current !== editorPersonId) editorHeading.current?.focus();
      focusedPerson.current = editorPersonId;
    } else {
      focusedPerson.current = null;
      if (restoreFocus.current) {
        const opener = editorOpener.current;
        if (opener?.isConnected && !opener.disabled && !opener.closest("[hidden]")) opener.focus();
        else listSearch.current?.focus();
        restoreFocus.current = false;
      }
    }
  }, [editorPersonId, locked, section]);
  useEffect(() => {
    if (!editorOpen) return;
    const controller = new AbortController();
    let active = true;
    setRoster(null); setRosterError(""); setRosterLoading(true);
    void listPraiseRoster(view.meta.id, controller.signal).then((result) => {
      if (active) setRoster(result);
    }).catch(() => {
      if (active) setRosterError("학기 명단을 불러오지 못했습니다. 다시 시도해 주세요. 직접 등록한 내용은 유지됩니다.");
    }).finally(() => { if (active) setRosterLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [editorOpen, view.meta.id, view.meta.semesterId, view.meta.teamId, rosterAttempt]);
  const selectSection = (value: string) => {
    if (locked || savingRef.current) return;
    setSection(value); setVisited((current) => new Set([...current, value]));
  };
  const choose = (opener: HTMLButtonElement, person?: typeof view.people[number]) => {
    if (locked || savingRef.current || (!person && dataWriteLocked)) return;
    if (dirty && !window.confirm("저장하지 않은 팀원 변경을 닫고 다른 팀원을 열까요?")) return;
    editorOpener.current = opener;
    focusedPerson.current = null;
    if (person && person.id === editorPersonId) { editorHeading.current?.focus(); focusedPerson.current = person.id; }
    restoreFocus.current = false;
    const nextDraft = person ? structuredClone(person) : emptyPerson();
    baseline.current = structuredClone(nextDraft);
    setDraft(nextDraft); setRevision(person?.revision ?? 0);
    setSavedLink(Boolean(person?.rosterLink && Object.keys(person.rosterLink).length));
    setRosterQuery(""); setSaveError("");
  };
  const close = () => {
    if (locked || savingRef.current) return;
    if (!dirty || window.confirm("저장하지 않은 팀원 변경을 닫을까요?")) { restoreFocus.current = true; baseline.current = null; setDraft(null); if (requestedPersonId) onRequestedPersonClose?.(); }
  };
  const change = (patch: Partial<PraisePersonInput>) => {
    if (locked || editorWriteLocked || savingRef.current) return;
    setDraft((value) => value ? { ...value, ...patch } : null); setSaveError("");
  };
  const usedApplicationKeys = new Set(view.people.filter((person) => person.id !== draft?.id).flatMap((person) => person.rosterLink?.applicationKey ? [person.rosterLink.applicationKey] : []));
  const selectRosterPerson = (applicationKey: string) => {
    if (!draft || savedLink || locked || editorWriteLocked || savingRef.current) return;
    if (!applicationKey) {
      const next = { ...draft }; delete next.rosterLink; setDraft(next); return;
    }
    const person = roster?.people.find((candidate) => candidate.applicationKey === applicationKey);
    if (!person || usedApplicationKeys.has(applicationKey) || (revision > 0 && person.kind !== draft.kind)) return;
    change({
      rosterLink: { ...person.rosterLink, applicationKey },
      name: person.name,
      grade: person.grade,
      ...(person.kind === "STUDENT" ? { department: person.department } : {}),
      kind: person.kind,
    });
  };
  const linked = Boolean(draft?.rosterLink && Object.keys(draft.rosterLink).length);
  const currentSource = roster?.people.find((person) => person.applicationKey === draft?.rosterLink?.applicationKey);
  const basicInfoChanged = linked && currentSource && draft && currentSource.kind === draft.kind && (currentSource.name !== draft.name || currentSource.grade !== draft.grade || (draft.kind === "STUDENT" && currentSource.department !== draft.department) || !sameRosterLink(currentSource.rosterLink, draft.rosterLink));
  const unresolvedNewLink = linked && !savedLink && roster && !rosterLoading && !currentSource;
  const rosterCandidates = roster?.people.filter((person) => person.applicationKey === draft?.rosterLink?.applicationKey || normalize(candidateLabel(person)).includes(normalize(rosterQuery))) ?? [];
  const semesterHref = roster?.semesterHref?.startsWith("/semester/") && !roster.semesterHref.includes("\\") ? roster.semesterHref : null;
  const rows = view.people.filter((person) => (inactive || person.active) && (!kind || person.kind === kind) && (!department || person.department === department) && (!part || person.team === part) && normalize(`${person.name} ${person.sourceId ?? ""}`).includes(normalize(query))).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const accountStatus = new Map<string, boolean>();
  if (view.permissions.manage) for (const access of view.access) accountStatus.set(access.staffId, Boolean(accountStatus.get(access.staffId) || access.active));
  return <div className="praise-stack">
    <div className="praise-segment" aria-label="팀원과 조 메뉴">
      <button disabled={locked} aria-pressed={section === "people"} onClick={() => selectSection("people")}>팀원</button>
      <button disabled={locked} aria-pressed={section === "groups"} onClick={() => selectSection("groups")}>조편성</button>
      {view.permissions.manage && <button disabled={locked || dataWriteLocked} aria-pressed={section === "import"} onClick={() => selectSection("import")}>명단 가져오기</button>}
    </div>
    <section hidden={section !== "people"} className="praise-section" onKeyDown={(event) => { if (editorOpen && event.key === "Escape" && !event.defaultPrevented && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div className="praise-section-heading"><div><h2>찬양팀 팀원</h2><p>학생과 스탭을 검색하고 현재 활동 상태를 관리합니다.</p></div>{view.permissions.manage && <button className="praise-button praise-button--primary" disabled={locked || dataWriteLocked} onClick={(event) => choose(event.currentTarget)}>팀원 등록</button>}</div>
      <div className="praise-toolbar">
        <label className="praise-search"><span className="sr-only">팀원 이름 검색</span><input ref={listSearch} type="search" placeholder="이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label className="praise-field"><span className="sr-only">팀원 구분</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">학생과 스탭</option><option value="STUDENT">학생</option><option value="STAFF">스탭</option></select></label>
        <label className="praise-field"><span className="sr-only">팀원 부서 필터</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">모든 부서</option><option value="FIRST">1부</option><option value="SECOND">2부</option></select></label>
        <label className="praise-field"><span className="sr-only">팀원 파트 필터</span><select value={part} onChange={(event) => setPart(event.target.value)}><option value="">모든 파트</option><option value="SINGER">싱어</option><option value="SESSION">세션</option></select></label>
        <label className="praise-check"><input type="checkbox" checked={inactive} onChange={(event) => setInactive(event.target.checked)} />비활성 포함</label><span className="praise-count">{rows.length}명</span>
      </div>
      <div className={`praise-people-layout${editorOpen ? " is-editing" : ""}`}>
      <div className="praise-people-list">
      {rows.length === 0 ? <Empty>{query || kind || department || part ? "검색 조건에 맞는 팀원이 없습니다." : "등록된 팀원이 없습니다. 직접 등록하거나 명단을 가져와 주세요."}</Empty> : <div className="praise-table-wrap"><table className="praise-table"><thead><tr><th>이름</th><th>구분</th><th>부서·학년</th><th>파트</th><th>상태</th>{view.permissions.manage && <th>담당 계정</th>}</tr></thead><tbody>{rows.map((person) => <tr key={person.id} aria-selected={editorOpen && draft?.id === person.id}><td><div className="praise-person-heading">{view.permissions.manage ? <button className="praise-name-button" disabled={locked} aria-expanded={editorOpen && draft?.id === person.id} aria-controls={editorOpen ? editorId : undefined} onClick={(event) => choose(event.currentTarget, person)}>{person.name}</button> : person.name}{view.permissions.manage && <span>{person.rosterLink && Object.keys(person.rosterLink).length ? "학기 명단 연결" : "학기 명단 미연결"}</span>}</div></td><td>{person.kind === "STAFF" ? "스탭" : "학생"}</td><td>{person.department === "FIRST" ? "1부" : "2부"}{person.kind === "STUDENT" ? ` · ${person.grade}학년` : ""}</td><td>{person.team === "SINGER" ? "싱어" : "세션"}</td><td>{person.active ? "활동 중" : "비활성"}{person.isStudentLeader && " · 인도자"}</td>{view.permissions.manage && <td>{person.kind !== "STAFF" ? "해당 없음" : accountStatus.get(person.id) ? "담당 계정 연결" : accountStatus.has(person.id) ? "담당 계정 비활성" : "담당 계정 미연결"}</td>}</tr>)}</tbody></table></div>}
      </div>
      {draft && view.permissions.manage && <form id={editorId} className="praise-editor praise-people-editor" aria-label="찬양팀 팀원 편집" onSubmit={async (event) => {
        event.preventDefault();
        if (locked || editorWriteLocked || savingRef.current || !dirty || !draft.name.trim() || unresolvedNewLink) return;
        savingRef.current = true; setSaving(true); setSaveError("");
        try {
          const type = view.meta.mode === "shadow" && existingDraft ? "person.reconcile" : "person.save";
          if (await execute({ type, expectedRevision: revision, person: draft })) { restoreFocus.current = true; baseline.current = null; setDraft(null); if (requestedPersonId) onRequestedPersonClose?.(); }
        } catch { setSaveError("팀원을 저장하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요."); }
        finally { savingRef.current = false; setSaving(false); }
      }}>
        <div className="praise-section-heading"><h3 ref={editorHeading} tabIndex={-1}>{revision ? `${draft.name || "팀원"} ${editorWriteLocked ? "정보" : "수정"}` : "새 팀원 등록"}</h3><button type="button" className="praise-text-button" disabled={locked} onClick={close}>닫기</button></div>
        <fieldset disabled={locked || editorWriteLocked} className="praise-edit-fieldset">
          {revision > 0 && view.people.find((person) => person.id === draft.id)?.revision !== revision && <p className="praise-warning">다른 사람이 이 팀원을 수정했습니다. 현재 입력은 유지되었습니다. 닫은 뒤 팀원을 다시 열어 최신 기록과 비교해 주세요.</p>}
          <div className="praise-section-heading"><div><h4>학기 명단 연결</h4><p>배치가 완료된 팀원을 선택하면 이름·학년·부서를 가져옵니다. 이름이 같아도 자동으로 연결하지 않습니다.</p></div><div className="praise-toolbar"><button type="button" className="praise-text-button" disabled={rosterLoading} onClick={() => setRosterAttempt((attempt) => attempt + 1)}>학기 명단 새로고침</button>{semesterHref && <a className="praise-text-button" href={semesterHref} target="_blank" rel="noopener noreferrer">학기 배치 명단 관리 (새 탭)</a>}</div></div>
          {rosterLoading && <p className="praise-note" role="status">학기 명단을 불러오는 중입니다.</p>}
          {rosterError && <div className="praise-error" role="alert"><p>{rosterError}</p><button type="button" className="praise-button" onClick={() => setRosterAttempt((attempt) => attempt + 1)}>학기 명단 다시 시도</button></div>}
          {savedLink ? <div className="praise-source-note"><div><strong>통합 명단 기본 정보</strong><p>학생의 이름·구분·학년·예배 부서와 스탭의 이름·구분은 학기 배치 명단의 값을 사용합니다. 기본정보는 학기 배치에서 수정하고, 아래 찬양팀 속성은 여기서 수정해 주세요.</p></div><span className="praise-badge">연결됨</span></div> : <>
            <div className="praise-form-grid">
              <label className="praise-field"><span>학기 명단 검색</span><input type="search" placeholder="이름 · 부서 · 학년 검색" value={rosterQuery} onChange={(event) => setRosterQuery(event.target.value)} /></label>
              <label className="praise-field"><span>연결할 학기 팀원</span><select value={draft.rosterLink?.applicationKey ?? ""} disabled={rosterLoading} onChange={(event) => selectRosterPerson(event.target.value)}>
                <option value="">직접 등록 (연결 안 함)</option>
                {draft.rosterLink?.applicationKey && !currentSource && <option value={draft.rosterLink.applicationKey}>{draft.name} · 이전 선택 (명단 확인 필요)</option>}
                {rosterCandidates.map((person) => { const used = usedApplicationKeys.has(person.applicationKey); const differentKind = revision > 0 && person.kind !== draft.kind; return <option key={person.applicationKey} value={person.applicationKey} disabled={used || differentKind}>{candidateLabel(person)}{used ? " · 이미 연결됨" : differentKind ? " · 구분이 다름" : ""}</option>; })}
              </select></label>
            </div>
            {roster && !rosterLoading && !rosterError && <p className="praise-note">{!roster.semesterHref ? "운영 설정에서 학기와 팀을 연결하면 명단을 선택할 수 있습니다. 지금은 직접 등록할 수 있습니다." : roster.people.length === 0 ? "연결할 정식 배치 팀원이 없습니다. 학기 배치 명단을 확인하거나 직접 등록해 주세요." : rosterCandidates.length === 0 ? "검색 조건에 맞는 학기 팀원이 없습니다." : "현재 학기 명단에 없는 과거 팀원은 직접 등록할 수 있습니다."}</p>}
          </>}
          {unresolvedNewLink && <p className="praise-warning">선택한 팀원이 현재 배치 명단에 없습니다. 명단을 새로고침하거나 연결할 팀원을 다시 선택해 주세요.</p>}
          {basicInfoChanged && currentSource && <div className="praise-warning"><p>학기 명단의 기본 정보가 변경되었습니다. 최신 기본정보를 가져온 뒤 팀원을 저장하면 반영됩니다.</p><button type="button" className="praise-button" onClick={() => change({ name: currentSource.name, grade: currentSource.grade, ...(currentSource.kind === "STUDENT" ? { department: currentSource.department } : {}), rosterLink: { ...currentSource.rosterLink, applicationKey: currentSource.applicationKey } })}>최신 기본정보 가져오기</button></div>}
          {savedLink && roster && !rosterLoading && draft.rosterLink?.applicationKey && !roster.people.some((person) => person.applicationKey === draft.rosterLink?.applicationKey) && <p className="praise-note">현재 배치 명단에서 찾을 수 없는 과거 연결입니다. 저장된 기본 정보와 기존 기록은 유지됩니다.</p>}
          <div className="praise-subsection-heading"><h4>찬양팀 세부 설정</h4><p>성별·파트·활동 상태와 등단·조편성 기준을 수정합니다.</p></div>
          <div className="praise-form-grid">
            <label className="praise-field"><span>이름</span><input required maxLength={80} readOnly={linked} value={draft.name} onChange={(event) => change({ name: event.target.value })} /></label>
            <label className="praise-field"><span>편집할 팀원 구분</span><select value={draft.kind} disabled={linked || revision > 0} onChange={(event) => change({ kind: event.target.value as "STUDENT" | "STAFF", grade: event.target.value === "STAFF" ? 0 : 1 })}><option value="STUDENT">학생</option><option value="STAFF">스탭</option></select></label>
            {draft.kind === "STUDENT" && <label className="praise-field"><span>학년</span><select value={draft.grade} disabled={linked} onChange={(event) => change({ grade: Number(event.target.value) })}>{[1, 2, 3].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>}
            <label className="praise-field"><span>성별</span><select value={draft.gender} onChange={(event) => change({ gender: event.target.value as PraisePersonInput["gender"] })}><option value="UNSPECIFIED">미입력</option><option value="FEMALE">여</option><option value="MALE">남</option></select></label>
            <label className="praise-field"><span>예배 부서</span><select value={draft.department} disabled={linked && draft.kind === "STUDENT"} onChange={(event) => change({ department: event.target.value as "FIRST" | "SECOND" })}><option value="FIRST">1부</option><option value="SECOND">2부</option></select></label>
            <label className="praise-field"><span>파트</span><select value={draft.team} onChange={(event) => change({ team: event.target.value as "SINGER" | "SESSION" })}><option value="SINGER">싱어</option><option value="SESSION">세션</option></select></label>
            {draft.kind === "STAFF" && <label className="praise-field"><span>선호 예배</span><select value={draft.preferredService} onChange={(event) => change({ preferredService: event.target.value as PraisePersonInput["preferredService"] })}><option value="BOTH">1·2부 모두</option><option value="FIRST">1부</option><option value="SECOND">2부</option></select></label>}
          </div>
          <div className="praise-toolbar"><label className="praise-check"><input type="checkbox" checked={draft.active} onChange={(event) => change({ active: event.target.checked })} />현재 활동 중</label>{draft.kind === "STUDENT" ? <label className="praise-check"><input type="checkbox" checked={draft.isStudentLeader} onChange={(event) => change({ isStudentLeader: event.target.checked })} />학생 인도자</label> : <><label className="praise-check"><input type="checkbox" checked={draft.singerCapable} onChange={(event) => change({ singerCapable: event.target.checked })} />싱어 가능</label><label className="praise-check"><input type="checkbox" checked={draft.groupStaffCapable} onChange={(event) => change({ groupStaffCapable: event.target.checked })} />조 담당 가능</label><label className="praise-check"><input type="checkbox" checked={draft.excludeFromAutoSinger} onChange={(event) => change({ excludeFromAutoSinger: event.target.checked })} />자동 싱어 배정 제외</label></>}</div>
          <p className="praise-note">비활성화해도 기존 출결과 확정 등단 기록은 보존됩니다.</p>
          {saveError && <p className="praise-error" role="alert">{saveError}</p>}
          <button className="praise-button praise-button--primary" disabled={locked || !dirty || !draft.name.trim() || Boolean(unresolvedNewLink)} type="submit">{saving ? "팀원 저장 중…" : "팀원 저장"}</button>
        </fieldset>
      </form>}
      </div>
    </section>
    {visited.has("groups") && <div hidden={section !== "groups"}><PraiseGroups {...props} /></div>}
    {view.permissions.manage && visited.has("import") && <div hidden={section !== "import"}><PraiseImport {...props} busy={busy || dataWriteLocked} /></div>}
  </div>;
}
