"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import WorkspaceAccessGate from "@/components/WorkspaceAccessGate";
import LoadFailureNotice from "@/components/LoadFailureNotice";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea, canAccessSundayTeam, canManageAnnualFinance, canSubmitNewFriendToRegistry, canWriteStudentRoster, ownSundayTeam } from "@/features/portal/accessPolicy";
import {
  MINISTRY_AREA_LABELS,
  SUNDAY_MINISTRY_DEFAULT_TEAM,
  SUNDAY_MINISTRY_TEAMS,
  SUNDAY_MINISTRY_TABS,
  sundayTeamOf,
  type SundayTeamKey,
} from "@/features/portal/featureCatalog";
import { SemesterEditProvider } from "@/features/semester/EditContext";
import type { NewFriend, NewFriendPrivate } from "@/features/semester/types";
import { deriveNewFriendStage } from "@/features/semester/newFriend";
import { subscribeSundayAdminChanges, subscribeSundayNewFriends, subscribeSundayNewFriendsPrivate } from "@/features/sundayMinistry/db";
import {
  privateValueForSundayFriend,
  sundayFriendKey,
  sundayWorkspaceId,
  type SundayNewFriend,
  type SundayAdminChange,
} from "@/features/sundayMinistry/model";
import {
  AdminChangesTab,
  PendingTab,
  RegistrationStatusTab,
} from "@/features/sundayMinistry/SundayMinistryTabs";
import AttendanceBookTab from "@/features/sundayMinistry/AttendanceBookTab";
import WorshipDocsTab from "@/features/sundayWorship/WorshipDocsTab";
import WorshipDutyTab from "@/features/sundayWorship/WorshipDutyTab";
import WorshipSeatingTab from "@/features/sundayWorship/WorshipSeatingTab";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { activeTeamKeys, canEditTeam } from "@/features/teams/teamModel";
import NewFriendsTab from "../semester/[id]/NewFriendsTab";

const PraiseWorkspace = dynamic(() => import("@/features/praise/PraiseWorkspace"), { loading: () => <p role="status" className="p-8">찬양팀 화면을 불러오고 있습니다…</p> });
const AnnualFinanceTab = dynamic(() => import("@/features/finance/AnnualFinanceTab"), { loading: () => <p role="status" className="p-8">연간 회계를 불러오는 중입니다…</p> });

type SundayTab = (typeof SUNDAY_MINISTRY_TABS)[number];

function teamHasTab(team: SundayTeamKey, tab?: string) {
  if (!tab) return false;
  // 찬양 화면이 주소에 기록하는 기존 영문·레거시 별칭도 새로고침 시 같은 팀을 가리킨다.
  const praiseAliases: Record<string, SundayTab> = {
    week: "이번 주", attendance: "출결", praiseAttendance: "출결",
    stage: "등단", praiseStage: "등단", people: "팀원·조", praiseRoster: "팀원·조",
    settings: "운영 설정", praiseSettings: "운영 설정",
  };
  const name = team === "praise" && Object.hasOwn(praiseAliases, tab) ? praiseAliases[tab] : tab;
  return sundayTeamOf(team)?.tabs.some((value) => value === name) ?? false;
}

/** 기존 북마크의 탭은 그 탭을 실제로 제공하는 팀으로 이동할 때만 전달한다. */
function teamHrefWithTab(team: SundayTeamKey, tab?: string) {
  const href = `/teams/${team}/ongoing`;
  return tab && teamHasTab(team, tab)
    ? `${href}?tab=${encodeURIComponent(tab)}`
    : href;
}

/** 팀 내부 탭 선택을 새로고침·뒤로가기 가능한 주소로 기록한다. */
export function sundayTabHref(tab: SundayTab, currentHref: string): string {
  const url = new URL(currentHref, "https://example.invalid");
  url.searchParams.set("tab", tab);
  return `${url.pathname}${url.search}${url.hash}`;
}

function sundayTabFromHref(team: SundayTeamKey, currentHref: string): SundayTab | undefined {
  const value = new URL(currentHref, "https://example.invalid").searchParams.get("tab") ?? undefined;
  return value && teamHasTab(team, value) ? value as SundayTab : undefined;
}

const TAB_TITLES: Partial<Record<SundayTab, string>> = {
  "새친구": "새친구 정착 관리",
  "자리 배치": "주일 자리 배치",
};

export default function SundayMinistryClient(props: { team?: SundayTeamKey; initialTab?: string; workspaceId?: string }) {
  const { user, loading, roleError, roles, teamMemberships } = useAuth();
  return <SundayMinistryClientContent key={`${user?.uid ?? "guest"}:${loading}:${!!roleError}:${roles.semester}:${roles.retreat}:${JSON.stringify(teamMemberships)}`} {...props} />;
}

function SundayMinistryClientContent({ team, initialTab, workspaceId }: { team?: SundayTeamKey; initialTab?: string; workspaceId?: string }) {
  const router = useRouter();
  const { user, loading: authLoading, roleError, roles, teamMemberships, canSearchOfficialRoster } = useAuth();
  const assignedTeamKeys = teamMemberships ? activeTeamKeys(teamMemberships) : undefined;
  const hasCentralAdminAccess = canManageAnnualFinance(roles);
  // 팀 단위로 판정한다. 사역팀은 자기 팀 하나만 열리고 옆 팀은 주소를 직접 쳐도 막힌다.
  // 팀이 배정되지 않은 사람은 들어갈 팀이 없으므로 진입 자체가 막힌다.
  const accessibleTeams = SUNDAY_MINISTRY_TEAMS.filter((item) =>
    (canAccessSundayTeam(item.key, roles, assignedTeamKeys) || (item.key === "admin" && hasCentralAdminAccess))
    && (item.key !== "admin" || canSearchOfficialRoster));
  const matchingTeams = accessibleTeams.filter((item) => teamHasTab(item.key, initialTab));
  const tabTeam = matchingTeams.length === 1 ? matchingTeams[0] : undefined;
  const landingTeam = ownSundayTeam(roles, assignedTeamKeys) ?? (accessibleTeams.length === 1 ? accessibleTeams[0].key : SUNDAY_MINISTRY_DEFAULT_TEAM);
  const teamMeta = sundayTeamOf(team) ?? tabTeam ?? sundayTeamOf(landingTeam)!;
  const teamChooser = team === undefined && !tabTeam && ownSundayTeam(roles, assignedTeamKeys) === null && accessibleTeams.length > 1;
  // 행정팀 주일 화면은 연간 학생·출석 원장과 새친구 비공개 원장을 읽는다.
  // 팀 배정만으로 진입시키면 Rules가 막는 구독을 화면에서 열게 된다.
  const allowed = canAccessArea("sunday", roles)
    && (canAccessSundayTeam(teamMeta.key, roles, assignedTeamKeys) || (teamMeta.key === "admin" && hasCentralAdminAccess))
    && (teamMeta.key !== "admin" || canSearchOfficialRoster);
  const canEdit = canEditTeam(teamMeta.key, roles, teamMemberships);
  const tabs = teamMeta.tabs as readonly SundayTab[];
  // 팀 라우트를 오갈 때 컴포넌트가 재사용될 수 있으므로, 선택 탭은 렌더 중 파생으로 보정한다
  // (effect에서 setState하면 실수 13 — 사용자의 선택이 덮인다).
  const [pickedTab, setPickedTab] = useState<string | undefined>(initialTab);
  const [tabSource, setTabSource] = useState(initialTab);
  if (tabSource !== initialTab) { setTabSource(initialTab); setPickedTab(initialTab); }
  const tab: SundayTab | undefined = tabs.find((name) => name === pickedTab) ?? tabs[0];
  const currentYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" }).format(new Date()));
  const [adminYear, setAdminYear] = useState(currentYear);
  const [financeSaving, setFinanceSaving] = useState(false);
  const selectTab = (nextTab: SundayTab) => {
    setPickedTab(nextTab);
    if (teamMeta.key === "praise" || typeof window === "undefined") return;
    const href = sundayTabHref(nextTab, window.location.href);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (href !== current) window.history.pushState(null, "", href);
  };

  useEffect(() => {
    if (teamMeta.key === "praise") return;
    const restoreTab = () => setPickedTab(sundayTabFromHref(teamMeta.key, window.location.href));
    window.addEventListener("popstate", restoreTab);
    return () => window.removeEventListener("popstate", restoreTab);
  }, [teamMeta.key]);
  // 팀마다 필요한 구독만 연다 — 예배팀 화면에서 새친구 명단과 연락처를 읽을 이유가 없다.
  const needsFriends = tabs.some((name) => name === "새친구" || name === "등록 현황" || name === "처리 대기");
  const needsAdminChanges = tab === "행정 변동 사항" && tabs.includes("행정 변동 사항");
  const [friends, setFriends] = useState<SundayNewFriend[]>([]);
  const [privateMap, setPrivateMap] = useState<Record<string, NewFriendPrivate>>({});
  const [adminChanges, setAdminChanges] = useState<SundayAdminChange[]>([]);
  const [adminChangesScope, setAdminChangesScope] = useState("");
  const [attempt, setAttempt] = useState(0);
  const adminScope = teamMeta.key === "admin" ? `${tab}|${adminYear}` : "";
  const { fail, ok, errors, message: loadError } = useLoadErrors(`sunday|${teamMeta.key}|${user?.uid ?? ""}|${adminScope}|${attempt}`);
  const storageSid = sundayWorkspaceId(new Date().getFullYear());

  useEffect(() => {
    if (!user || authLoading || roleError || !allowed || teamChooser) return;
    let active = true;
    const failure = (key: string) => (error: Error) => { if (active) fail(key)(error); };
    const unsubs: Array<() => void> = [];
    if (needsFriends) {
      unsubs.push(subscribeSundayNewFriends((values) => { if (!active) return; setFriends(values); ok("새친구"); }, failure("새친구")));
      if (canEdit) {
        unsubs.push(subscribeSundayNewFriendsPrivate(
          (values) => { if (!active) return; setPrivateMap(values); ok("새친구 비공개 정보"); },
          failure("새친구 비공개 정보"),
        ));
      }
    }
    if (needsAdminChanges) {
      unsubs.push(subscribeSundayAdminChanges((values) => { if (!active) return; setAdminChanges(values); setAdminChangesScope(`${adminYear}:${attempt}`); ok("행정 변동 사항"); }, failure("행정 변동 사항"), adminYear));
    }
    return () => { active = false; unsubs.forEach((unsubscribe) => unsubscribe()); };
  }, [adminYear, attempt, authLoading, roleError, allowed, canEdit, fail, needsAdminChanges, needsFriends, ok, teamChooser, user]);

  const pendingCount = useMemo(() => friends.filter((friend) =>
    !["완료", "종료", "보류"].includes(deriveNewFriendStage(friend)),
  ).length, [friends]);
  const storageSidFor = useCallback((friend: NewFriend) => (friend as SundayNewFriend).storageSid, []);
  const recordKeyFor = useCallback((friend: NewFriend) => {
    const scoped = friend as SundayNewFriend;
    return sundayFriendKey(scoped.storageSid, scoped.id);
  }, []);
  const privateValueFor = useCallback((friend: NewFriend) =>
    privateValueForSundayFriend(privateMap, friend as SundayNewFriend), [privateMap]);
  const scopedPrivateValueFor = useCallback((friend: SundayNewFriend) =>
    privateValueForSundayFriend(privateMap, friend), [privateMap]);

  if (authLoading || !user || roleError || !allowed) return <WorkspaceAccessGate allowed={allowed} area={`${teamMeta.label} 주간·주일 업무`} backHref="/teams" backLabel="팀 목록으로">{null}</WorkspaceAccessGate>;

  if (teamChooser) {
    return (
      <div className="semester-scope">
        <header className="workspace-sticky-header workspace-header">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex min-w-0 items-center gap-2 py-3">
              <button onClick={() => router.push("/")} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white" aria-label="통합 홈으로 돌아가기"><ArrowLeft aria-hidden="true" className="inline align-[-2px]" size={13} /> 홈</button>
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">{MINISTRY_AREA_LABELS.sunday}</span>
              <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-white">팀 선택</h1>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-xl px-4 py-5">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-900">어느 팀의 업무를 볼까요?</h2>
            <p className="mt-1 text-sm text-slate-500">팀을 선택하면 해당 주일 업무만 보여줍니다.</p>
          </div>
          <div className="sunday-team-picker">
            {SUNDAY_MINISTRY_TEAMS.map((item) => (
              <button key={item.key} type="button" onClick={() => router.push(teamHrefWithTab(item.key, initialTab))}>
                <span><strong>{item.label}</strong><small>{item.hint}{!accessibleTeams.includes(item) ? " · 권한 필요" : ""}</small></span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  const teamHeader = <div className="workspace-header">
    <div className="mx-auto max-w-6xl px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2 py-3 sm:gap-3">
        <button disabled={financeSaving} onClick={() => router.push(`/teams/${teamMeta.key}`)} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50" aria-label="팀 공간으로 돌아가기"><ArrowLeft aria-hidden="true" className="inline align-[-2px]" size={13} /> 팀</button>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-xs" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)", border: "1px solid var(--color-badge-border)" }}>{teamMeta.key === "admin" ? "행정 업무" : "주간·주일 업무"}</span>
        <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-white sm:text-base">{teamMeta.label}</h1>
        <label className="flex min-w-0 items-center gap-2 text-xs text-slate-300"><span className="shrink-0">팀 변경</span><select disabled={financeSaving} aria-label="현재 팀·팀 변경" className="max-w-36 rounded-lg border border-white/20 bg-slate-800 px-2 py-1.5 text-xs text-white" value={teamMeta.key} onChange={(event) => router.push(teamHrefWithTab(event.target.value as SundayTeamKey, initialTab))}>
          {SUNDAY_MINISTRY_TEAMS.map((item) => <option key={item.key} value={item.key}>{item.label}{item.status === "planned" ? " · 기획 중" : ""}{!accessibleTeams.includes(item) ? " · 권한 필요" : ""}</option>)}
        </select></label>
        {teamMeta.key !== "praise" && !(teamMeta.key === "admin" && tab === "연간 회계" && hasCentralAdminAccess) && !canEdit && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300 sm:text-xs">조회 전용</span>}
      </div>
    </div>
  </div>;

  if (teamMeta.key === "praise") return <div className="semester-scope"><header className="workspace-sticky-header">{teamHeader}</header><Suspense fallback={<p role="status" className="p-8">찬양팀 화면을 불러오고 있습니다…</p>}><PraiseWorkspace key={`${user.uid}:${roles.semester}:${roles.retreat}`} workspaceId={workspaceId} initialTab={initialTab} embedded /></Suspense></div>;

  return (
    <div className="semester-scope">
      <header className="workspace-sticky-header">
        {teamHeader}
        {tabs.length > 0 && (
          <div className="workspace-tabs">
            <div className="mx-auto max-w-6xl px-0 sm:px-4">
              <div className="tab-scroll-container flex gap-0 overflow-x-auto scrollbar-hide" role="tablist" aria-label={`팀·주일 운영 ${teamMeta.label} 탭`}>
                {tabs.map((name) => <button key={name} role="tab" disabled={financeSaving} aria-selected={tab === name} aria-controls="sunday-tab-panel" onClick={() => selectTab(name)} className="workspace-tab">{name}</button>)}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {teamMeta.key === "admin" && <div className="mb-5 flex items-center justify-between gap-3"><label className="flex items-center gap-3 font-semibold"><span>업무 연도</span><select aria-label="행정 업무 연도" className="form-control w-auto" disabled={financeSaving} value={adminYear} onChange={event => setAdminYear(Number(event.target.value))}>{Array.from({ length: 11 }, (_, i) => currentYear - 5 + i).map(year => <option key={year} value={year}>{year}년</option>)}</select></label>{financeSaving && <span role="status" className="text-sm text-emerald-700">회계 처리 중…</span>}</div>}
        {loadError && <LoadFailureNotice title="팀 운영 정보를 불러오지 못했습니다." sources={Object.keys(errors)} onRetry={() => setAttempt(value => value + 1)} />}
        {!tab ? (
          <section className="card card-body">
            <div className="rounded-xl border border-dashed border-slate-200 px-5 py-14 text-center">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700">기능 기획 중</span>
              <p className="mt-4 text-base font-semibold text-slate-700">{teamMeta.label}의 실제 운영 흐름을 먼저 정리하고 있습니다.</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">필요한 명단, 주간 업무, 자료 관리 방식을 사이트 건의사항으로 알려주시면 팀 화면 기획에 반영합니다.</p>
              <button type="button" onClick={() => router.push("/suggestions")} className="btn-secondary mt-5">필요 기능 제안하기</button>
            </div>
          </section>
        ) : (
          <>
            {(tab !== "연간 회계" || !hasCentralAdminAccess) && <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div><h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{TAB_TITLES[tab] ?? tab}</h2></div>
              {needsFriends && <p className="mt-2 text-xs text-slate-400 sm:mt-0">새친구 {friends.length}명 · 처리 대기 {pendingCount}명</p>}
            </div>}
            <div role="tabpanel" id="sunday-tab-panel" className="min-h-[360px]">
              <SemesterEditProvider canEdit={canEdit}>
                {tab === "새친구" && <NewFriendsTab sid={storageSid} friends={friends} privateMap={{}} canSyncRoster={canWriteStudentRoster(roles)} canSubmitRegistry={canSubmitNewFriendToRegistry(roles)} getStorageSid={storageSidFor} getPrivateValue={privateValueFor} getRecordKey={recordKeyFor} />}
                {tab === "등록 현황" && <RegistrationStatusTab friends={friends} />}
                {tab === "처리 대기" && <PendingTab friends={friends} privateValueFor={scopedPrivateValueFor} showPrivate={canEdit} onOpenNewFriends={() => selectTab("새친구")} />}
                {tab === "출석부" && <AttendanceBookTab key={`attendance:${adminYear}`} year={adminYear} />}
                {tab === "행정 변동 사항" && (adminChangesScope === `${adminYear}:${attempt}` ? <AdminChangesTab key={`changes:${adminYear}`} year={adminYear} changes={adminChanges} /> : !loadError && <p role="status" className="p-6">{adminYear}년 행정 변동 사항을 불러오는 중입니다…</p>)}
                {tab === "연간 회계" && (canManageAnnualFinance(roles) ? <AnnualFinanceTab key={`finance:${user.uid}:${adminYear}`} year={adminYear} canEdit onBusyChange={setFinanceSaving} /> : <section className="surface-panel p-6"><p className="font-semibold">연간 회계 접근 권한이 필요합니다.</p><p className="mt-2 text-sm">회계 내역과 증빙은 행정팀·교역자·통합관리자가 확인할 수 있습니다.</p></section>)}
                {tab === "자리 배치" && <WorshipSeatingTab canEdit={canEdit} />}
                {tab === "예배 담당표" && <WorshipDutyTab canEdit={canEdit} />}
                {tab === "예배 자료" && <WorshipDocsTab canEdit={canEdit} />}
              </SemesterEditProvider>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
