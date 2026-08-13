"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  deleteRetreat, requestRetreatAccess, subscribeToAllRetreatPeriods, subscribeToRetreats,
} from "@/lib/db";
import { Retreat } from "@/lib/types";
import FormGuideModal from "./FormGuideModal";
import { useUI } from "@/context/UIContext";
import BrainstormPanel from "./BrainstormPanel";
import { canAccessArea, canEditArea } from "@/features/portal/accessPolicy";
import VacationHome from "@/features/portal/VacationHome";
import AdminModal from "./field/AdminModal";
import { subscribeToIguardAccessLocks } from "@/features/iguard/lib/db";
import type { IguardAccessLock, Retreat as IguardRetreat } from "@/features/iguard/lib/types";

// ── 로고 SVG ────────────────────────────────────────────────
function RetreatLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 뒷 봉우리 */}
      <path d="M23 9 L31 27 L15 27 Z" fill="#075985" />
      {/* 앞 봉우리 */}
      <path d="M12 5 L23 27 L1 27 Z" fill="#0284c7" />
      {/* 눈 캡 */}
      <path d="M12 5 L15.5 13.5 L8.5 13.5 Z" fill="white" opacity="0.4" />
      {/* 별 */}
      <circle cx="27" cy="7" r="2" fill="#7dd3fc" />
      <circle cx="27" cy="7" r="3.5" fill="#7dd3fc" opacity="0.2" />
    </svg>
  );
}

// ── 공통 다크 배경 (로그인 / 권한없음) ─────────────────────────
function DarkScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0c2d4a 0%, #0a1628 60%)" }}>
      {children}
    </div>
  );
}

export default function HomePage() {
  const { user, loading, roles, signIn, signOut } = useAuth();
  const canUseAdmin = canAccessArea("retreat-admin", roles);
  const { toast } = useUI();
  const [requestSent, setRequestSent] = useState(false);
  const [retreatRecords, setRetreatRecords] = useState<Retreat[]>([]);
  const [periods, setPeriods] = useState<Array<{ retreatId: string; startDate: string }>>([]);
  const [retreatLoadError, setRetreatLoadError] = useState("");
  const [subscriptionGeneration, setSubscriptionGeneration] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [selectedRetreatId, setSelectedRetreatId] = useState<string | null>(null);
  // PIN 잠금은 현장(/field)과 같은 노드(retreats/{id}/iguard/accessLock)를 쓴다 —
  // 어느 화면에서 잠가도 행정·이가드 양쪽에 똑같이 반영된다.
  const [showLockAdmin, setShowLockAdmin] = useState(false);
  const [accessLocks, setAccessLocks] = useState<Record<string, IguardAccessLock>>({});
  const canManageLocks = canEditArea("retreat-admin", roles);

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
    return b.createdAt - a.createdAt;
  }), [earliestByRetreat, retreatRecords]);

  useEffect(() => {
    if (loading || !canUseAdmin || !user) return;
    return subscribeToRetreats((list) => {
      setRetreatRecords(list);
      setSelectedRetreatId((previous) => previous && list.some((item) => item.id === previous) ? previous : list[0]?.id ?? null);
    }, (error) => {
      setRetreatLoadError(error.message);
      toast(error.message, "error");
    });
  }, [loading, canUseAdmin, user, toast, subscriptionGeneration]);

  const retreatIdsKey = retreatRecords.map((r) => r.id).join(",");
  useEffect(() => {
    if (!user || !canUseAdmin) return;
    const ids = retreatIdsKey ? retreatIdsKey.split(",") : [];
    return subscribeToAllRetreatPeriods(ids, setPeriods,
      (error) => setRetreatLoadError((previous) => previous || `수련회 기간 구독 실패 — ${error.message}`));
  }, [user, canUseAdmin, retreatIdsKey]);

  // 잠금 상태 — 목록의 자물쇠 배지와 관리자 모달이 함께 쓴다(현장 화면과 같은 노드).
  const sortedRetreatIdsKey = retreats.map((r) => r.id).join(",");
  useEffect(() => {
    if (!user || !canUseAdmin) return;
    const ids = sortedRetreatIdsKey ? sortedRetreatIdsKey.split(",") : [];
    return subscribeToIguardAccessLocks(ids, setAccessLocks,
      (e) => setRetreatLoadError((prev) => prev || `PIN 잠금 상태 구독 실패 — ${e.message}`));
  }, [user, canUseAdmin, sortedRetreatIdsKey]);

  async function handleRequestAccess() {
    if (!user) return;
    try {
      await requestRetreatAccess(user.uid, user.email || "", user.displayName || "");
      setRequestSent(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : "접근 요청을 보내지 못했습니다.", "error");
    }
  }

  async function handleDelete(id: string, name: string) {
    setDeleteTarget({ id, name });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    try {
      await deleteRetreat(deletedId);
      setDeleteTarget(null);
      if (selectedRetreatId === deletedId) setSelectedRetreatId(null);
      toast("수련회를 삭제했습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "수련회를 삭제하지 못했습니다.", "error");
    }
  }

  // ── 로딩 ────────────────────────────────────────────────────
  if (loading) return (
    <DarkScreen>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
        <div className="text-slate-400 text-sm">로딩 중...</div>
      </div>
    </DarkScreen>
  );

  // ── 로그인 화면 ─────────────────────────────────────────────
  if (!user) return (
    <DarkScreen>
      <div className="w-full max-w-sm mx-4">
        {/* 타이틀 */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <RetreatLogo size={72} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">수련회 행정시스템</h1>
          <p className="text-slate-400 text-sm">분당우리교회 고등부 행정팀</p>
        </div>
        {/* 로그인 카드 */}
        <div className="rounded-2xl p-6"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)" }}>
          <button
            onClick={signIn}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-semibold text-slate-800 transition-all hover:shadow-lg"
            style={{ background: "#ffffff" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google로 로그인
          </button>
        </div>
      </div>
    </DarkScreen>
  );

  // ── 접근 권한 없음 ──────────────────────────────────────────
  if (!canUseAdmin) return (
    <DarkScreen>
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🔒</div>
          <h1 className="text-2xl font-bold text-white mb-1">접근 권한 없음</h1>
          <p className="text-slate-400 text-sm">{user.email}</p>
        </div>
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(0,0,0,0.3)" }}>
            <p className="text-xs text-slate-500 mb-1">Firebase UID (관리자에게 전달)</p>
            <p className="text-xs font-mono text-slate-300 break-all select-all">{user.uid}</p>
          </div>
          <p className="text-slate-400 text-sm text-center">관리자에게 접근 권한을 요청하세요.</p>
          {requestSent ? (
            <div className="rounded-lg p-3 text-center text-sm"
              style={{ background: "rgba(2,132,199,0.12)", border: "1px solid rgba(2,132,199,0.3)", color: "#7dd3fc" }}>
              ✅ 요청을 보냈습니다. 관리자 승인 후 이용 가능합니다.
            </div>
          ) : (
            <button onClick={handleRequestAccess} className="btn-primary w-full justify-center">
              접근 요청 보내기
            </button>
          )}
          <button onClick={signOut} className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ color: "#6b7280" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#d1d5db")}
            onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>
            로그아웃
          </button>
        </div>
      </div>
    </DarkScreen>
  );

  // ── 메인 화면 ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">

      {/* 전역 헤더(분당우리교회 서현고등부)가 이미 사이트 제목·계정·로그아웃을 담당한다.
          여기서 "수련회 행정시스템" 줄을 다시 그리면 제목이 두 줄로 겹쳐 보인다. */}

      {/* ═══ 삭제 확인 모달 ═══════════════════════════════════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onKeyDown={e => { if (e.key === 'Escape') setDeleteTarget(null); }}>
          <div className="card p-6 w-full max-w-sm" role="dialog" aria-modal="true" aria-label="수련회 삭제">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "#fee2e2" }}>
                <span className="text-xl">🗑️</span>
              </div>
              <h3 className="font-bold text-lg text-slate-800 mb-1">수련회 삭제</h3>
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700">&ldquo;{deleteTarget.name}&rdquo;</span>을<br />
                삭제하면 모든 데이터가 사라집니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 justify-center">
                취소
              </button>
              <button onClick={confirmDelete} className="btn-danger flex-1 justify-center">
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 구글폼 가이드 모달 ══════════════════════════════════ */}
      {showGuide && <FormGuideModal onClose={() => setShowGuide(false)} />}

      {/* 새 수련회 생성은 NewRetreatButton(행정·이가드 공용)이 담당한다 */}

      {/* 방학 중 사역 홈은 행정·이가드가 같은 화면(VacationHome)을 쓴다 — 다른 것은 입장 목적지뿐 */}
      <VacationHome
        mode="admin"
        roles={roles}
        retreats={retreats}
        selectedId={selectedRetreatId}
        onSelect={setSelectedRetreatId}
        onDelete={handleDelete}
        loadError={retreatLoadError || null}
        onRetry={() => {
          setRetreatLoadError("");
          setSubscriptionGeneration((value) => value + 1);
        }}
        emptyLogo={<RetreatLogo size={64} />}
        lockedIds={new Set(Object.keys(accessLocks))}
        headerActions={
          <>
            <button
              onClick={() => setShowGuide(true)}
              className="rounded-lg border px-2 py-1 text-xs font-medium transition-colors"
              style={{ color: "#0284c7", borderColor: "rgba(2,132,199,0.3)", background: "rgba(2,132,199,0.05)" }}
            >폼 가이드</button>
            {/* 현장 화면과 같은 잠금 도구 — 여기서 잠가도 이가드까지 함께 잠긴다 */}
            {canManageLocks && (
              <button onClick={() => setShowLockAdmin(true)} aria-label="수련회 PIN 잠금 관리"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800">
                🔐 <span className="hidden sm:inline">관리자</span>
              </button>
            )}
          </>
        }
        footer={<BrainstormPanel authorName={user.displayName || user.email || "이름 없음"} />}
      />

      {showLockAdmin && (
        <AdminModal onClose={() => setShowLockAdmin(false)} retreats={retreats as unknown as IguardRetreat[]}
          locks={accessLocks} adminId={user.uid} />
      )}
    </div>
  );
}
