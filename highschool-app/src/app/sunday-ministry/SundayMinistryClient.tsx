"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea, canEditArea, canWriteStudentRoster } from "@/features/portal/accessPolicy";
import { SUNDAY_MINISTRY_TABS } from "@/features/portal/featureCatalog";
import { SemesterEditProvider } from "@/features/semester/EditContext";
import type { NewFriend, NewFriendPrivate } from "@/features/semester/types";
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
import { useLoadErrors } from "@/lib/useLoadErrors";
import NewFriendsTab from "../semester/[id]/NewFriendsTab";

type SundayTab = (typeof SUNDAY_MINISTRY_TABS)[number];

const TAB_INTRO: Record<SundayTab, { title: string; description: string }> = {
  "새친구": { title: "새친구 정착 관리", description: "학기 구분 없이 접수와 2주 과정, 등록 결정, 반배정과 학생 출석부 반영을 관리합니다." },
  "등록 현황": { title: "등록 현황", description: "새친구 등록으로 학생 출석부 원장에 반영된 학생을 확인합니다." },
  "처리 대기": { title: "처리 대기", description: "2주 과정부터 등록 결정·반배정·출석부 반영까지 남은 일을 모아봅니다." },
  "행정 변동 사항": { title: "행정 변동 사항", description: "학생 출석부 관리자 화면에서 수정된 등록·이동·삭제 내역을 최신순으로 확인합니다." },
};

function validInitialTab(value?: string): SundayTab {
  return value && (SUNDAY_MINISTRY_TABS as readonly string[]).includes(value)
    ? value as SundayTab
    : SUNDAY_MINISTRY_TABS[0];
}

export default function SundayMinistryClient({ initialTab }: { initialTab?: string }) {
  const router = useRouter();
  const { user, loading: authLoading, roles, signIn } = useAuth();
  const allowed = canAccessArea("sunday", roles);
  const canEdit = canEditArea("sunday", roles);
  const [tab, setTab] = useState<SundayTab>(() => validInitialTab(initialTab));
  const [friends, setFriends] = useState<SundayNewFriend[]>([]);
  const [privateMap, setPrivateMap] = useState<Record<string, NewFriendPrivate>>({});
  const [adminChanges, setAdminChanges] = useState<SundayAdminChange[]>([]);
  const { fail, ok, message: loadError } = useLoadErrors(`sunday|${user?.uid ?? ""}`);
  const storageSid = sundayWorkspaceId(new Date().getFullYear());

  useEffect(() => {
    if (!user || !allowed) return;
    const unsubs = [
      subscribeSundayNewFriends((values) => { setFriends(values); ok("새친구"); }, fail("새친구")),
      subscribeSundayAdminChanges((values) => { setAdminChanges(values); ok("행정 변동 사항"); }, fail("행정 변동 사항")),
    ];
    if (canEdit) {
      unsubs.push(subscribeSundayNewFriendsPrivate(
        (values) => { setPrivateMap(values); ok("새친구 비공개 정보"); },
        fail("새친구 비공개 정보"),
      ));
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [allowed, canEdit, fail, ok, user]);

  const pendingCount = useMemo(() => friends.filter((friend) =>
    !friend.giftDate && friend.decision !== "미등록" && friend.decision !== "보류",
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
        <h1 className="text-xl font-bold text-slate-800">주일 사역 접근 권한이 없습니다</h1>
        <p className="text-sm text-slate-500">통합관리자에게 역할 배정을 요청해주세요.</p>
        <button onClick={() => router.push("/")} className="btn-secondary">통합 홈으로</button>
      </main>
    );
  }

  return (
    <div className="semester-scope">
      <header className="workspace-sticky-header">
        <div className="workspace-header">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex min-w-0 items-center gap-2 py-3 sm:gap-3">
              <button onClick={() => router.push("/")} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 transition-colors hover:bg-white/10 hover:text-white sm:text-xs" aria-label="통합 홈으로 돌아가기">← 홈</button>
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 sm:text-xs">주일 사역</span>
              <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-white sm:text-base">행정·바나바</h1>
              {!canEdit && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300 sm:text-xs">조회 전용</span>}
            </div>
          </div>
        </div>
        <div className="workspace-tabs">
          <div className="mx-auto max-w-6xl px-0 sm:px-4">
            <div className="tab-scroll-container flex gap-0 overflow-x-auto scrollbar-hide" role="tablist" aria-label="주일 사역 탭">
              {SUNDAY_MINISTRY_TABS.map((name) => <button key={name} role="tab" aria-selected={tab === name} aria-controls="sunday-tab-panel" onClick={() => setTab(name)} className="workspace-tab">{name}</button>)}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {loadError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 로드 오류: {loadError}</div>}
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="section-kicker">{tab}</p><h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{TAB_INTRO[tab].title}</h2><p className="mt-1 text-sm text-slate-500">{TAB_INTRO[tab].description}</p></div>
          <p className="mt-2 text-xs text-slate-400 sm:mt-0">새친구 {friends.length}명 · 처리 대기 {pendingCount}명</p>
        </div>
        <div role="tabpanel" id="sunday-tab-panel" className="min-h-[360px]">
          <SemesterEditProvider canEdit={canEdit}>
            {tab === "새친구" && <NewFriendsTab sid={storageSid} friends={friends} privateMap={{}} canSyncRoster={canWriteStudentRoster(roles)} getStorageSid={storageSidFor} getPrivateValue={privateValueFor} getRecordKey={recordKeyFor} />}
            {tab === "등록 현황" && <RegistrationStatusTab friends={friends} />}
            {tab === "처리 대기" && <PendingTab friends={friends} privateValueFor={scopedPrivateValueFor} showPrivate={canEdit} onOpenNewFriends={() => setTab("새친구")} />}
            {tab === "행정 변동 사항" && <AdminChangesTab changes={adminChanges} />}
          </SemesterEditProvider>
        </div>
      </main>
    </div>
  );
}
