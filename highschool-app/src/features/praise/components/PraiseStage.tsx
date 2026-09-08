"use client";
import { confirmPraiseNavigation, usePraiseDraftGuard } from "../usePraiseDraftGuard";
import { useState } from "react";
import { DEFAULT_STAGE } from "../defaults";
import type { StageOverride } from "../domain/stage";
import { PraiseStageAvailability } from "./PraiseStageAvailability";
import { PraiseStageBoard } from "./PraiseStageBoard";
import { toSeoulDate } from "../domain/terms";
import { comparePraiseStageVersions, preferredPraiseStageVersion } from "../stageHistoryModel";
import type { PraiseStageConfig, PraiseStageService, PraiseStageVersion } from "../types";
import { Empty, WarningList, praiseMeetingWriteLocked, sourceTime, stampTime, type PraiseMeetingProps } from "./shared";
import { PraiseStageHistory } from "./PraiseStageHistory";
import styles from "./PraiseStageHistory.module.css";

function versionName(version: PraiseStageVersion) { return `${version.number}차 ${version.kind === "CONFIRMED" ? "확정본" : version.kind === "AUTO_DRAFT" ? "자동 초안" : "수정 초안"} · ${stampTime(version.createdAt)}`; }
export function PraiseStage(props: PraiseMeetingProps) {
  const { view, meeting } = props;
  const versions = view.stages.filter((version) => version.meetingId === meeting?.id && (view.permissions.stageEdit || version.kind === "CONFIRMED")).sort(comparePraiseStageVersions);
  const [selected, setSelected] = useState(() => preferredPraiseStageVersion(versions, meeting?.worshipDate ?? "", toSeoulDate(new Date()))?.id ?? "");
  const [nonce, setNonce] = useState(0);
  const [pendingLatest, setPendingLatest] = useState(false);
  if (pendingLatest) { setSelected(versions[0]?.id ?? ""); setNonce((value) => value + 1); setPendingLatest(false); }
  if (!meeting) return <section className="praise-section"><Empty>모임 회차를 선택하면 주일 등단표를 확인할 수 있습니다.</Empty><PraiseStageHistory view={view} /></section>;
  const version = versions.find((item) => item.id === selected);
  return <section className="praise-section" aria-label="주일 등단">
    <div className="praise-section-heading"><div><h2>{meeting.worshipDate} 주일 등단</h2><p>출석 후보와 지난 확정 이력을 바탕으로 편성합니다. 공유할 등단표는 확정해 주세요.</p></div></div>
    <div className="praise-toolbar"><label className="praise-field"><span>저장된 등단표</span><select disabled={props.busy} value={selected} onChange={(event) => { if (!confirmPraiseNavigation("stage")) return; setSelected(event.target.value); setNonce((value) => value + 1); }}><option value="">{view.permissions.stageEdit ? "새 편성 준비" : "등단표 선택"}</option>{versions.map((item) => <option key={item.id} value={item.id}>{versionName(item)}</option>)}</select></label>{versions[0] && selected !== versions[0].id && <button className="praise-button" type="button" disabled={props.busy} onClick={() => { if (!confirmPraiseNavigation("stage")) return; setSelected(versions[0].id); setNonce((value) => value + 1); }}>최신본 불러오기</button>}</div>
    <StageEditor key={`${meeting.id}:${selected}:${nonce}`} {...props} version={version} latestId={versions[0]?.id} onSaved={() => setPendingLatest(true)} />
    <PraiseStageHistory view={view} />
  </section>;
}

function StageEditor({ view, meeting, execute, busy, version, latestId, onSaved }: PraiseMeetingProps & { version?: PraiseStageVersion; latestId?: string; onSaved: () => void }) {
  const [config, setConfig] = useState<PraiseStageConfig>(() => structuredClone(version?.config ?? { ...(view.policy?.stage ?? DEFAULT_STAGE), leaderType: "STAFF", leaderId: view.people.find((person) => person.active && person.kind === "STAFF")?.id ?? "", staffOnly: false }));
  const [overrides, setOverrides] = useState<StageOverride[]>(() => structuredClone(version?.overrides ?? []));
  const [services, setServices] = useState<PraiseStageService[]>(() => structuredClone(version?.services ?? []));
  const [inputRevision] = useState(version?.inputRevision ?? (meeting ? view.inputRevisions[meeting.id] : "") ?? "");
  const [acknowledge, setAcknowledge] = useState(false);
  const [exportError, setExportError] = useState("");
  const [dirty, setDirty] = useState(false);
  usePraiseDraftGuard("stage", dirty, busy);
  const [selectedService, setSelectedService] = useState(() => version?.services[0]?.department ?? "FIRST");
  if (!meeting) return null;
  const canEdit = view.permissions.stageEdit && !praiseMeetingWriteLocked(view, meeting);
  const stale = Boolean(version && latestId !== version.id);
  const inputStale = inputRevision !== view.inputRevisions[meeting.id];
  const setSetting = (patch: Partial<PraiseStageConfig>) => { if (busy || !canEdit) return; setConfig((value) => ({ ...value, ...patch })); setDirty(true); };
  const save = async (confirm: boolean) => {
    if (!version || busy || !canEdit) return;
    if (await execute({ type: confirm ? "stage.confirm" : "stage.save", meetingId: meeting.id, sourceVersionId: version.id, inputRevision, draft: { config, services, overrides }, acknowledgeWarnings: acknowledge })) { setDirty(false); onSaved(); }
  };
  const generate = async () => {
    if (busy || !canEdit) return;
    if (await execute({ type: "stage.generate", meetingId: meeting.id, inputRevision: view.inputRevisions[meeting.id], config, overrides })) { setDirty(false); onSaved(); }
  };
  const exportVersion = () => version ? { ...version, config, services, overrides } : null;
  const exportPDF = async () => {
    setExportError("");
    const target = exportVersion(); if (!target) return;
    try {
      const { printStagePDF } = await import("./stageExport");
      if (!printStagePDF(target)) setExportError("인쇄 창을 열지 못했습니다. 팝업을 허용한 뒤 다시 눌러 주세요.");
    } catch { setExportError("인쇄 자료를 준비하지 못했습니다. 연결을 확인한 뒤 다시 눌러 주세요."); }
  };
  const exportPNG = async () => {
    setExportError(""); const target = exportVersion(); if (!target) return;
    try { const { exportStagePNG } = await import("./stageExport"); await exportStagePNG(target); } catch { setExportError("이미지를 저장하지 못했습니다. 다시 시도해 주세요."); }
  };
  return <fieldset disabled={busy} className="praise-edit-fieldset"><div className="praise-stack">
    {view.meta.readOnlyBefore && meeting.date < view.meta.readOnlyBefore && <p className="praise-note">운영 전환 이전의 확정 기록입니다. 과거 기록은 보관하고 다음 회차부터 편성·수정합니다.</p>}
    {stale && <p className="praise-warning">최신 등단표가 따로 있습니다. 입력 중인 내용은 유지했습니다. 상단에서 최신본을 불러온 뒤 편집해 주세요.</p>}
    {version && inputStale && (version.imported
      ? <p className="praise-note">이관본의 생성 당시 조건은 현재 기록과 자동 대조할 수 없습니다.{canEdit && " 새 편성이 필요하면 현재 조건으로 생성해 주세요."}</p>
      : <p className="praise-warning">출결·팀원·설정이 초안 생성 이후 바뀌었습니다. 현재 조건으로 다시 생성한 뒤 확인해 주세요.</p>)}
    {meeting.cancelled && <p className="praise-note">토요 학생 모임은 휴강입니다. 학생 후보는 0명이며, 주일 스탭 참석을 기록해 스탭 등단을 편성할 수 있습니다.</p>}
    <PraiseStageAvailability view={view} meeting={meeting} execute={execute} busy={busy} />
    {canEdit && <details className="praise-disclosure" open={!version}><summary>등단 조건과 후보 예외</summary><div className="praise-form-grid">
      <label className="praise-field"><span>인도자 구분</span><select value={config.leaderType} onChange={(event) => setSetting({ leaderType: event.target.value as "STAFF" | "STUDENT", leaderId: "" })}><option value="STAFF">스탭</option><option value="STUDENT">학생</option></select></label>
      <label className="praise-field"><span>인도자</span><select value={config.leaderId} onChange={(event) => setSetting({ leaderId: event.target.value })}><option value="">인도자를 선택하세요</option>{view.people.filter((person) => person.active && person.kind === config.leaderType).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label className="praise-check"><input type="checkbox" checked={config.staffOnly} onChange={(event) => setSetting({ staffOnly: event.target.checked })} />스탭만 등단</label>
      {(["first", "second"] as const).map((department) => <div className="praise-inline-fields" key={department}><strong>{department === "first" ? "1부" : "2부"}</strong><label className="praise-field"><span>싱어 목표</span><input type="number" min={0} max={50} value={config[department].singerTarget} onChange={(event) => setSetting({ [department]: { ...config[department], singerTarget: Number(event.target.value) } })} /></label><label className="praise-field"><span>콰이어 목표</span><input type="number" min={0} max={100} value={config[department].choirTarget} onChange={(event) => setSetting({ [department]: { ...config[department], choirTarget: Number(event.target.value) } })} /></label></div>)}
      <label className="praise-field"><span>학생 등단 비율 (%)</span><input type="number" min={70} max={80} step={1} value={Math.round(config.studentRatio * 100)} onChange={(event) => setSetting({ studentRatio: Number(event.target.value) / 100 })} /></label><label className="praise-field"><span>여자 싱어 권장 최소</span><input type="number" min={0} max={50} value={config.minimumFemaleSingers} onChange={(event) => setSetting({ minimumFemaleSingers: Number(event.target.value) })} /></label>
    </div><h3>학생별 예외</h3><p className="praise-note">강제 등단도 출석·부서·제외 조건을 확인합니다. 변경 뒤 자동 편성을 다시 생성해 주세요.</p>
      {overrides.map((override, index) => <div className="praise-override-row" key={index}><label className="praise-field"><span className="sr-only">예외 학생 {index + 1}</span><select value={override.termStudentId} onChange={(event) => { setOverrides((current) => current.map((item, i) => i === index ? { ...item, termStudentId: event.target.value } : item)); setDirty(true); }}><option value="">학생 선택</option>{view.people.filter((person) => person.kind === "STUDENT" && person.active).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="praise-field"><span className="sr-only">예외 조건 {index + 1}</span><select value={override.kind} onChange={(event) => { const kind = event.target.value as StageOverride["kind"]; setOverrides((current) => current.map((item, i) => i === index ? { termStudentId: item.termStudentId, department: item.department, kind, ...(kind === "FORCE_STAGE" ? { role: "RANDOM" as const } : {}) } : item)); setDirty(true); }}><option value="EXCLUDE_STAGE">등단 제외</option><option value="MOVE_DEPARTMENT">예배 부서 이동</option><option value="FORCE_STAGE">강제 등단</option></select></label><label className="praise-field"><span className="sr-only">예외 예배 부서 {index + 1}</span><select value={override.department} onChange={(event) => { setOverrides((current) => current.map((item, i) => i === index ? { ...item, department: event.target.value as "FIRST" | "SECOND" } : item)); setDirty(true); }}><option value="FIRST">1부</option><option value="SECOND">2부</option></select></label>{override.kind === "FORCE_STAGE" && <label className="praise-field"><span className="sr-only">강제 등단 역할 {index + 1}</span><select value={override.role ?? "RANDOM"} onChange={(event) => { setOverrides((current) => current.map((item, i) => i === index ? { ...item, role: event.target.value as StageOverride["role"] } : item)); setDirty(true); }}><option value="RANDOM">자동</option><option value="SINGER">싱어</option><option value="CHOIR">콰이어</option></select></label>}<button className="praise-text-button" onClick={() => { setOverrides((current) => current.filter((_, i) => i !== index)); setDirty(true); }} aria-label={`예외 ${index + 1} 삭제`}>삭제</button></div>)}
      <button type="button" className="praise-button" onClick={() => { setOverrides((current) => [...current, { termStudentId: "", kind: "EXCLUDE_STAGE", department: "FIRST" }]); setDirty(true); }}>예외 추가</button>
    </details>}
    {canEdit && <div className="praise-toolbar"><button type="button" className="praise-button praise-button--primary" disabled={busy || !config.leaderId} onClick={() => { void generate(); }}>현재 조건으로 자동 편성</button><span className="praise-note">출석과 스탭 참석을 먼저 기록해 주세요.</span></div>}
    {!version ? <Empty>{view.permissions.stageEdit ? "인도자와 목표 인원을 정한 뒤 자동 편성을 생성해 주세요." : "아직 확정된 등단표가 없습니다."}</Empty> : <>
      <div className="praise-toolbar"><strong>{versionName(version)}</strong><span className="praise-note">인도 {version.leaderName}</span><button className="praise-button" type="button" disabled={dirty} onClick={() => { void exportPNG(); }}>PNG 저장</button><button className="praise-button" type="button" disabled={dirty} onClick={() => { void exportPDF(); }}>인쇄 · PDF</button>{dirty && <span className="praise-badge">초안 저장 후 확정·내보내기 가능</span>}</div>
      {exportError && <p role="alert" className="praise-error">{exportError}</p>}
      {version.imported && <p className="praise-note">외부 사이트에서 이관한 등단표입니다.{version.nameSnapshotAsOf ? ` 이관 시점 명단 기준 · ${sourceTime(version.nameSnapshotAsOf)}` : " 당시 명단 기준 시각은 확인되지 않았습니다."}</p>}
      <WarningList warnings={version.warnings} />
      {services.length > 1 && <div className={`praise-segment ${styles.mobileServiceChoice}`} role="group" aria-label="등단표 예배 선택">{services.map((service) => <button type="button" aria-pressed={selectedService === service.department} key={service.department} onClick={() => setSelectedService(service.department)}>{service.department === "FIRST" ? "1부 예배" : "2부 예배"}</button>)}</div>}
      {services.map((service) => <section className={`praise-stage-service ${service.department === selectedService ? "" : styles.inactiveService}`} key={service.department}><h3>{service.department === "FIRST" ? "1부" : "2부"} 예배</h3><PraiseStageBoard view={view} meeting={meeting} config={config} overrides={overrides} service={service} leaderName={version.leaderName} canEdit={canEdit && !busy && !stale && !inputStale} onChange={(assignments) => { setServices((current) => current.map((item) => item.department === service.department ? { ...item, assignments } : item)); setDirty(true); }} /></section>)}
      <details className="praise-disclosure"><summary>출석 후보와 제외 사유 {version.candidates.length}명</summary><ul className="praise-candidate-list">{version.candidates.map((candidate) => <li key={candidate.personId}><strong>{view.people.find((person) => person.id === candidate.personId)?.name ?? "보관된 팀원"}</strong><span>{candidate.eligible ? "등단 후보" : "후보 제외"} · {candidate.reason}</span></li>)}</ul></details>
      {canEdit && <div className="praise-save-bar"><label className="praise-check"><input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} />저장된 초안의 조건 경고와 배치를 확인했습니다</label><button className="praise-button" disabled={busy || stale || inputStale} onClick={() => { void save(false); }}>수정 초안 저장</button><button className="praise-button praise-button--primary" disabled={busy || stale || inputStale || dirty || (version.warnings.length > 0 && !acknowledge)} onClick={() => { void save(true); }}>등단표 확정</button></div>}
    </>}
  </div></fieldset>;
}
