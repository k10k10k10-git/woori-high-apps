"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/iguard/context/AuthContext";
import { canAccessArea, canManageRetreatPin } from "@/features/portal/accessPolicy";
import VacationHome from "@/features/portal/VacationHome";
import type { Retreat as PortalRetreat } from "@/lib/types";
import { subscribeToRetreats, requestIguardAccess, getMyIguardPending, subscribeToIguardAccessLocks } from "@/features/iguard/lib/db";
import { subscribeToAllRetreatPeriods } from "@/lib/db";
import { Retreat, type IguardAccessLock } from "@/features/iguard/lib/types";
import { useUI } from "@/context/UIContext";
import AdminModal from "./AdminModal";
import CenterSpinner from "@/components/CenterSpinner";
// 인앱 감지·탈출·배너는 전부 공용 컴포넌트가 담당한다(로그인 화면들과 같은 것).
import InAppBrowserNotice from "@/components/InAppBrowserNotice";


export default function FieldHomeClient() {
  const { user, loading: authLoading, roles, signIn, signOut } = useAuth();
  const fieldAllowed = canAccessArea("retreat-field", roles);
  const { toast } = useUI();

  const [retreatRecords, setRetreatRecords] = useState<Retreat[]>([]);
  const [periods, setPeriods] = useState<Array<{ retreatId: string; startDate: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [accessLocks, setAccessLocks] = useState<Record<string, IguardAccessLock>>({});
  const [requested, setRequested] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const earliestByRetreat = useMemo(() => {
    const result: Record<string, string> = {};
    periods.forEach((period) => {
      if (!result[period.retreatId] || period.startDate < result[period.retreatId]) result[period.retreatId] = period.startDate;
    });
    return result;
  }, [periods]);
  const retreats = useMemo(() => [...retreatRecords].sort((a, b) => {
    const da = earliestByRetreat[a.id];
    const db = earliestByRetreat[b.id];
    if (da && db) return db.localeCompare(da);
    if (da) return -1;
    if (db) return 1;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  }), [earliestByRetreat, retreatRecords]);

  useEffect(() => {
    if (!user || !fieldAllowed) return;
    setLoading(true);
    setLoadError(null);
    return subscribeToRetreats((list) => {
      setRetreatRecords(list);
      setSelectedId((previous) => previous && list.some((item) => item.id === previous) ? previous : list[0]?.id ?? null);
      setLoading(false);
    }, (error) => { setLoadError(error.message); setLoading(false); });
  }, [user, fieldAllowed]);

  const retreatIdsKey = retreatRecords.map((retreat) => retreat.id).join(",");
  useEffect(() => {
    if (!user || !fieldAllowed) return;
    const ids = retreatIdsKey ? retreatIdsKey.split(",") : [];
    return subscribeToAllRetreatPeriods(ids, setPeriods,
      (error) => setLoadError((previous) => previous ?? `수련회 기간 구독 실패 - ${error.message}`));
  }, [user, fieldAllowed, retreatIdsKey]);

  // 승인 사용자에게 수련회별 PIN 잠금 상태를 표시한다. 실제 PIN 검증은 내부 화면 진입 전에 다시 수행한다.
  useEffect(() => {
    if (!user || !fieldAllowed) { setAccessLocks({}); return; }
    const ids = retreats.map(r => r.id);
    return subscribeToIguardAccessLocks(ids, setAccessLocks,
      e => setLoadError(prev => prev ?? `PIN 잠금 상태 구독 실패 - ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, fieldAllowed, retreats.map(r => r.id).join(",")]);

  useEffect(() => {
    if (user && !fieldAllowed) getMyIguardPending(user.uid).then(setRequested).catch(() => {});
  }, [user, fieldAllowed]);

  async function sendRequest() {
    if (!user) return;
    try {
      await requestIguardAccess(user.uid, user.email || "", user.displayName || "");
      setRequested(true);
      toast("접근 요청을 보냈습니다. 관리자 승인을 기다려주세요.", "success");
    } catch (e) {
      toast(`요청 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }


  if (authLoading) return <CenterSpinner />;

  // ── 미로그인 ──
  if (!user) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--color-screen-bg)" }}>
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">🧭</div>
        <h1 className="text-2xl font-bold text-white mb-1">수련회 이동가이드</h1>
        <p className="text-sm text-slate-400">고등부 수련회 이동 동선·안전 관리</p>
      </div>
      <InAppBrowserNotice />
      <button onClick={() => signIn().catch((e: unknown) => {
        // 사용자가 팝업을 직접 닫은 경우는 조용히 — 그 외(팝업 차단·네트워크 등)는 안내해야 현장에서 "눌러도 무반응"이 안 된다.
        const code = (e as { code?: string })?.code ?? "";
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
        toast(`로그인 실패 - ${code === "auth/popup-blocked" ? "브라우저가 팝업을 차단했습니다. 팝업 허용 후 다시 시도해주세요." : (e instanceof Error ? e.message : String(e))}`, "error");
      })} className="btn-primary px-6 py-3 text-base">Google 계정으로 로그인</button>
      <p className="text-xs text-slate-500 mt-4 text-center max-w-xs">처음이면 로그인 후 <strong>접근 요청</strong>을 보내면 관리자가 승인합니다.</p>
    </div>
  );

  // ── 권한 없음 ──
  if (!fieldAllowed) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="text-3xl mb-3">🔒</div>
      {requested ? (
        <>
          <p className="text-slate-700 font-medium mb-1">승인 대기 중입니다.</p>
          <p className="text-sm text-slate-500 mb-6">관리자가 승인하면 바로 접속할 수 있어요.<br />({user.email})</p>
        </>
      ) : (
        <>
          <p className="text-slate-700 font-medium mb-1">아직 접근 권한이 없습니다.</p>
          <p className="text-sm text-slate-500 mb-6">아래 버튼으로 접근을 요청하면 관리자가 승인합니다.<br />({user.email})</p>
          <button onClick={sendRequest} className="btn-primary mb-3">접근 요청 보내기</button>
        </>
      )}
      <button onClick={() => signOut()} className="btn-secondary">로그아웃</button>
    </div>
  );

  // ── 수련회 목록 + 준비 일정 ──
  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      {/* 행정(/retreats)과 같은 화면을 쓴다 — 들어가는 곳만 현장으로 다르다 */}
      {loading ? (
        <div className="mx-auto max-w-7xl px-4 py-6"><div className="card p-8 text-center text-slate-400">로딩 중...</div></div>
      ) : (
        <VacationHome
          mode="field"
          roles={roles}
          retreats={retreats as unknown as PortalRetreat[]}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loadError={loadError}
          lockedIds={new Set(Object.keys(accessLocks))}
          headerActions={canManageRetreatPin(roles) ? (
            <button onClick={() => setShowAdmin(true)} aria-label="현장 관리자 도구"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800">
              🔐 <span className="hidden sm:inline">현장 관리자</span>
            </button>
          ) : null}
        />
      )}

      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} retreats={retreats} locks={accessLocks} adminId={user.uid} />}
    </div>
  );
}
