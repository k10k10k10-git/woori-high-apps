"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/features/iguard/context/AuthContext";
import { canAccessPortalArea, canEditPortalArea, canManageRoles } from "@/features/portal/accessPolicy";
import NewRetreatButton from "@/features/portal/NewRetreatButton";
import { getRetreats, requestIguardAccess, getMyIguardPending, subscribeToAllRetreatPeriods, subscribeToMilestones, getEarliestPeriodDateByRetreat, subscribeToIguardAccessLocks, type RetreatPeriodWithOwner } from "@/features/iguard/lib/db";
import { Retreat, Milestone, type IguardAccessLock } from "@/features/iguard/lib/types";
import { useUI } from "@/context/UIContext";
import AdminModal from "./AdminModal";
import PrepCalendar from "./PrepCalendar";
import CenterSpinner from "@/components/CenterSpinner";

function inAppKind(): "kakao" | "line" | "other" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  if (/KAKAOTALK/i.test(ua)) return "kakao";
  if (/Line\//i.test(ua)) return "line";
  if (/FBAN|FBAV|Instagram|NAVER|DaumApps|; wv\)|Snapchat|kakaostory|Whale/i.test(ua)) return "other";
  return null;
}
function openExternal(kind: "kakao" | "line" | "other") {
  const url = window.location.href;
  if (kind === "kakao") { window.location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(url); return; }
  if (kind === "line") { window.location.href = url + (url.includes("?") ? "&" : "?") + "openExternalBrowser=1"; return; }
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isAndroid) {
    const noScheme = url.replace(/^https?:\/\//, "");
    window.location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;end`;
    return;
  }
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
  const [kind, setKind] = useState<"kakao" | "line" | "other" | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<RetreatPeriodWithOwner[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  useEffect(() => {
    const k = inAppKind();
    setKind(k);
    if (k === "kakao" || k === "line") { try { openExternal(k); } catch { /* 배너로 안내 */ } }
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

  // 준비 일정(milestones)은 전역 공유 — 선택 수련회와 무관하게 항상 구독(행정·이가드 공유)
  useEffect(() => {
    if (!user || !fieldAllowed) {
      setMilestones([]);
      return;
    }
    const u = subscribeToMilestones(setMilestones, e => setLoadError(prev => prev ?? `준비 일정 구독 실패 — ${e.message}`));
    return () => u();
  }, [user, fieldAllowed]);

  // 수련회 기간(periods)은 선택과 무관하게 모든 수련회를 합쳐서 항상 표시
  useEffect(() => {
    const ids = retreats.map(r => r.id);
    const u = subscribeToAllRetreatPeriods(ids, setPeriods,
      e => setLoadError(prev => prev ?? `수련회 기간 구독 실패 — ${e.message}`));
    return () => u();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retreats.map(r => r.id).join(",")]);

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

  const selectedRetreat = retreats.find(r => r.id === selectedId) ?? null;

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
          <button onClick={() => openExternal(kind)} className="btn-primary w-full justify-center mt-3 mb-1">크롬/사파리로 열기</button>
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

      <main className="max-w-7xl mx-auto px-4 py-5 sm:py-6">
        {loadError && <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">⚠ 로드 오류: {loadError}</div>}

        {loading ? (
          <div className="card p-8 text-center text-slate-400">로딩 중...</div>
        ) : retreats.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">
            <div className="text-3xl mb-2">🗂️</div>
            <p>등록된 수련회가 없습니다. (행정 사이트에서 생성)</p>
          </div>
        ) : (
          <>
          <div className="space-y-4 md:hidden">
            <section className="card p-4">
              <label className="mb-1 block text-xs font-semibold text-slate-500">수련회 선택</label>
              <select
                className="input h-11 w-full bg-white text-sm font-semibold text-slate-800"
                value={selectedId ?? ""}
                onChange={e => setSelectedId(e.target.value)}
              >
                {retreats.map(r => (
                  <option key={r.id} value={r.id}>{r.year}년 {r.name}</option>
                ))}
              </select>
              {selectedRetreat && (
                <Link href={`/retreat/${selectedRetreat.id}/field`} className="mt-3 block rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 p-3">
                  <div className="mb-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: "var(--color-badge-bg)", color: "var(--color-primary)", border: "1px solid var(--color-badge-border)" }}>
                    {selectedRetreat.year}년
                  </div>
                  <div className="font-bold leading-snug text-slate-800">{selectedRetreat.name}</div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
                    <span>이동가이드 입장 →</span>
                    {accessLocks[selectedRetreat.id] && (
                      <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[11px] text-fuchsia-700">
                        {canManageRoles(role) ? "🔓 관리자 우회" : "🔒 PIN"}
                      </span>
                    )}
                  </div>
                </Link>
              )}
            </section>

            <section>
              <div className="mb-3">
                <h2 className="text-base font-bold text-slate-700">준비 일정 <span className="text-xs font-normal text-slate-400">(공유)</span></h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  날짜를 클릭해 일정 추가 — 모든 수련회·행정과 공유{selectedRetreat ? ` · ${selectedRetreat.name} 기간 표시` : ""}
                </p>
              </div>
              <PrepCalendar periods={periods} milestones={milestones} retreats={retreats} />
            </section>
          </div>

          <div className="hidden gap-6 items-start md:flex">
            <aside className="w-72 shrink-0">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-700">수련회 목록</h2>
                {/* 수련회는 행정·이가드가 같은 `retreats/{id}`를 보므로 어느 쪽에서 만들어도 양쪽에 나타난다 */}
                {canEditPortalArea("retreat-admin", role) ? (
                  <NewRetreatButton
                    hrefAfterCreate={(id) => `/retreat/${id}/field`}
                    className="btn-primary text-xs px-2 py-1"
                  />
                ) : (
                  <span className="rounded-full px-2 py-1 text-xs font-semibold"
                    style={{ background: "var(--color-badge-bg)", color: "var(--color-primary)", border: "1px solid var(--color-badge-border)" }}>
                    공유 일정
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {retreats.map(r => {
                  const active = selectedId === r.id;
                  return (
                    <Link key={r.id} href={`/retreat/${r.id}/field`}
                      onMouseEnter={() => setSelectedId(r.id)}
                      onFocus={() => setSelectedId(r.id)}
                      className={`card block w-full p-4 text-left cursor-pointer transition-colors ${active ? "ring-1" : "hover:border-slate-300"}`}
                      style={active ? { borderColor: "var(--color-primary)", boxShadow: "0 4px 16px var(--color-primary-glow)" } : undefined}>
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{ background: "var(--color-badge-bg)", color: "var(--color-primary)", border: "1px solid var(--color-badge-border)" }}>{r.year}년</span>
                        {accessLocks[r.id] && (
                          <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700">
                            {canManageRoles(role) ? "🔓 관리자" : "🔒 PIN"}
                          </span>
                        )}
                      </div>
                      <h3 className="mb-2 truncate text-sm font-bold leading-tight text-slate-800">{r.name}</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">이동가이드</span>
                        <span className="text-xs font-medium transition-colors"
                          style={{ color: "var(--color-primary)" }}>
                          입장 →
                        </span>
                        </div>
                    </Link>
                  );
                })}
              </div>
            </aside>

            <section className="flex-1 min-w-0">
              <div className="mb-3">
                <h2 className="text-base font-bold text-slate-700">준비 일정 <span className="text-xs font-normal text-slate-400">(공유)</span></h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  날짜를 클릭해 일정을 추가하세요 — 모든 수련회·행정과 공유됩니다.{selectedRetreat ? ` 선택: ${selectedRetreat.name}(기간 표시)` : ""}
                </p>
              </div>
              <PrepCalendar periods={periods} milestones={milestones} retreats={retreats} />
            </section>
          </div>
          </>
        )}
      </main>

      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} retreats={retreats} locks={accessLocks} adminId={user.uid} />}
    </div>
  );
}
