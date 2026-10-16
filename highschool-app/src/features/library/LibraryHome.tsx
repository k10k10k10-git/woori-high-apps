"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Books, CalendarBlank, MagnifyingGlass } from "@phosphor-icons/react";
import WorkspaceAccessGate from "@/components/WorkspaceAccessGate";
import LoadFailureNotice from "@/components/LoadFailureNotice";
import { useAuth } from "@/context/AuthContext";
import { subscribeArchiveLinks, subscribeSemesters, subscribeTeams } from "@/features/semester/db";
import type { ArchiveLink, Semester, Team } from "@/features/semester/types";
import { hasAnyMinistryRole, type MinistryRoles } from "@/features/portal/accessPolicy";
import { SUNDAY_MINISTRY_TEAMS } from "@/features/portal/featureCatalog";
import { activeTeamKeys, canAccessOperationsCenter, canBrowseEveryTeam, semesterTeamForKey, type TeamMemberships } from "@/features/teams/teamModel";
import styles from "./LibraryHome.module.css";

const KIND_LABEL: Record<ArchiveLink["kind"], string> = {
  doc: "문서", sheet: "시트", drive: "드라이브", video: "영상", etc: "기타",
};

export default function LibraryHome() {
  const { user, loading, roleError, roles, teamMemberships } = useAuth();
  const [attempt, setAttempt] = useState(0);
  return <WorkspaceAccessGate allowed={hasAnyMinistryRole(roles) || activeTeamKeys(teamMemberships).length > 0} area="학기 자료">
    <LibraryForUser key={`${user?.uid}:${loading}:${!!roleError}:${roles.semester}:${roles.retreat}:${JSON.stringify(teamMemberships)}:${attempt}`} roles={roles} teamMemberships={teamMemberships} onRetry={() => setAttempt(value => value + 1)} />
  </WorkspaceAccessGate>;
}

function LibraryForUser({ roles, teamMemberships, onRetry }: { roles: MinistryRoles; teamMemberships: TeamMemberships; onRetry: () => void }) {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [teamsByTerm, setTeamsByTerm] = useState<Record<string, Team[]>>({});
  const [readyTeams, setReadyTeams] = useState<Set<string>>(new Set());
  const [linksByTerm, setLinksByTerm] = useState<Record<string, ArchiveLink[]>>({});
  const [readyLinks, setReadyLinks] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ArchiveLink["kind"] | "all">("all");
  const central = canAccessOperationsCenter(roles, teamMemberships);
  const everyTeam = canBrowseEveryTeam(roles);

  useEffect(() => subscribeSemesters(
    (items) => { setSemesters(items); setReady(true); },
    () => { setError(true); setReady(true); },
  ), []);

  const eligibleTerms = useMemo(() => semesters.filter((semester) =>
    central || everyTeam || activeTeamKeys(teamMemberships, semester.id).length > 0,
  ), [central, everyTeam, semesters, teamMemberships]);
  const eligibleIds = eligibleTerms.map((semester) => semester.id).join("\u0000");

  useEffect(() => {
    if (central || !eligibleIds) return;
    const unsubscribers = eligibleIds.split("\u0000").map((id) => subscribeTeams(
      id,
      (teams) => { setTeamsByTerm((current) => ({ ...current, [id]: teams })); setReadyTeams((current) => new Set(current).add(id)); },
      () => { setError(true); setReadyTeams((current) => new Set(current).add(id)); },
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [central, eligibleIds]);

  const visibleTerms = useMemo(() => eligibleTerms.map((semester) => {
    if (central) return { semester, href: `/operations/semesters/${encodeURIComponent(semester.id)}/archive` };
    if (!readyTeams.has(semester.id)) return null;
    const team = SUNDAY_MINISTRY_TEAMS.find(({ key }) =>
      (everyTeam || activeTeamKeys(teamMemberships, semester.id).includes(key))
      && semesterTeamForKey(teamsByTerm[semester.id] ?? [], key),
    );
    return team ? { semester, href: `/teams/${team.key}/terms/${encodeURIComponent(semester.id)}/records` } : null;
  }).filter((term): term is { semester: Semester; href: string } => term !== null), [central, eligibleTerms, everyTeam, readyTeams, teamMemberships, teamsByTerm]);
  const visibleIds = visibleTerms.map(({ semester }) => semester.id).join("\u0000");

  useEffect(() => {
    if (!visibleIds) return;
    const unsubscribers = visibleIds.split("\u0000").map((id) => subscribeArchiveLinks(
      id,
      (links) => { setLinksByTerm((current) => ({ ...current, [id]: links })); setReadyLinks((current) => new Set(current).add(id)); },
      () => { setError(true); setReadyLinks((current) => new Set(current).add(id)); },
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [visibleIds]);

  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  const records = visibleTerms.flatMap(({ semester, href }) => (linksByTerm[semester.id] ?? [])
    .filter((link) => !link.deletionPending && (kind === "all" || link.kind === kind)
      && (!normalizedQuery || `${link.title ?? ""} ${semester.meta.title} ${KIND_LABEL[link.kind] ?? "기타"}`.toLocaleLowerCase("ko-KR").includes(normalizedQuery)))
    .map((link) => ({ link, semester, href })));
  const finished = ready && (central || eligibleTerms.every(({ id }) => readyTeams.has(id)))
    && visibleTerms.every(({ semester }) => readyLinks.has(semester.id));

  return <main className="team-first-page">
    <header className="team-first-page-header"><div><h1>자료</h1><p>사이트 사용법, 고등부 사역 가이드와 학기 자료를 여기서 찾습니다.</p></div></header>

    <section className={styles.guide} aria-labelledby="library-help-heading">
      <div><MagnifyingGlass size={22} aria-hidden="true" /><h2 id="library-help-heading">사이트 사용법</h2><p>출결 입력, 담당 조, 접속·권한 문제를 업무별로 찾아봅니다.</p></div>
      <Link href="/library/help">사용법 찾기 <ArrowRight size={16} aria-hidden="true" /></Link>
    </section>

    <section className={styles.guide} aria-labelledby="library-guide-heading">
      <div><Books size={22} aria-hidden="true" /><h2 id="library-guide-heading">사역 가이드</h2><p>연간 흐름과 운영 기준을 확인합니다.</p></div>
      <Link href="/library/guide">가이드 열기 <ArrowRight size={16} aria-hidden="true" /></Link>
    </section>

    <section className={styles.archive} aria-labelledby="library-archive-heading">
      <div className={styles.heading}><div><h2 id="library-archive-heading">학기 자료</h2><p>현재 접근할 수 있는 학기별 문서·시트·파일입니다.</p></div><span>{error ? "일부 확인 실패" : finished ? `${records.length}건` : "불러오는 중"}</span></div>
      <div className={styles.filters}>
        <label><span>자료 검색</span><div className={styles.search}><MagnifyingGlass size={18} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 학기 검색" /></div></label>
        <label><span>자료 종류</span><select value={kind} onChange={(event) => setKind(event.target.value as ArchiveLink["kind"] | "all")}><option value="all">전체 종류</option>{Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {error && <LoadFailureNotice title="일부 자료를 불러오지 못했습니다." onRetry={onRetry} />}
      {!finished && !error && <p className={styles.state} role="status">학기 자료를 확인하는 중입니다…</p>}
      {finished && !error && records.length === 0 && <p className={styles.state}>{query || kind !== "all" ? "검색 조건에 맞는 자료가 없습니다." : "아직 접근 가능한 학기 자료가 없습니다."}</p>}
      {records.length > 0 && <ul className={styles.list}>{records.map(({ link, semester, href }) => {
        const safeUrl = /^https?:\/\//i.test(link.url ?? "") ? link.url : href;
        return <li key={`${semester.id}:${link.id}`}><div><span className={styles.kind}>{KIND_LABEL[link.kind] ?? "기타"}</span><a href={safeUrl} target={safeUrl === href ? undefined : "_blank"} rel={safeUrl === href ? undefined : "noreferrer"}>{link.title || "제목 없는 자료"}</a><small>{semester.meta.title}</small></div><Link href={href}>학기 기록 <ArrowRight size={15} aria-hidden="true" /></Link></li>;
      })}</ul>}
    </section>

    <section className={styles.events} aria-labelledby="library-events-heading"><CalendarBlank size={21} aria-hidden="true" /><div><h2 id="library-events-heading">수련회 자료</h2><p>행사를 선택하면 해당 수련회의 준비·프로그램·현장 기록을 볼 수 있습니다.</p></div><Link href="/events">행사 선택 <ArrowRight size={16} aria-hidden="true" /></Link></section>
  </main>;
}
