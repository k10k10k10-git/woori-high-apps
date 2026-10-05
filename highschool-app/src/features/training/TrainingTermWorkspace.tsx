"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea, canEditArea } from "@/features/portal/accessPolicy";
import { subscribeApplications, subscribeApplicationsPrivate, subscribeClassesByYear, subscribeSemesterMeta, subscribeSessions, subscribeStaffByYear, subscribeTeams, subscribeTrainingClasses } from "@/features/semester/db";
import type { Application, ApplicationPrivate, ClassInfo, SemesterMeta, Session, StaffPerson, Team, TrainingClass } from "@/features/semester/types";
import { buildRosterContactMap, resolvedContact, type RosterContact } from "@/features/semester/rosterContact";
import { SemesterEditProvider } from "@/features/semester/EditContext";
import { canAccessOperationsCenter, canReadSemesterPrivate } from "@/features/teams/teamModel";
import AttendanceTab from "@/app/semester/[id]/AttendanceTab";
import CurriculumTab from "@/app/semester/[id]/CurriculumTab";
import TrainingAccessState from "./TrainingAccessState";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { REQUIRED_WORKSPACE_SOURCES, WORKSPACE_SOURCE_LABELS } from "@/features/semester/workspaceSources";

export type TrainingTermSection = "overview" | "roster" | "attendance" | "curriculum";
const SECTIONS: Array<{ key: TrainingTermSection; label: string }> = [
  { key: "overview", label: "개요" }, { key: "roster", label: "명단" },
  { key: "attendance", label: "출석" }, { key: "curriculum", label: "커리큘럼" },
];

export default function TrainingTermWorkspace({ semesterId, section }: { semesterId: string; section: TrainingTermSection }) {
  const { user, roles, teamMemberships } = useAuth();
  const [attempt, setAttempt] = useState(0);
  return <TrainingTermContent key={`${user?.uid ?? "guest"}:${roles.semester}:${roles.retreat}:${JSON.stringify(teamMemberships)}:${semesterId}:${attempt}`} semesterId={semesterId} section={section} onRetry={() => setAttempt((value) => value + 1)} />;
}

function TrainingTermContent({ semesterId, section, onRetry }: { semesterId: string; section: TrainingTermSection; onRetry: () => void }) {
  const { user, roles, teamMemberships } = useAuth();
  const allowed = canAccessArea("semester", roles);
  const privateAllowed = canReadSemesterPrivate(roles, teamMemberships);
  const editable = canAccessOperationsCenter(roles, teamMemberships) && canEditArea("semester", roles);
  const [meta, setMeta] = useState<SemesterMeta | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [trainingClasses, setTrainingClasses] = useState<TrainingClass[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [privates, setPrivates] = useState<Record<string, ApplicationPrivate>>({});
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [staff, setStaff] = useState<StaffPerson[]>([]);
  const [ready, setReady] = useState(new Set<string>());
  const { fail: recordFailure, ok, errors, message: error } = useLoadErrors(semesterId);

  useEffect(() => {
    if (!user || !allowed) return;
    const mark = (key: string, success = true) => { setReady((current) => new Set(current).add(key)); if (success) ok(WORKSPACE_SOURCE_LABELS[key]); };
    const fail = (key: string) => (reason: Error) => { recordFailure(WORKSPACE_SOURCE_LABELS[key])(reason); mark(key, false); };
    if (!privateAllowed) { mark("private"); mark("classes"); mark("staff"); }
    const unsubs = [
      subscribeSemesterMeta(semesterId, (value) => { setMeta(value); mark("meta"); }, fail("meta")),
      subscribeTeams(semesterId, (value) => { setTeams(value); mark("teams"); }, fail("teams")),
      subscribeTrainingClasses(semesterId, (value) => { setTrainingClasses(value); mark("training"); }, fail("training")),
      subscribeSessions(semesterId, (value) => { setSessions(value); mark("sessions"); }, fail("sessions")),
      subscribeApplications(semesterId, (value) => { setApplications(value); mark("applications"); }, fail("applications")),
    ];
    if (privateAllowed) {
      const year = semesterId.split("-")[0];
      unsubs.push(
        subscribeApplicationsPrivate(semesterId, (value) => { setPrivates(value); mark("private"); }, fail("private")),
        subscribeClassesByYear(year, (value) => { setClasses(value); mark("classes"); }, fail("classes")),
        subscribeStaffByYear(year, (value) => { setStaff(value); mark("staff"); }, fail("staff")),
      );
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [allowed, privateAllowed, semesterId, user, ok, recordFailure]);

  const roster = useMemo(() => applications.filter((application) => application.status !== "취소" && !!application.trainingClassId), [applications]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const classById = useMemo(() => new Map(trainingClasses.map((item) => [item.id, item])), [trainingClasses]);
  const rosterContacts = useMemo(() => buildRosterContactMap(classes, staff, applications), [applications, classes, staff]);
  const upcoming = sessions.find((session) => session.type !== "휴강" && session.date >= new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  const blocked = REQUIRED_WORKSPACE_SOURCES.some((key) => errors[WORKSPACE_SOURCE_LABELS[key]]);

  return <TrainingAccessState allowed={allowed}><main className="team-term-page">
    <header className="team-term-header"><div className="team-workspace-title"><Link href="/training">훈련</Link><span>/</span><span>{semesterId}</span></div><div className="team-term-heading"><div><p className="section-kicker">TRAINING TERM</p><h1>훈련 · {meta?.title ?? semesterId}</h1><p>운영센터의 학기 훈련 데이터를 같은 원장에서 보여줍니다.</p></div>{!editable && <span className="team-role-badge">조회 전용</span>}</div><nav className="team-term-tabs" aria-label={`${semesterId} 훈련 메뉴`}>{SECTIONS.map((item) => <Link key={item.key} href={`/training/terms/${encodeURIComponent(semesterId)}/${item.key}`} aria-current={section === item.key ? "page" : undefined}>{item.label}</Link>)}</nav></header>
    <section className="team-term-content">{error && <div className="team-first-alert" role="alert">일부 훈련 정보를 불러오지 못했습니다: {error}<button className="btn-secondary" onClick={onRetry}>다시 불러오기</button></div>}{ready.size < 8 ? <WorkspaceSkeleton label="훈련 학기 정보를 불러오는 중입니다." rows={7} variant="page" /> : blocked ? <div className="team-first-state">훈련 명단과 회차를 확인한 뒤 기록을 열 수 있습니다. 다시 불러오기를 눌러 주세요.</div> : <><SemesterEditProvider canEdit={editable}>
      {!editable && <ReadOnlyBanner what={`${semesterId} 훈련 기록`} why="교역자와 행정팀이 운영센터 권한으로 수정할 수 있습니다." />}
      {section === "overview" && <div className="team-overview-grid"><section className="team-stat-card"><span>훈련반</span><strong>{trainingClasses.length}개</strong><p>{trainingClasses.map((item) => item.name).join(" · ") || "등록된 훈련반 없음"}</p></section><section className="team-stat-card"><span>훈련 명단</span><strong>{roster.length}명</strong><p>{upcoming ? `다음 모임 ${upcoming.date}` : "예정된 회차 없음"}</p></section><section className="team-goal-card"><span>운영 기준</span><p>훈련과 사역팀은 같은 학기 신청자를 공유하며, 출석 원장만 훈련과 팀으로 분리합니다.</p></section></div>}
      {section === "roster" && <TrainingRoster roster={roster} classById={classById} teamById={teamById} privates={privates} rosterContacts={rosterContacts} showContacts={privateAllowed} />}
      {section === "attendance" && <AttendanceTab sid={semesterId} meta={meta} teams={teams} trainingClasses={trainingClasses} sessions={sessions} applications={applications} teamById={teamById} lockedScope="training" />}
      {section === "curriculum" && <CurriculumTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} sessions={sessions} lockedScope="training" />}
    </SemesterEditProvider></>}</section>
  </main></TrainingAccessState>;
}

export function TrainingRoster({ roster, classById, teamById, privates, rosterContacts, showContacts }: { roster: Application[]; classById: Map<string, TrainingClass>; teamById: Map<string, Team>; privates: Record<string, ApplicationPrivate>; rosterContacts: Record<string, RosterContact>; showContacts: boolean }) {
  const [query, setQuery] = useState("");
  const [trainingId, setTrainingId] = useState("");
  const normalized = query.normalize("NFC").replace(/\s/g, "").toLocaleLowerCase();
  const filtered = roster.filter((person) => person.name.normalize("NFC").replace(/\s/g, "").toLocaleLowerCase().includes(normalized) && (!trainingId || person.trainingClassId === trainingId));
  const visibilityClass = showContacts ? "" : " is-public";
  const rows = filtered.map((person) => ({
    person,
    identity: person.bu === "스탭" ? "스탭" : `${person.bu} ${person.grade}학년 ${person.class}반`,
    trainingClass: classById.get(person.trainingClassId ?? "")?.name ?? "반 미정",
    team: teamById.get(person.teamId ?? "")?.name ?? "미배치",
    contact: showContacts ? resolvedContact(privates[person.id], rosterContacts[person.id]) : null,
  }));
  return <section className="team-roster-panel"><header><div><h2>훈련 명단</h2><p>훈련반과 사역팀 배치{showContacts ? ", 연락처" : ""}를 확인합니다.</p></div><span role="status">{filtered.length} / {roster.length}명</span></header><div className="team-roster-filters"><label>이름 검색<input className="input" type="search" placeholder="이름으로 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>훈련반<select className="input" value={trainingId} onChange={(event) => setTrainingId(event.target.value)}><option value="">전체 훈련반</option>{[...classById.values()].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>{filtered.length === 0 ? <div className="team-first-empty is-compact"><p>{query || trainingId ? "검색 조건에 맞는 인원이 없습니다." : "훈련반에 배치된 인원이 없습니다."}</p></div> : <>
    <div className="training-roster-table" role="table" aria-label="훈련 명단"><div className={`training-roster-head${visibilityClass}`} role="row"><span role="columnheader">이름</span><span role="columnheader">훈련반</span><span role="columnheader">사역팀</span>{showContacts && <span role="columnheader">연락처</span>}</div>{rows.map(({ person, identity, trainingClass, team, contact }) => <div key={person.id} className={`training-roster-row${visibilityClass}`} role="row"><span role="cell"><strong>{person.name}</strong><small>{identity}</small></span><span role="cell">{trainingClass}</span><span role="cell">{team}</span>{showContacts && <span role="cell" className="team-contact-list">{contact?.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : <em>연락처 없음</em>}{contact?.parentPhone && <small>보호자 <a href={`tel:${contact.parentPhone}`}>{contact.parentPhone}</a></small>}</span>}</div>)}</div>
    <div className="training-roster-cards" aria-label="훈련 명단">{rows.map(({ person, identity, trainingClass, team, contact }) => <article className="training-roster-card" key={person.id}><div className="training-roster-card-person"><strong>{person.name}</strong><span>{identity}</span></div><dl><div><dt>훈련반</dt><dd>{trainingClass}</dd></div><div><dt>사역팀</dt><dd>{team}</dd></div>{contact && <div><dt>연락처</dt><dd>{contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : "연락처 없음"}{contact.parentPhone && <small>보호자 <a href={`tel:${contact.parentPhone}`}>{contact.parentPhone}</a></small>}</dd></div>}</dl></article>)}</div>
  </>}</section>;
}
