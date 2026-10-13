"use client";

import { ArrowRight, CheckCircle, Plus, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import OverlayShell from "@/components/OverlayShell";
import { useUI } from "@/context/UIContext";
import { seoulDateKey } from "@/features/portal/dailyMinistryMessage";
import { meetingDecisions, programMeetings } from "@/lib/programPreparation";
import type { RetreatProgram, RetreatProgramDecision, RetreatProgramMeeting, RetreatProgramPost } from "@/lib/types";
import ProgramAutosaveField from "./ProgramAutosaveField";

type Props = {
  program: RetreatProgram;
  posts: RetreatProgramPost[];
  canEdit: boolean;
  onClose: () => void;
  onCreateMeeting: (data: Omit<RetreatProgramMeeting, "id" | "createdAt" | "updatedAt" | "decisions">) => Promise<string>;
  onUpdateMeeting: (meetingId: string, data: Partial<RetreatProgramMeeting>) => Promise<void>;
  onCreateDecision: (meetingId: string, data: Omit<RetreatProgramDecision, "id" | "createdAt" | "updatedAt" | "taskId">) => Promise<string>;
  onUpdateDecision: (meetingId: string, decisionId: string, data: Partial<RetreatProgramDecision>) => Promise<void>;
  onConvertDecision: (meetingId: string, decision: RetreatProgramDecision) => Promise<string>;
};

export default function ProgramMeetingMode({ program, posts, canEdit, onClose, onCreateMeeting, onUpdateMeeting, onCreateDecision, onUpdateDecision, onConvertDecision }: Props) {
  const { toast } = useUI();
  const meetings = useMemo(() => programMeetings(program), [program]);
  const [selectedId, setSelectedId] = useState<string | null>(() => meetings.find((meeting) => !meeting.closed)?.id ?? meetings[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [decision, setDecision] = useState({ title: "", assignee: "", dueDate: "", postId: "" });
  const [busy, setBusy] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const selected = meetings.find((meeting) => meeting.id === selectedId) ?? meetings[0] ?? null;

  useEffect(() => setCloseConfirm(false), [selected?.id]);

  function requestClose() {
    if (busy || creating) {
      toast("저장이 끝난 뒤 회의 화면을 닫아 주세요.", "warning");
      return;
    }
    // 자동 저장 필드는 blur에서 저장을 시작한다. 먼저 blur를 발생시킨 뒤 다음 tick에 닫는다.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".program-meeting-dialog")) active.blur();
    window.setTimeout(onClose, 0);
  }

  async function startMeeting() {
    setCreating(true);
    try {
      const date = seoulDateKey();
      const id = await onCreateMeeting({ title: `${date.slice(5).replace("-", "/")} 프로그램 준비회의`, date, closed: false });
      setSelectedId(id);
    } catch (error) {
      toast(error instanceof Error ? error.message : "회의를 시작하지 못했습니다.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function updateMeeting(data: Partial<RetreatProgramMeeting>, errorMessage: string, successMessage?: string) {
    if (!selected) return false;
    setBusy(true);
    try {
      await onUpdateMeeting(selected.id, data);
      if (successMessage) toast(successMessage, "success");
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : errorMessage, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateDecisionStatus(entry: RetreatProgramDecision, status: RetreatProgramDecision["status"]) {
    if (!selected) return;
    setBusy(true);
    try {
      await onUpdateDecision(selected.id, entry.id, { status });
    } catch (error) {
      toast(error instanceof Error ? error.message : "결정 상태를 바꾸지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addDecision() {
    if (!selected || !decision.title.trim()) return;
    setBusy(true);
    try {
      await onCreateDecision(selected.id, {
        title: decision.title.trim(),
        status: "discussing",
        assignee: decision.assignee.trim() || undefined,
        dueDate: decision.dueDate || undefined,
        postId: decision.postId || undefined,
      });
      setDecision({ title: "", assignee: "", dueDate: "", postId: "" });
    } catch (error) {
      toast(error instanceof Error ? error.message : "결정 항목을 추가하지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function convertDecision(entry: RetreatProgramDecision) {
    if (!selected) return;
    setBusy(true);
    try {
      await onConvertDecision(selected.id, entry);
      toast("결정을 실행 할 일로 연결했습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "할 일로 연결하지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }

  const decisions = selected ? meetingDecisions(selected) : [];
  const unresolved = decisions.filter((entry) => entry.status === "discussing").length;

  return (
    <OverlayShell label="프로그램 준비회의" onClose={requestClose} closeOnBackdrop={false} variant="fullscreen-mobile" panelClassName="program-meeting-dialog">
      <div className="program-meeting-shell">
        <header className="program-meeting-header">
          <div>
            <span>{program.title}</span>
            <h2>준비회의</h2>
            <small>회의 기록은 관리자 전용입니다. 연락처나 건강 정보 같은 민감정보는 별도 관리 화면에 기록해 주세요.</small>
          </div>
          <button type="button" className="program-meeting-close" onClick={requestClose} aria-label="회의 모드 닫기"><X aria-hidden="true" size={20} /></button>
        </header>
        <aside className="program-meeting-history" aria-label="회의 목록">
          <button type="button" className="btn-primary" disabled={!canEdit || creating || busy} onClick={() => void startMeeting()}><Plus aria-hidden="true" size={16} /> 새 회의 시작</button>
          {meetings.map((meeting) => (
            <button key={meeting.id} type="button" data-active={meeting.id === selected?.id ? "true" : undefined} aria-current={meeting.id === selected?.id ? "true" : undefined} onClick={() => setSelectedId(meeting.id)}>
              <strong>{meeting.title}</strong><span>{meeting.date} · {meeting.closed ? "마침" : "진행 중"}</span>
            </button>
          ))}
        </aside>
        <div className="program-meeting-main" role="region" aria-label="선택한 준비회의">
          {!selected ? (
            <div className="program-meeting-empty"><h3>아직 준비회의가 없습니다</h3>{canEdit && <button type="button" className="btn-primary" disabled={creating} onClick={() => void startMeeting()}>회의 시작</button>}</div>
          ) : (
            <>
              <div className="program-meeting-title">
                <div><strong>{selected.title}</strong><span>{selected.date}</span></div>
                {canEdit && (selected.closed ? (
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void updateMeeting({ closed: false }, "회의를 다시 열지 못했습니다.", "회의를 다시 열었습니다.")}>회의 다시 열기</button>
                ) : (
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => setCloseConfirm(true)}><CheckCircle aria-hidden="true" size={16} /> 회의 마치기</button>
                ))}
              </div>
              {closeConfirm && (
                <div className="program-meeting-close-confirm" role="alert">
                  <div><strong>이 회의를 마칠까요?</strong><span>{unresolved > 0 ? `논의 중인 항목 ${unresolved}건은 기록에 남고, 다시 열기 전까지 편집할 수 없습니다.` : "기록은 보존되며 필요하면 언제든 다시 열 수 있습니다."}</span></div>
                  <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => setCloseConfirm(false)}>계속 회의</button>
                  <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void updateMeeting({ closed: true }, "회의를 마치지 못했습니다.", "회의를 마쳤습니다.").then((saved) => { if (saved) setCloseConfirm(false); })}>회의 마치기</button>
                </div>
              )}
              <section className="program-meeting-notes" aria-label="회의 안건과 기록">
                <label className="program-field"><span>오늘 결정할 안건</span><ProgramAutosaveField value={selected.agenda ?? ""} ariaLabel={`${selected.title} 오늘 결정할 안건`} multiline rows={5} maxLength={4000} placeholder="한 줄에 하나씩 적어 주세요." disabled={!canEdit || selected.closed} onSave={(agenda) => onUpdateMeeting(selected.id, { agenda })} errorMessage="안건을 저장하지 못했습니다." /></label>
                <label className="program-field"><span>논의 메모</span><ProgramAutosaveField value={selected.notes ?? ""} ariaLabel={`${selected.title} 논의 메모`} multiline rows={5} maxLength={6000} placeholder="후보안, 확인할 내용, 다음 회의로 넘길 내용을 적어 주세요." disabled={!canEdit || selected.closed} onSave={(notes) => onUpdateMeeting(selected.id, { notes })} errorMessage="회의 메모를 저장하지 못했습니다." /></label>
                <label className="program-field"><span>다음 회의</span><input type="date" className="input" value={selected.nextMeetingDate ?? ""} disabled={!canEdit || selected.closed || busy} onChange={(event) => void updateMeeting({ nextMeetingDate: event.target.value || null }, "다음 회의 날짜를 저장하지 못했습니다.")} /></label>
              </section>
              <section className="program-decision-section" aria-labelledby="program-decision-heading">
                <div className="program-subsection-heading"><div><h3 id="program-decision-heading">결정과 실행</h3></div><span className="program-count">{decisions.length}건</span></div>
                {canEdit && !selected.closed && (
                  <div className="program-decision-form">
                    <label className="program-field program-field--wide"><span>논의·결정 항목</span><input className="input" value={decision.title} maxLength={120} placeholder="예: 메인 게임은 연합팀 경쟁으로 진행" onChange={(event) => setDecision((current) => ({ ...current, title: event.target.value }))} /></label>
                    <label className="program-field"><span>담당</span><input className="input" value={decision.assignee} maxLength={60} onChange={(event) => setDecision((current) => ({ ...current, assignee: event.target.value }))} /></label>
                    <label className="program-field"><span>기한</span><input type="date" className="input" value={decision.dueDate} onChange={(event) => setDecision((current) => ({ ...current, dueDate: event.target.value }))} /></label>
                    <label className="program-field"><span>관련 블록</span><select className="input" value={decision.postId} onChange={(event) => setDecision((current) => ({ ...current, postId: event.target.value }))}><option value="">프로그램 전체</option>{posts.map((post) => <option key={post.id} value={post.id}>{post.name}</option>)}</select></label>
                    <button type="button" className="btn-primary" disabled={busy || !decision.title.trim()} onClick={() => void addDecision()}><Plus aria-hidden="true" size={16} /> 추가</button>
                  </div>
                )}
                {decisions.length === 0 ? <p className="program-task-empty">아직 결정 항목이 없습니다.</p> : (
                  <ul className="program-decision-list">{decisions.map((entry) => (
                    <li key={entry.id} data-status={entry.status}>
                      <select className="input" aria-label={`${entry.title} 결정 상태`} value={entry.status} disabled={!canEdit || selected.closed || busy} onChange={(event) => void updateDecisionStatus(entry, event.target.value as RetreatProgramDecision["status"])}><option value="discussing">논의 중</option><option value="decided">결정</option><option value="deferred">다음 회의</option></select>
                      <div><strong>{entry.title}</strong><span>{[entry.assignee, entry.dueDate, posts.find((post) => post.id === entry.postId)?.name].filter(Boolean).join(" · ") || "담당과 기한 미정"}</span></div>
                      {entry.taskId ? <span className="program-decision-linked"><CheckCircle aria-hidden="true" size={16} /> 할 일 연결됨</span> : <button type="button" className="btn-secondary btn-sm" disabled={!canEdit || entry.status !== "decided" || busy} onClick={() => void convertDecision(entry)}><ArrowRight aria-hidden="true" size={15} /> 할 일로 보내기</button>}
                    </li>
                  ))}</ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </OverlayShell>
  );
}
