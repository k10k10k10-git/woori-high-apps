"use client";
import { useEffect, useMemo, useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import CenterSpinner from "@/components/CenterSpinner";
import LoginButton from "@/components/LoginButton";
import {
  deleteRetreat, requestRetreatAccess, subscribeToAllRetreatPeriods, subscribeToRetreats,
} from "@/lib/db";
import { Retreat } from "@/lib/types";
import { selectRetreatForWork } from "@/lib/retreatSelection";
import FormGuideModal from "./FormGuideModal";
import { useUI } from "@/context/UIContext";
import BrainstormPanel from "./BrainstormPanel";
import { canAccessArea, canEditArea } from "@/features/portal/accessPolicy";
import VacationHome from "@/features/portal/VacationHome";
import AdminModal from "./field/AdminModal";
import { subscribeToIguardAccessLocks } from "@/features/iguard/lib/db";
import type { IguardAccessLock, Retreat as IguardRetreat } from "@/features/iguard/lib/types";


export default function HomePage() {
  const { user, loading, roles, signIn, signOut } = useAuth();
  const canUseAdmin = canAccessArea("retreat-admin", roles);
  const { toast } = useUI();
  const [requestSent, setRequestSent] = useState(false);
  const [retreatRecords, setRetreatRecords] = useState<Retreat[]>([]);
  const [periods, setPeriods] = useState<Array<{ retreatId: string; startDate: string; endDate?: string }>>([]);
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
      setSelectedRetreatId((previous) => previous && list.some((item) => item.id === previous) ? previous : null);
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
      (error) => setRetreatLoadError((previous) => previous || `수련회 기간 구독 실패 - ${error.message}`));
  }, [user, canUseAdmin, retreatIdsKey, subscriptionGeneration]);

  // 잠금 상태 — 목록의 자물쇠 배지와 관리자 모달이 함께 쓴다(현장 화면과 같은 노드).
  const sortedRetreatIdsKey = retreats.map((r) => r.id).join(",");
  useEffect(() => {
    if (!user || !canUseAdmin) return;
    const ids = sortedRetreatIdsKey ? sortedRetreatIdsKey.split(",") : [];
    return subscribeToIguardAccessLocks(ids, setAccessLocks,
      (e) => setRetreatLoadError((prev) => prev || `PIN 잠금 상태 구독 실패 - ${e.message}`));
  }, [user, canUseAdmin, sortedRetreatIdsKey, subscriptionGeneration]);

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
  if (loading) return <CenterSpinner />;

  // ── 로그인 화면 ─────────────────────────────────────────────
  // 통합 플랫폼의 한 영역이므로 독립 앱 시절의 남색 배경·파란 산 로고를 쓰지 않는다.
  // 로그인 버튼은 공용 LoginButton을 쓴다 — 직접 만든 버튼은 signIn 예외를 삼켜
  // "눌러도 아무 일 없음"이 되고, 그게 2026-07-10 사고의 원인이었다.
  if (!user) return (
    <main className="app-page grid min-h-screen place-items-center px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <h1 className="page-title">수련회 행정</h1>
        <p className="page-description mt-2">분당우리교회 고등부 · 방학 중 사역</p>
        <div className="mt-7 flex justify-center">
          <LoginButton signIn={signIn} />
        </div>
      </div>
    </main>
  );

  // ── 접근 권한 없음 ──────────────────────────────────────────
  // 통합 홈의 같은 상황 화면과 짝을 맞춘다. 예전에는 Firebase UID 원문을 보여 주고
  // "관리자에게 전달하세요"라고 했는데, 통합관리자가 팀원 관리에서 사람을 찾는 기준은
  // 이메일이라 UID는 옮겨 적기만 번거로웠다.
  if (!canUseAdmin) return (
    <main className="app-page grid min-h-screen place-items-center px-6 py-10">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-bold">접근 승인이 필요합니다</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          로그인은 되었지만 이 계정에 수련회 행정 권한이 없습니다.
          통합관리자가 역할을 배정하면 바로 사용할 수 있습니다.
        </p>
        {user.email && (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            로그인한 계정 <strong className="text-slate-700">{user.email}</strong>
            <span className="mt-1 block text-[11px]">이 주소를 통합관리자에게 알려주시면 배정이 빠릅니다.</span>
          </p>
        )}
        <div className="mt-5 grid gap-2">
          {requestSent ? (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              요청을 보냈습니다. 통합관리자 승인 후 이용할 수 있습니다.
            </p>
          ) : (
            <button onClick={handleRequestAccess} className="btn-primary justify-center">
              접근 요청 보내기
            </button>
          )}
        </div>
        <button onClick={signOut} className="mt-6 text-sm text-slate-500 underline">다른 계정으로 로그인</button>
      </div>
    </main>
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
                style={{ background: "var(--color-danger-bg)" }}>
                <Trash aria-hidden="true" size={22} className="text-red-500" />
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
        selectedId={selectedRetreatId ?? selectRetreatForWork(retreats, periods, new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }))?.id ?? null}
        onSelect={setSelectedRetreatId}
        onDelete={handleDelete}
        loadError={retreatLoadError || null}
        onRetry={() => {
          setRetreatLoadError("");
          setSubscriptionGeneration((value) => value + 1);
        }}
        lockedIds={new Set(Object.keys(accessLocks))}
        headerActions={
          <>
            <button
              onClick={() => setShowGuide(true)}
              className="btn-secondary btn-sm"
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
