"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, MagnifyingGlass, NotePencil } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import WorkspaceAccessGate from "@/components/WorkspaceAccessGate";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import LoadFailureNotice from "@/components/LoadFailureNotice";
import { canEditArea } from "@/features/portal/accessPolicy";
import { useRetreatPinGate } from "@/features/portal/useRetreatPinGate";
import RetreatPinGate from "@/app/retreat/[id]/field/RetreatPinGate";
import { subscribeToRetreats, subscribeToRetreatPrograms, subscribeToRetreatProgramMeetings } from "@/lib/db";
import { meetingDecisions, programMeetings } from "@/lib/programPreparation";
import type { Retreat, RetreatProgram, RetreatProgramMeeting } from "@/lib/types";
import styles from "./meetings.module.css";

export default function MeetingsHome() {
  const { user, roles } = useAuth();
  const allowed = canEditArea("retreat-admin", roles);
  return <WorkspaceAccessGate allowed={allowed} area="회의록" backHref="/events" backLabel="수련회 목록으로">
    <MeetingsWorkspace key={`${user?.uid ?? "guest"}:${roles.semester}:${roles.retreat}`} />
  </WorkspaceAccessGate>;
}

function MeetingsWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  const query = useSearchParams();
  const [retreats, setRetreats] = useState<Retreat[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const selectedId = query.get("retreat") ?? "";
  const selected = retreats.find((retreat) => retreat.id === selectedId);
  function selectRetreat(id: string) {
    const params = new URLSearchParams(query.toString());
    if (id) params.set("retreat", id);
    else params.delete("retreat");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToRetreats((items) => {
      if (!active) return;
      setRetreats(items);
      setReady(true);
      setError(false);
    }, () => { if (active) { setError(true); setReady(true); } });
    return () => { active = false; unsubscribe(); };
  }, [attempt]);

  return <main className={`team-first-page ${styles.page}`}>
    <header className={styles.heading}>
      <div><h1>회의록</h1><p>수련회 프로그램 준비회의와 결정 사항을 모아봅니다.</p></div>
      <Link href="/events" className="btn-secondary">수련회로 이동<ArrowRight aria-hidden="true" size={16} /></Link>
    </header>
    {error ? <LoadFailureNotice title="수련회 목록을 불러오지 못했습니다." onRetry={() => setAttempt((value) => value + 1)} />
      : !ready ? <WorkspaceSkeleton label="수련회 목록을 불러오고 있습니다." rows={3} />
        : retreats.length === 0 ? <section className={styles.empty}><NotePencil size={28} aria-hidden="true" /><h2>등록된 수련회가 없습니다</h2><p>수련회를 등록한 뒤 프로그램 준비에서 회의를 시작할 수 있습니다.</p><Link href="/events" className="btn-primary">수련회 목록으로</Link></section>
          : <>
            <label className={styles.retreatSelector}><span>회의록을 볼 수련회</span><select className="input" value={selected?.id ?? ""} onChange={(event) => selectRetreat(event.target.value)}><option value="">수련회를 선택하세요</option>{retreats.map((retreat) => <option key={retreat.id} value={retreat.id}>{retreat.year}년 · {retreat.name}</option>)}</select></label>
            {selected ? <RetreatMeetingsGate key={selected.id} retreat={selected} onBack={() => selectRetreat("")} />
              : <section className={styles.empty}><NotePencil size={28} aria-hidden="true" /><h2>수련회를 먼저 선택하세요</h2><p>선택한 수련회의 프로그램별 회의와 결정 사항이 나타납니다.</p></section>}
          </>}
  </main>;
}

function RetreatMeetingsGate({ retreat, onBack }: { retreat: Retreat; onBack: () => void }) {
  const { roles } = useAuth();
  const gate = useRetreatPinGate(retreat.id, { enabled: true, roles });
  if (gate.lockError) return <LoadFailureNotice title="수련회 잠금 상태를 확인하지 못했습니다." onRetry={gate.retryLock} />;
  if (gate.lock === undefined) return <WorkspaceSkeleton label="수련회 잠금 상태를 확인하고 있습니다." rows={2} />;
  if (!gate.unlocked && gate.lock) return <RetreatPinGate retreatId={retreat.id} lock={gate.lock} onUnlocked={gate.markUnlocked} onBack={onBack} />;
  if (!gate.unlocked) return null;
  return <RetreatMeetingList retreat={retreat} />;
}

function RetreatMeetingList({ retreat }: { retreat: Retreat }) {
  const [programs, setPrograms] = useState<RetreatProgram[]>([]);
  const [meetings, setMeetings] = useState<Record<string, Record<string, RetreatProgramMeeting>>>({});
  const [ready, setReady] = useState({ programs: false, meetings: false });
  const [errors, setErrors] = useState({ programs: false, meetings: false });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    let active = true;
    const receive = <T,>(key: "programs" | "meetings", setter: (value: T) => void) => (value: T) => {
      if (!active) return;
      setter(value);
      setReady((current) => ({ ...current, [key]: true }));
      setErrors((current) => ({ ...current, [key]: false }));
    };
    const fail = (key: "programs" | "meetings") => () => { if (active) setErrors((current) => ({ ...current, [key]: true })); };
    const unsubs = [
      subscribeToRetreatPrograms(retreat.id, receive("programs", setPrograms), fail("programs")),
      subscribeToRetreatProgramMeetings(retreat.id, receive("meetings", setMeetings), fail("meetings")),
    ];
    return () => { active = false; unsubs.forEach((unsubscribe) => unsubscribe()); };
  }, [retreat.id, attempt]);

  const rows = useMemo(() => Object.entries(meetings).flatMap(([programId, records]) => {
    const program = programs.find((item) => item.id === programId);
    return programMeetings({ meetings: records }).map((meeting) => ({ programId, program, meeting, decisions: meetingDecisions(meeting) }));
  }).sort((a, b) => b.meeting.date.localeCompare(a.meeting.date) || b.meeting.createdAt - a.meeting.createdAt || a.meeting.id.localeCompare(b.meeting.id)), [meetings, programs]);
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  const filtered = rows.filter(({ program, meeting, decisions }) => (status === "all" || (status === "closed" ? meeting.closed : !meeting.closed))
    && (!normalizedQuery || [program?.title, meeting.title, meeting.agenda, meeting.notes, ...decisions.flatMap((decision) => [decision.title, decision.assignee])].some((value) => value?.toLocaleLowerCase("ko").includes(normalizedQuery))));
  const programsHref = `/events/${encodeURIComponent(retreat.id)}/programs`;

  if (errors.programs || errors.meetings) return <LoadFailureNotice title="회의록을 불러오지 못했습니다." sources={[...(errors.programs ? ["프로그램 목록"] : []), ...(errors.meetings ? ["회의 기록"] : [])]} onRetry={() => setAttempt((value) => value + 1)} />;
  if (!ready.programs || !ready.meetings) return <WorkspaceSkeleton label="선택한 수련회의 회의록을 불러오고 있습니다." rows={4} />;

  return <section className={styles.workspace} aria-label={`${retreat.name} 회의록`}>
    <div className={styles.workspaceHeading}><div><h2>{retreat.name}</h2><p>{rows.length}개의 회의 기록</p></div><Link href={programsHref} className="btn-secondary">프로그램에서 회의 시작<ArrowRight aria-hidden="true" size={16} /></Link></div>
    {rows.length === 0 ? <div className={styles.empty}><h3>아직 작성된 회의록이 없습니다</h3><p>프로그램 준비에서 회의를 시작하면 여기에 함께 모입니다.</p></div>
      : <>
        <div className={styles.filters}><label className={styles.search}><MagnifyingGlass size={19} aria-hidden="true" /><input type="search" aria-label="회의록 검색" placeholder="회의 제목, 프로그램, 안건 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className={styles.statusFilter}><span className="sr-only">회의 상태</span><select className="input" aria-label="회의 상태" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">모든 회의</option><option value="open">진행 중</option><option value="closed">마친 회의</option></select></label></div>
        <p className={styles.resultCount} aria-live="polite">{filtered.length}개 회의</p>
        {filtered.length === 0 ? <div className={styles.empty}><h3>검색 결과가 없습니다</h3><p>다른 검색어나 회의 상태를 선택해 보세요.</p><button type="button" className="btn-secondary" onClick={() => { setQuery(""); setStatus("all"); }}>검색 초기화</button></div>
          : <div className={styles.meetingList}>{filtered.map(({ programId, program, meeting, decisions }) => {
            const unresolved = decisions.filter((decision) => decision.status !== "decided").length;
            const linkedTasks = decisions.filter((decision) => decision.taskId).length;
            return <article key={`${programId}:${meeting.id}`} className={styles.meeting}>
              <div className={styles.meetingMeta}><span>{program?.title ?? "연결 프로그램 없음"}</span><time dateTime={meeting.date}>{meeting.date || "날짜 미정"}</time><span className={styles.badge}>{meeting.closed ? "회의 마침" : "진행 중"}</span></div>
              <h3>{meeting.title || "제목 없는 회의"}</h3>
              {meeting.agenda && <p className={styles.agenda}>{meeting.agenda}</p>}
              <div className={styles.meetingFooter}><div className={styles.counts}><span>결정 사항 {decisions.length}건</span>{unresolved > 0 && <span>미결정 {unresolved}건</span>}{linkedTasks > 0 && <span>할 일 연결 {linkedTasks}건</span>}{meeting.nextMeetingDate && <span>다음 회의 {meeting.nextMeetingDate}</span>}</div>{program ? <Link className={styles.openLink} href={`${programsHref}?workspace=programs&program=${encodeURIComponent(programId)}&section=overview&meeting=1&meetingId=${encodeURIComponent(meeting.id)}`}>회의록 열기<ArrowRight size={17} aria-hidden="true" /></Link> : <span className={styles.orphanNote}>프로그램 연결을 확인해 주세요. 회의 기록은 보존되어 있습니다.</span>}</div>
            </article>;
          })}</div>}
      </>}
  </section>;
}
