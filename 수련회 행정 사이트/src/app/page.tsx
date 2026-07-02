"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  getRetreats, createRetreat, deleteRetreat,
  getRetreatAdmins, removeRetreatAdmin, updateRetreatAdminMemberName,
  getPendingRequests, approveRetreatRequest, denyRetreatRequest,
  requestRetreatAccess, getEarliestPeriodDateByRetreat,
  type RetreatAdminMember,
} from "@/lib/db";
import { Retreat } from "@/lib/types";
import { parseSheetUrl } from "@/lib/sheetsParser";
import FormGuideModal from "./FormGuideModal";
import { useUI } from "@/context/UIContext";
import RetreatCalendarPanel from "./RetreatCalendarPanel";
import BrainstormPanel from "./BrainstormPanel";

const MAIN_ADMIN = {
  name: process.env.NEXT_PUBLIC_MAIN_ADMIN_NAME ?? "관리자",
  email: process.env.NEXT_PUBLIC_MAIN_ADMIN_EMAIL ?? "",
};

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
  const router = useRouter();
  const { user, loading, accessLevel, signIn, signOut } = useAuth();
  const { toast, uiConfirm } = useUI();
  const [requestSent, setRequestSent] = useState(false);
  const [retreats, setRetreats] = useState<Retreat[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<Record<string, RetreatAdminMember>>({});
  const [memberNameDrafts, setMemberNameDrafts] = useState<Record<string, string>>({});
  const [editingMemberNameUid, setEditingMemberNameUid] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, { email: string; name: string; requestedAt: number }>>({});
  const [form, setForm] = useState({ name: "", year: new Date().getFullYear().toString(), sheetUrl: "" });
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [retreatLoadError, setRetreatLoadError] = useState("");
  const [membersError, setMembersError] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [selectedRetreatId, setSelectedRetreatId] = useState<string | null>(null);

  const loadRetreats = useCallback(async () => {
    setRetreatLoadError("");
    try {
      const list = await getRetreats();
      // 수련회 기간(실제 행사 날짜) 최신순 정렬 — 기간 미등록 수련회는 생성일 기준으로 뒤에 정렬
      const earliestByRetreat = await getEarliestPeriodDateByRetreat(list.map(r => r.id));
      const sorted = [...list].sort((a, b) => {
        const da = earliestByRetreat[a.id];
        const db = earliestByRetreat[b.id];
        if (da && db) return db.localeCompare(da);
        if (da) return -1;
        if (db) return 1;
        return b.createdAt - a.createdAt;
      });
      setRetreats(sorted);
      setSelectedRetreatId(prev => prev ?? sorted[0]?.id ?? null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "수련회 목록을 불러오지 못했습니다.";
      setRetreatLoadError(message);
      toast(message, "error");
    }
  }, [toast]);

  useEffect(() => {
    if (!loading && accessLevel !== "none" && user) void loadRetreats();
  }, [loading, accessLevel, user, loadRetreats]);

  async function loadMembersAndPending() {
    setMembersError("");
    try {
      const [m, p] = await Promise.all([getRetreatAdmins(), getPendingRequests()]);
      setMembers(m);
      setMemberNameDrafts(Object.fromEntries(Object.entries(m).map(([uid, member]) => [uid, member.name ?? ""])));
      setPending(p);
    } catch (e) {
      const message = e instanceof Error ? e.message : "팀원 정보를 불러오지 못했습니다.";
      setMembersError(message);
      toast(message, "error");
    }
  }

  async function handleSaveMemberName(uid: string, member: RetreatAdminMember) {
    try {
      await updateRetreatAdminMemberName(uid, member, memberNameDrafts[uid] ?? "");
      await loadMembersAndPending();
      setEditingMemberNameUid(null);
      toast("팀원 이름을 저장했습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "팀원 이름을 저장하지 못했습니다.", "error");
    }
  }

  async function handleRequestAccess() {
    if (!user) return;
    try {
      await requestRetreatAccess(user.uid, user.email || "", user.displayName || "");
      setRequestSent(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : "접근 요청을 보내지 못했습니다.", "error");
    }
  }

  const parsedSheetUrl = useMemo(() => parseSheetUrl(form.sheetUrl), [form.sheetUrl]);
  const approvedMembers = useMemo(
    () => Object.entries(members).filter(([, member]) => member.email !== MAIN_ADMIN.email),
    [members]
  );

  async function handleCreate() {
    const name = form.name.trim();
    const year = Number(form.year);
    if (!name) return toast("수련회 이름을 입력해주세요.", "warning");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      toast("연도를 2000~2100 사이의 숫자로 입력해주세요.", "warning");
      return;
    }
    const parsed = form.sheetUrl.trim() ? parseSheetUrl(form.sheetUrl) : null;
    if (form.sheetUrl.trim() && !parsed) {
      setCreateError("올바른 구글 시트 URL이 아닙니다.");
      return;
    }
    setSaving(true);
    setCreateError("");
    try {
      const id = await createRetreat({
        name,
        year,
        sheetId: parsed?.sheetId ?? "",
        sheetGid: parsed?.sheetGid ?? "",
        createdAt: Date.now(),
        groupCount: 0,
      });
      setShowCreate(false);
      setForm({ name: "", year: new Date().getFullYear().toString(), sheetUrl: "" });
      await loadRetreats();
      router.push(`/retreat/${id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCreateError(msg.includes("PERMISSION_DENIED")
        ? "권한 없음: Firebase 보안 규칙을 확인해주세요."
        : `오류: ${msg}`);
    } finally {
      setSaving(false);
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
      await loadRetreats();
      toast("수련회를 삭제했습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "수련회를 삭제하지 못했습니다.", "error");
    }
  }

  async function handleApproveMember(uid: string, info: { email: string; name?: string }) {
    try {
      await approveRetreatRequest(uid, info);
      await loadMembersAndPending();
      toast("팀원을 승인했습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "팀원을 승인하지 못했습니다.", "error");
    }
  }

  async function handleDenyMember(uid: string) {
    try {
      await denyRetreatRequest(uid);
      await loadMembersAndPending();
      toast("요청을 거절했습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "요청을 거절하지 못했습니다.", "error");
    }
  }

  async function handleRemoveMember(uid: string) {
    const member = members[uid];
    const label = member?.name ? `${member.name} (${member.email})` : member?.email ?? "이 팀원";
    if (!await uiConfirm(`${label}을 팀원에서 삭제하시겠습니까?`)) return;
    try {
      await removeRetreatAdmin(uid);
      await loadMembersAndPending();
      toast("팀원을 삭제했습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "팀원을 삭제하지 못했습니다.", "error");
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
  if (accessLevel === "none") return (
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

      {/* ═══ Header ═══════════════════════════════════════════ */}
      <header className="sticky top-0 z-10" style={{ background: "var(--color-header-bg)" }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RetreatLogo size={26} />
            <span className="font-bold text-white text-base">수련회 행정시스템</span>
            <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full ml-1"
              style={{ background: "var(--color-badge-bg)", color: "var(--color-primary-light)", border: "1px solid var(--color-badge-border)" }}>
              고등부
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm hidden sm:inline" style={{ color: "#6b7280" }}>{user.displayName}</span>
            {accessLevel === "admin" && (
              <button
                onClick={() => { setShowMembers(true); loadMembersAndPending(); }}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                style={{ background: "rgba(255,255,255,0.08)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.1)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#e2e8f0")}
                onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}
              >
                👥 팀원 관리
              </button>
            )}
            <button
              onClick={signOut}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ background: "rgba(255,255,255,0.08)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.1)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e2e8f0")}
              onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* ═══ 팀원 관리 모달 ════════════════════════════════════ */}
      {showMembers && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onKeyDown={e => { if (e.key === 'Escape') setShowMembers(false); }}>
          <div className="card p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="팀원 관리">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">팀원 관리</h3>
              <button onClick={() => setShowMembers(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none" aria-label="닫기">×</button>
            </div>
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-blue-700 mb-2">👑 관리자</h4>
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{MAIN_ADMIN.name}</div>
                  <span className="text-[11px] px-1.5 py-0.5 rounded border border-blue-200 bg-white text-blue-700 shrink-0">관리자</span>
                </div>
                <div className="text-xs text-slate-500 truncate mt-0.5">{MAIN_ADMIN.email}</div>
              </div>
            </div>
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-orange-600 mb-2">⏳ 승인 대기 ({Object.keys(pending).length}명)</h4>
              {membersError && (
                <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  ⚠ {membersError}
                </div>
              )}
              {Object.keys(pending).length === 0 ? (
                <p className="text-xs text-slate-400 py-2">대기 중인 요청이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(pending).map(([uid, info]) => (
                    <div key={uid} className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{info.name}</div>
                        <div className="text-xs text-slate-500">{info.email}</div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleApproveMember(uid, info)}
                          className="btn-primary btn-sm text-xs">승인</button>
                        <button onClick={() => handleDenyMember(uid)}
                          className="btn-secondary btn-sm text-xs">거절</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-600 mb-2">✅ 승인된 팀원 ({approvedMembers.length}명)</h4>
              {approvedMembers.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">승인된 팀원이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {approvedMembers.map(([uid, member]) => (
                    <div key={uid} className="bg-slate-50 rounded-lg px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            {member.name ? (
                              <div className="text-sm font-medium text-slate-800 truncate">{member.name}</div>
                            ) : (
                              <div className="text-sm font-medium text-slate-400 truncate">이름 미설정</div>
                            )}
                            <button
                              onClick={() => setEditingMemberNameUid(editingMemberNameUid === uid ? null : uid)}
                              className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 bg-white shrink-0"
                            >
                              이름 수정
                            </button>
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">
                            {member.email}
                          </div>
                        </div>
                        <button onClick={() => handleRemoveMember(uid)}
                          className="text-slate-300 hover:text-red-400 text-lg leading-none transition-colors shrink-0" aria-label="삭제">×</button>
                      </div>
                      {editingMemberNameUid === uid && (
                        <div className="flex gap-2 mt-2">
                          <input
                            className="input text-xs flex-1 py-1.5"
                            placeholder="이름 입력"
                            aria-label="팀원 이름"
                            value={memberNameDrafts[uid] ?? ""}
                            onChange={e => setMemberNameDrafts(prev => ({ ...prev, [uid]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && handleSaveMemberName(uid, member)}
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveMemberName(uid, member)}
                            className="btn-secondary btn-sm text-xs whitespace-nowrap"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => {
                              setMemberNameDrafts(prev => ({ ...prev, [uid]: member.name ?? "" }));
                              setEditingMemberNameUid(null);
                            }}
                            className="btn-secondary btn-sm text-xs whitespace-nowrap"
                          >
                            취소
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-4">팀원들이 앱에서 &apos;접근 요청 보내기&apos;를 누르면 여기서 승인할 수 있습니다.</p>
          </div>
        </div>
      )}

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

      {/* ═══ 새 수련회 모달 ════════════════════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onKeyDown={e => { if (e.key === 'Escape') setShowCreate(false); }}>
          <div className="card p-6 w-full max-w-md" role="dialog" aria-modal="true" aria-label="새 수련회 만들기">
            <h3 className="font-bold text-lg mb-4 text-slate-800">새 수련회 만들기</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">수련회 이름 *</label>
                <input className="input" placeholder="2026 겨울 수련회"
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">연도 *</label>
                <input className="input" type="number" value={form.year}
                  onChange={e => setForm(p => ({ ...p, year: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">
                  신청 응답 시트 URL
                  <span className="text-xs text-slate-400 ml-1">(선택, 나중에도 설정 가능)</span>
                </label>
                <input
                  className={`input ${
                    form.sheetUrl && !parsedSheetUrl ? "border-red-400" :
                    form.sheetUrl && parsedSheetUrl  ? "border-green-400" : ""
                  }`}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={form.sheetUrl}
                  onChange={e => setForm(p => ({ ...p, sheetUrl: e.target.value }))}
                />
                {form.sheetUrl && parsedSheetUrl && (
                  <div className="mt-1.5 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                    ✅ 파싱 성공 — Sheet ID: <span className="font-mono">{parsedSheetUrl.sheetId.slice(0, 20)}…</span>
                  </div>
                )}
                {form.sheetUrl && !parsedSheetUrl && (
                  <p className="mt-1 text-xs text-red-500">올바른 구글 시트 URL을 입력해주세요.</p>
                )}
              </div>
            </div>
            {createError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">{createError}</div>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={handleCreate} disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? "생성 중..." : "만들기"}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 메인 컨텐츠 ═══════════════════════════════════════ */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {retreatLoadError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span>⚠ {retreatLoadError}</span>
            <button onClick={loadRetreats} className="btn-secondary btn-sm justify-center">다시 불러오기</button>
          </div>
        )}

        {retreats.length === 0 ? (
          /* 빈 상태 */
          <div className="card p-16 text-center max-w-md mx-auto">
            <div className="flex justify-center mb-4"><RetreatLogo size={64} /></div>
            <p className="text-slate-500 font-medium">아직 수련회가 없습니다</p>
            <p className="text-sm text-slate-400 mt-1 mb-5">&apos;새 수련회&apos; 버튼으로 시작하세요!</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              ＋ 새 수련회 만들기
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6 items-stretch md:items-start">

            {/* 왼쪽: 수련회 목록 */}
            <div className="w-full md:w-72 md:shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-slate-700">수련회 목록</h2>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowGuide(true)}
                    className="text-xs px-2 py-1 rounded-lg font-medium transition-colors border"
                    style={{ color: "#0284c7", borderColor: "rgba(2,132,199,0.3)", background: "rgba(2,132,199,0.05)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(2,132,199,0.1)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(2,132,199,0.05)")}
                  >폼 가이드</button>
                  <button onClick={() => setShowCreate(true)} className="btn-primary text-xs px-2 py-1">＋ 새 수련회</button>
                </div>
              </div>

              {/* 모바일: select 드롭다운 + 선택된 수련회 카드 (이가드 사이트와 동일 패턴) */}
              <div className="md:hidden">
                <select
                  className="input h-11 w-full bg-white text-sm font-semibold text-slate-800"
                  value={selectedRetreatId ?? ""}
                  onChange={e => setSelectedRetreatId(e.target.value)}
                >
                  {retreats.map(r => (
                    <option key={r.id} value={r.id}>{r.year}년 {r.name}</option>
                  ))}
                </select>
                {(() => {
                  const s = retreats.find(r => r.id === selectedRetreatId);
                  if (!s) return null;
                  return (
                    <div className="mt-3 rounded-lg p-3"
                      style={{ background: "var(--color-primary-glow)", border: "1px solid var(--color-primary-ring)" }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ background: "var(--color-badge-bg)", color: "var(--color-primary)", border: "1px solid var(--color-badge-border)" }}>
                          {s.year}년
                        </span>
                        <button onClick={() => handleDelete(s.id, s.name)}
                          className="text-slate-300 hover:text-red-400 text-lg leading-none transition-colors" aria-label="삭제">×</button>
                      </div>
                      <div className="font-bold leading-snug text-slate-800">{s.name}</div>
                      <button onClick={() => router.push(`/retreat/${s.id}`)}
                        className="mt-2 text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
                        상세 보기 →
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* 데스크탑: 전체 카드 리스트 */}
              <div className="hidden md:block space-y-2">
                {retreats.map(r => {
                  const isSelected = selectedRetreatId === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => router.push(`/retreat/${r.id}`)}
                      className="card p-4 cursor-pointer group transition-all duration-150"
                      style={{
                        borderColor: isSelected ? "var(--color-primary)" : "var(--color-border)",
                        boxShadow: isSelected ? "0 4px 16px var(--color-primary-glow)" : "",
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--color-primary)";
                          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px var(--color-primary-glow)";
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--color-border)";
                          (e.currentTarget as HTMLDivElement).style.boxShadow = "";
                        }
                      }}
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: "var(--color-primary-glow)", color: "var(--color-primary)", border: "1px solid var(--color-primary-ring)" }}>
                          {r.year}년
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(r.id, r.name); }}
                          className="text-slate-200 hover:text-red-400 text-lg leading-none transition-colors opacity-0 group-hover:opacity-100"
                          aria-label="삭제"
                        >×</button>
                      </div>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight mb-2">{r.name}</h3>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                          {new Date(r.createdAt).toLocaleDateString("ko-KR")} 생성
                        </p>
                        <button
                          onClick={e => { e.stopPropagation(); router.push(`/retreat/${r.id}`); }}
                          className="text-xs font-medium transition-colors"
                          style={{ color: "var(--color-primary)" }}
                          onMouseEnter={e => (e.currentTarget.style.color = "var(--color-primary-hover)")}
                          onMouseLeave={e => (e.currentTarget.style.color = "var(--color-primary)")}
                        >
                          상세 보기 →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 오른쪽: 준비 일정 — 모든 수련회가 공유하는 전역 캘린더 (수련회 선택과 무관하게 항상 표시) */}
            <div className="w-full flex-1 min-w-0">
              <div className="mb-3">
                <h2 className="text-base font-bold text-slate-700">준비 일정 <span className="text-xs font-normal text-slate-400">(공유)</span></h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  날짜를 클릭해 일정을 추가하세요 — 모든 수련회·이가드와 공유됩니다. 수련회 기간도 항상 전체가 함께 표시됩니다.
                  {(() => { const s = retreats.find(r => r.id === selectedRetreatId); return s ? ` 새 기간 추가 대상: ${s.name}` : ""; })()}
                </p>
              </div>
              <RetreatCalendarPanel retreat={retreats.find(r => r.id === selectedRetreatId)} retreats={retreats} />
              <BrainstormPanel authorName={user.displayName || user.email || "이름 없음"} />
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
