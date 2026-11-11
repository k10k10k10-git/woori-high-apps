"use client";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea, canManageRetreatPin } from "@/features/portal/accessPolicy";
import VacationHome from "@/features/portal/VacationHome";
import type { Retreat as PortalRetreat } from "@/lib/types";
import { subscribeToRetreats, requestIguardAccess, getMyIguardPending, subscribeToIguardAccessLocks } from "@/features/iguard/lib/db";
import { subscribeToAllRetreatPeriods } from "@/lib/db";
import { Retreat, type IguardAccessLock } from "@/features/iguard/lib/types";
import { useUI } from "@/context/UIContext";
import AdminModal from "./AdminModal";
import CenterSpinner from "@/components/CenterSpinner";
import LoginButton from "@/components/LoginButton";
import { useLoadErrors } from "@/lib/useLoadErrors";


export default function FieldHomeClient() {
  const { user, roles } = useAuth();
  const uid = user?.uid ?? "guest";
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<{ uid: string; id: string | null }>({ uid, id: null });
  const selectedId = selection.uid === uid ? selection.id : null;
  // 재구독은 수련회 선택을 유지하되 계정이 바뀌면 이전 계정의 선택을 넘기지 않는다.
  const setSelectedId = useCallback((value: SetStateAction<string | null>) => {
    setSelection((previous) => {
      const currentId = previous.uid === uid ? previous.id : null;
      const id = typeof value === "function" ? value(currentId) : value;
      return previous.uid === uid && previous.id === id ? previous : { uid, id };
    });
  }, [uid]);
  return <FieldHomeContent key={`${uid}:${roles.semester}:${roles.retreat}:${attempt}`} selectedId={selectedId} setSelectedId={setSelectedId} onRetry={() => setAttempt((value) => value + 1)} />;
}

function FieldHomeContent({ onRetry, selectedId, setSelectedId }: {
  onRetry: () => void;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
}) {
  const { user, loading: authLoading, roleError, retryRoles, roles, signIn, signOut } = useAuth();
  const fieldAllowed = canAccessArea("retreat-field", roles);
  const canLoad = !!user && !authLoading && !roleError && fieldAllowed;
  const { toast } = useUI();

  const [retreatRecords, setRetreatRecords] = useState<Retreat[]>([]);
  const [periods, setPeriods] = useState<Array<{ retreatId: string; startDate: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const { errors, fail, ok } = useLoadErrors(user?.uid ?? "guest");
  const [showAdmin, setShowAdmin] = useState(false);
  const [accessLocks, setAccessLocks] = useState<Record<string, IguardAccessLock>>({});
  const [requestState, setRequestState] = useState<"checking" | "pending" | "none" | "error">("checking");
  const [requestBusy, setRequestBusy] = useState(false);

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
    if (!canLoad) return;
    let active = true;
    const stop = subscribeToRetreats((list) => {
      if (!active) return;
      setRetreatRecords(list);
      setSelectedId((previous) => previous && list.some((item) => item.id === previous) ? previous : null);
      ok("retreats");
      setLoaded(true);
    }, (error) => { if (active) { fail("retreats")(error); setLoaded(true); } });
    return () => { active = false; stop(); };
  }, [canLoad, fail, ok, setSelectedId]);

  const retreatIdsKey = retreatRecords.map((retreat) => retreat.id).join(",");
  useEffect(() => {
    if (!canLoad) return;
    const ids = retreatIdsKey ? retreatIdsKey.split(",") : [];
    let active = true;
    const stop = subscribeToAllRetreatPeriods(ids, (items) => {
      if (active) setPeriods(items);
    }, (error) => { if (active) fail("periods")(error); });
    return () => { active = false; stop(); };
  }, [canLoad, retreatIdsKey, fail]);

  // 승인 사용자에게 수련회별 PIN 잠금 상태를 표시한다. 실제 PIN 검증은 내부 화면 진입 전에 다시 수행한다.
  useEffect(() => {
    if (!canLoad) return;
    const ids = retreatIdsKey ? retreatIdsKey.split(",") : [];
    let active = true;
    const stop = subscribeToIguardAccessLocks(ids, (locks) => {
      if (active) setAccessLocks(locks);
    }, (error) => { if (active) fail("locks")(error); });
    return () => { active = false; stop(); };
  }, [canLoad, retreatIdsKey, fail]);

  useEffect(() => {
    if (!user || authLoading || roleError || fieldAllowed) return;
    let active = true;
    getMyIguardPending(user.uid).then((requested) => {
      if (active) setRequestState(requested ? "pending" : "none");
    }).catch(() => { if (active) setRequestState("error"); });
    return () => { active = false; };
  }, [user, authLoading, roleError, fieldAllowed]);

  async function sendRequest() {
    if (!user || requestBusy || requestState !== "none") return;
    setRequestBusy(true);
    try {
      await requestIguardAccess(user.uid, user.email || "", user.displayName || "");
      setRequestState("pending");
      toast("접근 요청을 보냈습니다. 관리자 승인을 기다려주세요.", "success");
    } catch {
      setRequestState("error");
      toast("요청 전송 여부를 확인하지 못했습니다. 요청 상태를 다시 확인해 주세요.", "error");
    } finally {
      setRequestBusy(false);
    }
  }


  if (authLoading) return <CenterSpinner />;

  if (user && roleError) return <main className="team-first-state" role="alert">
    <h1 className="page-title">행사 이용 권한을 확인하지 못했습니다.</h1>
    <p>계정 정보를 불러오지 못해 승인 여부를 아직 확인할 수 없습니다. 다시 시도해 주세요.</p>
    <button className="btn-primary" onClick={retryRoles}>다시 시도</button>
    <Link className="btn-secondary" href="/library/help#connection">접속 문제 도움말</Link>
  </main>;

  // ── 미로그인 ──
  if (!user) return (
    <main className="team-first-state">
      <h1 className="page-title">수련회 현장 업무를 보려면 로그인해 주세요.</h1>
      <p>고등부에 등록한 이메일 계정으로 로그인해 주세요. 현장 담당이 처음이라면 로그인 후 접근 요청을 보낼 수 있습니다.</p>
      <LoginButton signIn={signIn} />
      <Link className="btn-secondary" href="/library/help#access">로그인·권한 안내</Link>
    </main>
  );

  // ── 권한 없음 ──
  if (!fieldAllowed) return (
    <main className="team-first-state">
      <h1 className="page-title">수련회 현장 접근 승인이 필요합니다.</h1>
      {user.email && <p>로그인한 계정: <strong>{user.email}</strong></p>}
      <p>고등부에 등록한 계정인지 확인해 주세요. 현장 담당이라면 아래에서 요청하고, 행정·프로그램 담당이라면 교역자 또는 통합관리자에게 이 이메일과 맡은 업무를 알려 주세요.</p>
      {requestState === "checking" ? <p role="status">보낸 접근 요청을 확인하고 있습니다…</p> : requestState === "error" ? <>
        <p role="alert">접근 요청 상태를 확인하지 못했습니다. 다시 확인해 주세요.</p>
        <button onClick={onRetry} className="btn-primary">요청 상태 다시 확인</button>
      </> : requestState === "pending" ? (
        <>
          <p role="status">접근 요청을 보냈습니다. 관리자 승인을 기다리고 있습니다.</p>
          <button onClick={retryRoles} className="btn-primary">승인 여부 다시 확인</button>
        </>
      ) : (
        <>
          <button onClick={() => void sendRequest()} disabled={requestBusy} className="btn-primary">{requestBusy ? "요청 보내는 중…" : "수련회 현장 접근 요청 보내기"}</button>
        </>
      )}
      <Link className="btn-secondary" href="/library/help#access">계정 확인·담당자 문의 방법</Link>
      <Link className="btn-secondary" href="/">홈으로</Link>
      <button onClick={() => void signOut().catch(() => toast("로그아웃하지 못했습니다. 다시 시도해 주세요.", "error"))} className="btn-secondary">다른 계정으로 로그인</button>
    </main>
  );

  if (errors.retreats) return <main className="team-first-state" role="alert">
    <h1 className="page-title">수련회 목록을 불러오지 못했습니다.</h1>
    <p>등록된 수련회가 없는 상태와는 다릅니다. 다시 불러오기를 눌러 주세요.</p>
    <button className="btn-primary" onClick={onRetry}>다시 불러오기</button>
    <Link className="btn-secondary" href="/library/help#connection">접속 문제 도움말</Link>
  </main>;

  // ── 수련회 목록 + 준비 일정 ──
  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      {/* 행정(/retreats)과 같은 화면을 쓴다 — 들어가는 곳만 현장으로 다르다 */}
      {!loaded ? (
        <div className="mx-auto max-w-7xl px-4 py-6"><div className="card p-8 text-center text-slate-400" role="status">수련회 목록을 불러오고 있습니다…</div></div>
      ) : (
        <VacationHome
          mode="field"
          roles={roles}
          retreats={retreats as unknown as PortalRetreat[]}
          selectedId={selectedId}
          periods={periods}
          onSelect={setSelectedId}
          loadError={Object.keys(errors).length > 0 ? "수련회 일정 또는 입장 잠금 상태를 확인하지 못했습니다. 다시 불러오기를 눌러 주세요." : null}
          onRetry={onRetry}
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
