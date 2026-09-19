"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea, canEditArea } from "@/features/portal/accessPolicy";
import { subscribeApplications, subscribeApplicationsPrivate, subscribeSemesterMeta, subscribeSessions, subscribeTeams, subscribeTrainingClasses } from "@/features/semester/db";
import type { Application, ApplicationPrivate, SemesterMeta, Session, Team, TrainingClass } from "@/features/semester/types";
import { SemesterEditProvider } from "@/features/semester/EditContext";
import { canAccessOperationsCenter, canReadSemesterPrivate } from "@/features/teams/teamModel";
import AttendanceTab from "@/app/semester/[id]/AttendanceTab";
import CurriculumTab from "@/app/semester/[id]/CurriculumTab";
import TrainingAccessState from "./TrainingAccessState";

export type TrainingTermSection = "overview" | "roster" | "attendance" | "curriculum";
const SECTIONS: Array<{ key: TrainingTermSection; label: string }> = [
  { key: "overview", label: "개요" }, { key: "roster", label: "명단" },
  { key: "attendance", label: "출석" }, { key: "curriculum", label: "커리큘럼" },
];

export default function TrainingTermWorkspace({ semesterId, section }: { semesterId: string; section: TrainingTermSection }) {
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
  const [ready, setReady] = useState(new Set<string>());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !allowed) return;
    const mark = (key: string) => setReady((current) => new Set(current).add(key));
    const fail = (key: string) => (reason: Error) => { setError(reason.message); mark(key); };
    if (!privateAllowed) mark("private");
    const unsubs = [
      subscribeSemesterMeta(semesterId, (value) => { setMeta(value); mark("meta"); }, fail("meta")),
      subscribeTeams(semesterId, (value) => { setTeams(value); mark("teams"); }, fail("teams")),
      subscribeTrainingClasses(semesterId, (value) => { setTrainingClasses(value); mark("training"); }, fail("training")),
      subscribeSessions(semesterId, (value) => { setSessions(value); mark("sessions"); }, fail("sessions")),
      subscribeApplications(semesterId, (value) => { setApplications(value); mark("applications"); }, fail("applications")),
    ];
    if (privateAllowed) unsubs.push(subscribeApplicationsPrivate(semesterId, (value) => { setPrivates(value); mark("private"); }, fail("private")));
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [allowed, privateAllowed, semesterId, user]);

  const roster = useMemo(() => applications.filter((application) => application.status !== "취소" && !!application.trainingClassId), [applications]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const classById = useMemo(() => new Map(trainingClasses.map((item) => [item.id, item])), [trainingClasses]);
  const upcoming = sessions.find((session) => session.date >= new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));

  return <TrainingAccessState allowed={allowed}><main className="team-term-page">
    <header className="team-term-header"><div className="team-workspace-title"><Link href="/training">훈련</Link><span>/</span><span>{semesterId}</span></div><div className="team-term-heading"><div><p className="section-kicker">TRAINING TERM</p><h1>훈련 · {meta?.title ?? semesterId}</h1><p>운영센터의 학기 훈련 데이터를 같은 원장에서 보여줍니다.</p></div>{!editable && <span className="team-role-badge">조회 전용</span>}</div><nav className="team-term-tabs" aria-label={`${semesterId} 훈련 메뉴`}>{SECTIONS.map((item) => <Link key={item.key} href={`/training/terms/${encodeURIComponent(semesterId)}/${item.key}`} aria-current={section === item.key ? "page" : undefined}>{item.label}</Link>)}</nav></header>
    <section className="team-term-content">{error && <div className="team-first-alert" role="alert">훈련 정보를 불러오지 못했습니다: {error}</div>}{ready.size < 6 ? <WorkspaceSkeleton label="훈련 학기 정보를 불러오는 중입니다." rows={7} variant="page" /> : <><SemesterEditProvider canEdit={editable}>
      {!editable && <ReadOnlyBanner what={`${semesterId} 훈련 기록`} why="교역자와 행정팀이 운영센터 권한으로 수정할 수 있습니다." />}
      {section === "overview" && <div className="team-overview-grid"><section className="team-stat-card"><span>훈련반</span><strong>{trainingClasses.length}개</strong><p>{trainingClasses.map((item) => item.name).join(" · ") || "등록된 훈련반 없음"}</p></section><section className="team-stat-card"><span>훈련 명단</span><strong>{roster.length}명</strong><p>{upcoming ? `다음 모임 ${upcoming.date}` : "예정된 회차 없음"}</p></section><section className="team-goal-card"><span>운영 기준</span><p>훈련과 사역팀은 같은 학기 신청자를 공유하며, 출석 원장만 훈련과 팀으로 분리합니다.</p></section></div>}
      {section === "roster" && <TrainingRoster roster={roster} classById={classById} teamById={teamById} privates={privates} showContacts={privateAllowed} />}
      {section === "attendance" && <AttendanceTab sid={semesterId} meta={meta} teams={teams} trainingClasses={trainingClasses} sessions={sessions} applications={applications} teamById={teamById} lockedScope="training" />}
      {section === "curriculum" && <CurriculumTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} sessions={sessions} lockedScope="training" />}
    </SemesterEditProvider></>}</section>
  </main></TrainingAccessState>;
}

function TrainingRoster({ roster, classById, teamById, privates, showContacts }: { roster: Application[]; classById: Map<string, TrainingClass>; teamById: Map<string, Team>; privates: Record<string, ApplicationPrivate>; showContacts: boolean }) {
  const visibilityClass = showContacts ? "" : " is-public";
  return <section className="team-roster-panel"><header><div><h2>훈련 명단</h2><p>{showContacts ? "훈련반과 사역팀 배치, 신청 연락처를 한 행에서 확인합니다." : "훈련반과 사역팀 배치를 한 행에서 확인합니다."}</p></div><span>{roster.length}명</span></header>{roster.length === 0 ? <div className="team-first-empty is-compact"><p>훈련반에 배치된 인원이 없습니다.</p></div> : <div className="training-roster-table" role="table" aria-label="훈련 명단"><div className={`training-roster-head${visibilityClass}`} role="row"><span>이름</span><span>훈련반</span><span>사역팀</span>{showContacts && <span>연락처</span>}</div>{roster.map((person) => { const contact = privates[person.id]; return <div key={person.id} className={`training-roster-row${visibilityClass}`} role="row"><span><strong>{person.name}</strong><small>{person.bu} {person.grade}학년 {person.class}반</small></span><span>{classById.get(person.trainingClassId ?? "")?.name ?? "반 미정"}</span><span>{teamById.get(person.teamId ?? "")?.name ?? "미배치"}</span>{showContacts && <span className="team-contact-list">{contact?.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : <em>연락처 없음</em>}{contact?.parentPhone && <small>보호자 {contact.parentPhone}</small>}</span>}</div>; })}</div>}</section>;
}
