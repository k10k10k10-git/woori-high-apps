"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/iguard/context/AuthContext";
import { canAccessPortalArea, canManageRoles } from "@/features/portal/accessPolicy";
import VacationHome from "@/features/portal/VacationHome";
import type { Retreat as PortalRetreat } from "@/lib/types";
import { getRetreats, requestIguardAccess, getMyIguardPending, getEarliestPeriodDateByRetreat, subscribeToIguardAccessLocks } from "@/features/iguard/lib/db";
import { Retreat, type IguardAccessLock } from "@/features/iguard/lib/types";
import { useUI } from "@/context/UIContext";
import AdminModal from "./AdminModal";
import CenterSpinner from "@/components/CenterSpinner";
import { detectInAppBrowser, escapeStrategyFor, shouldAttemptEscape, type InAppBrowserKind } from "@/features/iguard/lib/inAppBrowser";

// 인앱 감지·탈출 전략은 공용 모듈(features/iguard/lib/inAppBrowser)만 쓴다.
// 예전엔 이 파일에 같은 로직을 복제해 두어 공용 모듈이 고아가 됐고, 그 사이
// "이동 주소 != 현재 주소" 불변식과 세션 1회 가드가 이쪽에는 빠져 있었다.
function escapeNow(): "moved" | "guide" {
  const strategy = escapeStrategyFor(navigator.userAgent || "", window.location.href);
  if (strategy.kind === "guide") return "guide";
  window.location.href = strategy.targetUrl;
  return "moved";
}

/** 자동 탈출 수단이 없을 때의 수동 폴백 — 주소를 복사해 직접 붙여넣게 안내한다. */
function copyAddressFallback() {
  const url = window.location.href;
  navigator.clipboard?.writeText(url).then(
    () => alert("주소를 복사했어요. Safari나 Chrome에 붙여넣어 열어주세요."),
    () => alert("우측 상단 메뉴(···)에서 'Safari/Chrome으로 열기'를 눌러주세요."),
  );
}

export default function FieldHomeClient() {
  const { user, loading: authLoading, role, signIn, signOut } = useAuth();
  const fieldAllowed = canAccessPortalArea("retreat-field", role);
  const { toast } = useUI();

  const [retreats, setRetreats] = useState<Retreat[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [accessLocks, setAccessLocks] = useState<Record<string, IguardAccessLock>>({});
  const [requested, setRequested] = useState(false);
  const [kind, setKind] = useState<InAppBrowserKind | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const detected = detectInAppBrowser(navigator.userAgent || "");
    setKind(detected);
    // 자동 탈출은 세션당 1회만 — 스킴이 실패하거나 외부 브라우저가 되돌아와도 반복되지 않는다.
    if (!detected) return;
    if (!shouldAttemptEscape(typeof window === "undefined" ? null : window.sessionStorage)) return;
    try { escapeNow(); } catch { /* 실패해도 아래 배너로 안내한다 */ }
  }, []);

  useEffect(() => {
    if (!user || !fieldAllowed) return;
    setLoading(true);
    setLoadError(null);
    getRetreats()
      .then(async list => {
        // 수련회 기간(실제 행사 날짜) 최신순 정렬 — 기간 미등록 수련회는 생성일 기준으로 뒤에 정렬
        const earliestByRetreat = await getEarliestPeriodDateByRetreat(list.map(r => r.id));
        const sorted = [...list].sort((a, b) => {
          const da = earliestByRetreat[a.id];
          const db = earliestByRetreat[b.id];
          if (da && db) return db.localeCompare(da);
          if (da) return -1;
          if (db) return 1;
          return (b.createdAt ?? 0) - (a.createdAt ?? 0);
        });
        setRetreats(sorted);
        setSelectedId(prev => prev ?? sorted[0]?.id ?? null);
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [user, fieldAllowed]);

  // 승인 사용자에게 수련회별 PIN 잠금 상태를 표시한다. 실제 PIN 검증은 내부 화면 진입 전에 다시 수행한다.
  useEffect(() => {
    if (!user || !fieldAllowed) { setAccessLocks({}); return; }
    const ids = retreats.map(r => r.id);
    return subscribeToIguardAccessLocks(ids, setAccessLocks,
      e => setLoadError(prev => prev ?? `PIN 잠금 상태 구독 실패 — ${e.message}`));
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
      {kind && (
        <div className="mb-5 max-w-xs bg-amber-50 border border-amber-300 rounded-lg p-4 text-xs text-amber-800 text-center">
          ⚠️ <strong>앱 안의 브라우저</strong>에서는 구글 로그인이 막힙니다.
          <button onClick={() => { if (escapeNow() === "guide") copyAddressFallback(); }} className="btn-primary w-full justify-center mt-3 mb-1">크롬/사파리로 열기</button>
          <span className="text-[11px] text-amber-700">{kind === "other" ? "버튼이 안 되면 우측 상단 ··· → '다른 브라우저로 열기'를 눌러주세요." : "자동 전환이 안 되면 위 버튼을 눌러주세요."}</span>
        </div>
      )}
      <button onClick={() => signIn().catch((e: unknown) => {
        // 사용자가 팝업을 직접 닫은 경우는 조용히 — 그 외(팝업 차단·네트워크 등)는 안내해야 현장에서 "눌러도 무반응"이 안 된다.
        const code = (e as { code?: string })?.code ?? "";
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
        toast(`로그인 실패 — ${code === "auth/popup-blocked" ? "브라우저가 팝업을 차단했습니다. 팝업 허용 후 다시 시도해주세요." : (e instanceof Error ? e.message : String(e))}`, "error");
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
      {/* 사이트 제목·계정·로그아웃은 전역 헤더가 담당한다(중복 제목 줄 제거).
          현장 전용 관리자 도구만 본문 상단에 남긴다. */}
      {canManageRoles(role) && (
        <div className="mx-auto flex max-w-7xl justify-end px-4 pt-3">
          <button onClick={() => setShowAdmin(true)} aria-label="현장 관리자 도구"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800">
            🔐 <span className="hidden sm:inline">현장 관리자</span>
          </button>
        </div>
      )}

      {/* 행정(/retreats)과 같은 화면을 쓴다 — 들어가는 곳만 현장으로 다르다 */}
      {loading ? (
        <div className="mx-auto max-w-7xl px-4 py-6"><div className="card p-8 text-center text-slate-400">로딩 중...</div></div>
      ) : (
        <VacationHome
          mode="field"
          role={role}
          retreats={retreats as unknown as PortalRetreat[]}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loadError={loadError}
          lockedIds={new Set(Object.keys(accessLocks))}
        />
      )}

      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} retreats={retreats} locks={accessLocks} adminId={user.uid} />}
    </div>
  );
}
