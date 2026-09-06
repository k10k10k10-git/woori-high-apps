"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea, canAccessSundayTeam, canEditSundayTeam, canWriteStudentRoster, ownSundayTeam } from "@/features/portal/accessPolicy";
import {
  MINISTRY_AREA_LABELS,
  SUNDAY_MINISTRY_DEFAULT_TEAM,
  SUNDAY_MINISTRY_TEAMS,
  SUNDAY_MINISTRY_TABS,
  sundayTeamHref,
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
import NewFriendsTab from "../semester/[id]/NewFriendsTab";

const PraiseWorkspace = dynamic(() => import("@/features/praise/PraiseWorkspace"), { loading: () => <p role="status" className="p-8">찬양팀 화면을 불러오고 있습니다…</p> });

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
  const href = sundayTeamHref(team);
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

const TAB_INTRO: Partial<Record<SundayTab, { title: string; description: string }>> = {
  "새친구": { title: "새친구 정착 관리", description: "학기 구분 없이 접수와 2주 과정, 등록 결정, 반배정과 학생 출석부 반영을 관리합니다." },
  "등록 현황": { title: "등록 현황", description: "새친구 등록으로 학생 출석부 원장에 반영된 학생을 확인합니다." },
  "처리 대기": { title: "처리 대기", description: "2주 과정부터 등록 결정·반배정·출석부 반영까지 남은 일을 모아봅니다." },
  "출석부": { title: "출석부", description: "연도·학기·부·반을 선택해 학생 명단과 주차별 출석 기록을 실시간으로 확인합니다." },
  "행정 변동 사항": { title: "행정 변동 사항", description: "학생 출석부 관리자 화면에서 수정된 등록·이동·삭제 내역을 최신순으로 확인합니다." },
  "자리 배치": { title: "주일 자리 배치", description: "분단과 줄을 정하고 반을 앉힌 뒤 PDF로 인쇄합니다. 위에서 두 줄이 앞자리입니다." },
  "예배 담당표": { title: "예배 담당표", description: "헌금위원·안내처럼 주차마다 정하는 담당을 적고 PDF로 인쇄합니다." },
  "예배 자료": { title: "예배 자료", description: "헌금 기도문 양식처럼 자주 바뀌지 않는 문서를 글로 두고 복사·인쇄합니다." },
};

export default function SundayMinistryClient({ team, initialTab, workspaceId }: { team?: SundayTeamKey; initialTab?: string; workspaceId?: string }) {
  const router = useRouter();
  const { user, loading: authLoading, roles, signIn } = useAuth();
  // 팀 단위로 판정한다. 사역팀은 자기 팀 하나만 열리고 옆 팀은 주소를 직접 쳐도 막힌다.
  // 팀이 배정되지 않은 사람은 들어갈 팀이 없으므로 진입 자체가 막힌다.
  const accessibleTeams = SUNDAY_MINISTRY_TEAMS.filter((item) => canAccessSundayTeam(item.key, roles));
  const matchingTeams = accessibleTeams.filter((item) => teamHasTab(item.key, initialTab));
  const tabTeam = matchingTeams.length === 1 ? matchingTeams[0] : undefined;
  const landingTeam = ownSundayTeam(roles) ?? SUNDAY_MINISTRY_DEFAULT_TEAM;
  const teamMeta = sundayTeamOf(team) ?? tabTeam ?? sundayTeamOf(landingTeam)!;
  const teamChooser = team === undefined && !tabTeam && ownSundayTeam(roles) === null && accessibleTeams.length > 1;
  const allowed = canAccessArea("sunday", roles) && canAccessSundayTeam(teamMeta.key, roles);
  const canEdit = canEditSundayTeam(teamMeta.key, roles);
  const tabs = teamMeta.tabs as readonly SundayTab[];
  // 팀 라우트를 오갈 때 컴포넌트가 재사용될 수 있으므로, 선택 탭은 렌더 중 파생으로 보정한다
  // (effect에서 setState하면 실수 13 — 사용자의 선택이 덮인다).
  const [pickedTab, setPickedTab] = useState<string | undefined>(initialTab);
  const [tabSource, setTabSource] = useState(initialTab);
  if (tabSource !== initialTab) { setTabSource(initialTab); setPickedTab(initialTab); }
  const tab: SundayTab | undefined = tabs.find((name) => name === pickedTab) ?? tabs[0];
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
  const needsAdminChanges = tabs.includes("행정 변동 사항");
  const [friends, setFriends] = useState<SundayNewFriend[]>([]);
  const [privateMap, setPrivateMap] = useState<Record<string, NewFriendPrivate>>({});
  const [adminChanges, setAdminChanges] = useState<SundayAdminChange[]>([]);
  const { fail, ok, message: loadError } = useLoadErrors(`sunday|${teamMeta.key}|${user?.uid ?? ""}`);
  const storageSid = sundayWorkspaceId(new Date().getFullYear());

  useEffect(() => {
    if (!user || !allowed || teamChooser) return;
    const unsubs: Array<() => void> = [];
    if (needsFriends) {
      unsubs.push(subscribeSundayNewFriends((values) => { setFriends(values); ok("새친구"); }, fail("새친구")));
      if (canEdit) {
        unsubs.push(subscribeSundayNewFriendsPrivate(
          (values) => { setPrivateMap(values); ok("새친구 비공개 정보"); },
          fail("새친구 비공개 정보"),
        ));
      }
    }
    if (needsAdminChanges) {
      unsubs.push(subscribeSundayAdminChanges((values) => { setAdminChanges(values); ok("행정 변동 사항"); }, fail("행정 변동 사항")));
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [allowed, canEdit, fail, needsAdminChanges, needsFriends, ok, teamChooser, user]);

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

  if (authLoading) return <main className="min-h-screen flex items-center justify-center text-slate-500">불러오는 중…</main>;
  if (!user) {
    return <main className="min-h-screen flex flex-col items-center justify-center gap-4"><p className="text-sm text-slate-500">로그인이 필요합니다</p><LoginButton signIn={signIn} /></main>;
  }
  if (!allowed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-bold text-slate-800">팀·주일 운영 접근 권한이 없습니다</h1>
        <p className="text-sm text-slate-500">통합관리자에게 역할 배정을 요청해주세요.</p>
        <button onClick={() => router.push("/")} className="btn-secondary">통합 홈으로</button>
      </main>
    );
  }

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
            {accessibleTeams.map((item) => (
              <button key={item.key} type="button" onClick={() => router.push(teamHrefWithTab(item.key, initialTab))} disabled={item.status === "planned" && ownSundayTeam(roles) !== item.key}>
                <span><strong>{item.label}</strong><small>{item.hint}</small></span>
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
        <button onClick={() => router.push("/")} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white" aria-label="통합 홈으로 돌아가기"><ArrowLeft aria-hidden="true" className="inline align-[-2px]" size={13} /> 홈</button>
        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 sm:text-xs">{MINISTRY_AREA_LABELS.sunday}</span>
        <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-white sm:text-base">{teamMeta.label}</h1>
        <label className="flex min-w-0 items-center gap-2 text-xs text-slate-300"><span className="shrink-0">팀 변경</span><select aria-label="현재 팀·팀 변경" className="max-w-36 rounded-lg border border-white/20 bg-slate-800 px-2 py-1.5 text-xs text-white" value={teamMeta.key} onChange={(event) => router.push(teamHrefWithTab(event.target.value as SundayTeamKey, initialTab))}>
          {accessibleTeams.map((item) => <option key={item.key} value={item.key} disabled={item.status === "planned" && ownSundayTeam(roles) !== item.key}>{item.label}{item.status === "planned" ? " · 기획 중" : ""}</option>)}
        </select></label>
        {teamMeta.key !== "praise" && !canEdit && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300 sm:text-xs">조회 전용</span>}
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
                {tabs.map((name) => <button key={name} role="tab" aria-selected={tab === name} aria-controls="sunday-tab-panel" onClick={() => selectTab(name)} className="workspace-tab">{name}</button>)}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {loadError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 로드 오류: {loadError}</div>}
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
            <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="section-kicker">{tab}</p><h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{TAB_INTRO[tab]?.title ?? tab}</h2><p className="mt-1 text-sm text-slate-500">{TAB_INTRO[tab]?.description}</p></div>
              {needsFriends && <p className="mt-2 text-xs text-slate-400 sm:mt-0">새친구 {friends.length}명 · 처리 대기 {pendingCount}명</p>}
            </div>
            <div role="tabpanel" id="sunday-tab-panel" className="min-h-[360px]">
              <SemesterEditProvider canEdit={canEdit}>
                {tab === "새친구" && <NewFriendsTab sid={storageSid} friends={friends} privateMap={{}} canSyncRoster={canWriteStudentRoster(roles)} getStorageSid={storageSidFor} getPrivateValue={privateValueFor} getRecordKey={recordKeyFor} />}
                {tab === "등록 현황" && <RegistrationStatusTab friends={friends} />}
                {tab === "처리 대기" && <PendingTab friends={friends} privateValueFor={scopedPrivateValueFor} showPrivate={canEdit} onOpenNewFriends={() => selectTab("새친구")} />}
                {tab === "출석부" && <AttendanceBookTab />}
                {tab === "행정 변동 사항" && <AdminChangesTab changes={adminChanges} />}
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
