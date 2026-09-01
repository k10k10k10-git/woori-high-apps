"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, DotsThree, GearSix } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { subscribeToRetreat, updateRetreat } from "@/lib/db";
import { Retreat } from "@/lib/types";
import { parseSheetUrl, buildSheetUrl } from "@/lib/sheetsParser";
import { useUI } from "@/context/UIContext";
import ParticipantsTab from "./ParticipantsTab";
import RetreatPrepSummary from "./RetreatPrepSummary";
import RetreatAreaNav from "@/features/portal/RetreatAreaNav";
import GroupsTab from "./GroupsTab";
import RoomsTab from "./RoomsTab";
import ClassRosterTab from "./ClassRosterTab";
import TeachersTab from "./TeachersTab";
import NotesTab from "./NotesTab";
import CarpoolTab from "./CarpoolTab";
import PartialAttendanceTab from "./PartialAttendanceTab";
import InsuranceTab from "./InsuranceTab";
import CancellationTab from "./CancellationTab";
import SuppliesTab from "./SuppliesTab";
import OnSiteRegistrationTab from "./OnSiteRegistrationTab";
import UnmatchedPaymentsTab from "./UnmatchedPaymentsTab";
import TshirtTab from "./TshirtTab";
import MedicalLogTab from "./MedicalLogTab";
import MealCountTab from "./MealCountTab";
import AdminSuppliesTab from "./AdminSuppliesTab";
import { canAccessArea, canEditArea, canSeeSensitiveRetreat } from "@/features/portal/accessPolicy";
import { RetreatEditProvider } from "@/features/portal/RetreatEditContext";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { useRetreatPinGate } from "@/features/portal/useRetreatPinGate";
import RetreatPinGate from "./field/RetreatPinGate";
import { RETREAT_TAB_GROUPS } from "@/features/portal/featureCatalog";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import { getRetreatWorkspaceSnapshot, mergeRetreatWorkspaceSnapshot } from "@/lib/retreatWorkspaceCache";
// ── 탭 인덱스 상수 ────────────────────────────────────────────
const TAB_IDX = {
  PARTICIPANTS: 0,
  GROUPS:       1,
  ROOMS:        2,
  NOTES:        3,
  TEACHERS:     4,
  CARPOOL:      5,
  PARTIAL:      6,
  ROSTER:       7,
  INSURANCE:    8,
  CANCELLATION: 9,
  SUPPLIES:     10,
  ONSITE:       11,
  PAYMENTS:     12,
  TSHIRT:       13,
  MEDICAL:      14,
  MEALCOUNT:    15,
  ADMINSUPPLIES: 16,
} as const;

// ── 탭 그룹 구조 (대그룹 → 소그룹) ─────────────────────────────
type TabEntry = { label: string; idx: number };

export default function RetreatPageClient() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, loading: authLoading, roles } = useAuth();
  const adminAllowed = canAccessArea("retreat-admin", roles);
  const canSeeSensitive = canSeeSensitiveRetreat(roles);
  // 스탭팀장·이가드팀은 행정 화면을 조회만 한다.
  const canEditAdmin = canEditArea("retreat-admin", roles);
  const { toast } = useUI();
  // 현장 화면과 같은 잠금 — 어느 쪽에서 PIN을 걸어도 행정·이가드 모두 잠긴다.
  const { lock, unlocked, lockError, markUnlocked } = useRetreatPinGate(id, {
    enabled: !authLoading && !!user && adminAllowed,
    roles,
  });

  const initialSnapshot = useRef(getRetreatWorkspaceSnapshot(id)).current;
  const [retreat, setRetreat] = useState<Retreat | null>(initialSnapshot?.retreat ?? null);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(initialSnapshot?.retreat === undefined);
  const [editingSheet, setEditingSheet] = useState(false);
  const editingSheetRef = useRef(false);
  const [sheetForm, setSheetForm] = useState({ name: "", sheetUrl: "" });

  // 한 번이라도 연 탭은 페이지를 나갈 때까지 유지한다. 돌아올 때 Firebase 구독과
  // 입력 상태를 다시 만들지 않아 반복 로딩·초기화를 막는다.
  const [mountedTabs, setMountedTabs] = useState<Set<number>>(new Set());
  const mountedTabsRef = useRef(mountedTabs);

  useEffect(() => {
    editingSheetRef.current = editingSheet;
  }, [editingSheet]);

  useEffect(() => {
    if (!mountedTabsRef.current.has(tab)) {
      setMountedTabs(prev => {
        const next = new Set(prev);
        next.add(tab);
        mountedTabsRef.current = next;
        return next;
      });
    }
  }, [tab]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/");
      return;
    }
    if (!adminAllowed || !id) return;

    return subscribeToRetreat(id,
      (r) => {
        setRetreat(r);
        mergeRetreatWorkspaceSnapshot(id, { retreat: r });
        if (r && !editingSheetRef.current) setSheetForm({
          name: r.name || "",
          sheetUrl: buildSheetUrl(r.sheetId || "", r.sheetGid || ""),
        });
        setLoading(false);
      },
      (e) => {
        toast(e instanceof Error ? e.message : "수련회 정보를 불러오지 못했습니다.", "error");
        setRetreat(null);
        setLoading(false);
      },
    );
  }, [adminAllowed, authLoading, id, router, toast, user]);

  const parsedSheetUrl = useMemo(() => parseSheetUrl(sheetForm.sheetUrl), [sheetForm.sheetUrl]);

  async function saveSheet() {
    if (!retreat) return;
    const name = sheetForm.name.trim();
    if (!name) {
      toast("수련회 이름을 입력해주세요.", "warning");
      return;
    }
    const parsed = sheetForm.sheetUrl.trim() ? parsedSheetUrl : null;
    if (sheetForm.sheetUrl.trim() && !parsed) {
      toast("올바른 구글 시트 URL을 입력해주세요.", "warning");
      return;
    }
    const sheetId  = parsed?.sheetId  ?? "";
    const sheetGid = parsed?.sheetGid ?? "";
    try {
      await updateRetreat(id, { name, sheetId, sheetGid });
      setRetreat(prev => prev ? { ...prev, name, sheetId, sheetGid } : prev);
      setSheetForm(prev => ({ ...prev, name }));
      setEditingSheet(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "시트 설정을 저장하지 못했습니다.", "error");
    }
  }

  // 민감 탭(환불계좌·주민번호·의료 기록)은 역할이 허용할 때만 보여준다.
  // retreatsPrivate는 Rules상 retreatAdmins 전체에 열려 있으므로, 화면이 마지막 방어선이다.
  const sensitiveTabs: number[] = canSeeSensitive ? [] : [TAB_IDX.CANCELLATION, TAB_IDX.MEDICAL, TAB_IDX.INSURANCE, TAB_IDX.PAYMENTS];
  const visibleGroups = RETREAT_TAB_GROUPS
    .map((group) => ({ ...group, tabs: (group.tabs as ReadonlyArray<TabEntry>).filter((t) => !sensitiveTabs.includes(t.idx)) }))
    .filter((group) => group.tabs.length > 0);

  // 현재 탭이 속한 그룹
  const activeGroupIdx = visibleGroups.findIndex(g => g.tabs.some(t => t.idx === tab));
  const safeGroupIdx = activeGroupIdx >= 0 ? activeGroupIdx : 0;
  const activeGroup  = visibleGroups[safeGroupIdx];
  // 명단·편성·이동은 일상 흐름으로 바로 두고, 저빈도 물품·현장 분류는 필요할 때 연다.
  // 현재 저빈도 그룹을 보고 있다면 그 그룹은 항상 1차 탭에 남겨 현재 위치를 잃지 않게 한다.
  const primaryGroups = visibleGroups.filter((_, index) => index < 3 || index === safeGroupIdx);
  const moreGroups = visibleGroups.filter((group) => !primaryGroups.includes(group));
  // 주소를 직접 입력해 민감 탭으로 들어오는 경로도 막는다.
  const effectiveTab = sensitiveTabs.includes(tab) ? (activeGroup?.tabs[0]?.idx ?? 0) : tab;

  // ── 로딩 화면 ────────────────────────────────────────────────
  if (authLoading || !user || (adminAllowed && loading)) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-screen-bg)" }}>
      <div className="w-full max-w-5xl px-4"><WorkspaceSkeleton label="수련회 행정 화면을 불러오는 중입니다." rows={7} variant="page" /></div>
    </div>
  );

  if (!adminAllowed) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-800">행정 화면 접근 권한이 없습니다</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          이가드 전용 계정은 현장 운영 화면만 사용할 수 있습니다.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {canAccessArea("retreat-field", roles) && (
            <button onClick={() => router.push(`/retreat/${encodeURIComponent(id)}/field`)} className="btn-primary">
              현장 화면으로
            </button>
          )}
          <button onClick={() => router.push("/")} className="btn-secondary">통합 홈으로</button>
        </div>
      </div>
    </div>
  );

  // ── PIN 잠금 게이트 (현장 화면과 동일) ───────────────────────
  if (lockError) return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-3xl" aria-hidden="true">⚠️</div>
      <p className="mb-4 max-w-md text-sm text-red-700" role="alert">{lockError}</p>
      <button onClick={() => router.push("/retreats")} className="btn-secondary">수련회 목록으로</button>
    </div>
  );
  if (lock === undefined) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-screen-bg)" }}>
      <div className="text-slate-400 text-sm">잠금 확인 중...</div>
    </div>
  );
  if (lock && !unlocked) return (
    <RetreatPinGate retreatId={id} lock={lock} onUnlocked={markUnlocked} onBack={() => router.push("/retreats")} />
  );

  if (!retreat) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-slate-500 mb-4">수련회를 찾을 수 없습니다.</p>
        <button onClick={() => router.push("/")} className="btn-secondary">홈으로</button>
      </div>
    </div>
  );

  return (
    <div className="app-page">

      {/* ══════════════════════════════════════════════════════
          Header
      ══════════════════════════════════════════════════════ */}
      <header className="workspace-sticky-header">

        {/* 1단: 다크 배경 — 타이틀 + 대그룹 탭 */}
        <div className="workspace-header">
          <div className="max-w-6xl mx-auto px-4">

            {/* 타이틀 */}
            <div className="pt-2 sm:pt-3 pb-1.5 sm:pb-2 flex items-center gap-1.5 sm:gap-3 min-w-0">
              <button
                onClick={() => router.push("/retreats")}
                className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/10 hover:text-white sm:text-xs"
                aria-label="수련회 목록으로 돌아가기"
              >
                <ArrowLeft aria-hidden="true" className="inline align-[-2px]" size={14} /> 목록
              </button>
              <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold shrink-0"
                style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)", border: "1px solid var(--color-badge-border)" }}>
                {retreat.year}년
              </span>
              <h1 className="font-bold text-white text-xs sm:text-base truncate min-w-0">{retreat.name}</h1>
              <RetreatAreaNav retreatId={id} current="admin" adminAllowed fieldAllowed={canAccessArea("retreat-field", roles)} />
               <div className="ml-auto shrink-0 whitespace-nowrap flex items-center gap-1.5">
                 <button
                   onClick={() => setEditingSheet(true)}
                   className="hidden shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white sm:flex"
                   aria-label="시트 설정 열기"
                 >
                   <GearSix aria-hidden="true" size={16} /> 시트 설정
                 </button>
                 <button
                   onClick={() => setEditingSheet(true)}
                   className="shrink-0 p-1.5 text-xs transition-colors sm:hidden"
                   aria-label="시트 설정 열기"
                   style={{ color: "#6b7280" }}
                 >
                   <GearSix aria-hidden="true" size={17} />
                 </button>
               </div>
            </div>

            {/* 대그룹 탭 */}
            <div className="flex gap-0.5 sm:gap-1" role="tablist" aria-label="탭 그룹">
              {primaryGroups.map((g) => {
                const isActive = g.label === activeGroup.label;
                return (
                  <button
                    key={g.label}
                    onClick={() => setTab(g.tabs[0].idx)}
                    className="workspace-group-tab"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="tab-content-panel"
                  >
                    {g.label}
                  </button>
                );
              })}
              {moreGroups.length > 0 && (
                <details className="retreat-more-groups relative shrink-0">
                  <summary className="workspace-group-tab flex cursor-pointer list-none items-center gap-1">
                    <DotsThree aria-hidden="true" size={17} weight="bold" /> 더보기
                  </summary>
                  <div className="retreat-more-groups__menu">
                    {moreGroups.map((group) => (
                      <button
                        key={group.label}
                        type="button"
                        onClick={(event) => {
                          setTab(group.tabs[0].idx);
                          event.currentTarget.closest("details")?.removeAttribute("open");
                        }}
                      >
                        <strong>{group.label}</strong>
                        <span>{group.tabs.map((item) => item.label).join(" · ")}</span>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>

        {/* 2단: 흰 배경 — 소그룹 탭 (가로 스크롤, 모바일 터치 최적화) */}
        <div className="workspace-tabs relative">
          <div className="max-w-6xl mx-auto px-0 sm:px-4">
            <div className="flex gap-0 overflow-x-auto scrollbar-hide tab-scroll-container" role="tablist" aria-label="세부 탭">
              {activeGroup.tabs.map((t) => (
                <button
                  key={t.idx}
                  onClick={() => setTab(t.idx)}
                  role="tab"
                  aria-selected={tab === t.idx}
                  className="workspace-tab shrink-0"
                >
                  {t.label}
                </button>
              ))}
              {/* 오른쪽 여백 (스크롤 시 마지막 탭이 잘리지 않도록) */}
              <div className="shrink-0 w-4 sm:hidden" aria-hidden="true" />
            </div>
          </div>
          {/* 그라데이션 페이드 힌트 (좌 + 우) */}
          <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-white to-transparent pointer-events-none sm:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none sm:hidden" />
        </div>

      </header>

      {/* ══════════════════════════════════════════════════════
          시트 설정 모달
      ══════════════════════════════════════════════════════ */}
      {editingSheet && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onKeyDown={e => { if (e.key === 'Escape') setEditingSheet(false); }}>
          <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="신청 응답 시트 설정">
            <h3 className="font-bold text-lg mb-4">신청 응답 시트 설정</h3>
            <p className="text-sm text-slate-500 mb-4">
              Google 시트를 <strong>웹에 게시</strong>해야 데이터를 불러올 수 있습니다.<br />
              (파일 → 공유 → 웹에 게시 → CSV)
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">수련회 이름</label>
                <input className="input" placeholder="겨울수련회"
                  value={sheetForm.name}
                  onChange={e => setSheetForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">신청 응답 시트 URL</label>
                <input
                  className={`input ${
                    sheetForm.sheetUrl && !parsedSheetUrl ? "border-red-400 focus:border-red-500" :
                    sheetForm.sheetUrl && parsedSheetUrl  ? "border-green-400 focus:border-green-500" : ""
                  }`}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetForm.sheetUrl}
                  onChange={e => setSheetForm(p => ({ ...p, sheetUrl: e.target.value }))}
                />
                {sheetForm.sheetUrl && parsedSheetUrl && (
                  <div className="mt-1.5 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 space-y-0.5">
                    <div>✅ 파싱 성공</div>
                    <div><span className="font-medium">Sheet ID:</span> <span className="font-mono">{parsedSheetUrl.sheetId}</span></div>
                    <div><span className="font-medium">GID:</span> <span className="font-mono">{parsedSheetUrl.sheetGid || "(첫 번째 시트)"}</span></div>
                  </div>
                )}
                {sheetForm.sheetUrl && !parsedSheetUrl && (
                  <p className="mt-1 text-xs text-red-500">올바른 구글 시트 URL을 입력해주세요.</p>
                )}
                {!sheetForm.sheetUrl && (
                  <p className="mt-1 text-xs text-slate-400">예: https://docs.google.com/spreadsheets/d/abc123/edit#gid=0</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={saveSheet}
                disabled={!!(sheetForm.sheetUrl.trim() && !parsedSheetUrl)}
                className="btn-primary flex-1 justify-center"
              >
                저장
              </button>
              <button onClick={() => setEditingSheet(false)} className="btn-secondary flex-1 justify-center">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          탭 컨텐츠
          - 방문한 탭: 한 번 마운트되면 CSS display로 토글 (Firebase 재구독 방지)
      ══════════════════════════════════════════════════════ */}
        <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6" role="tabpanel" id="tab-content-panel">
          {!canEditAdmin && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              조회 전용입니다. 명단·편성·이동·물품을 볼 수 있고 저장은 되지 않습니다.
            </div>
          )}
          {/* 탭 구조보다 남은 일을 먼저 읽히게 한다 — 조회 전용 역할에게도 현황은 보여준다. */}
          <RetreatPrepSummary key={id} retreatId={id} retreatYear={retreat.year} onOpenTab={setTab} />
          {/* fieldset disabled — 내부의 button·input·select·textarea를 브라우저가 전부 잠근다.
              display:contents라 레이아웃에는 영향이 없다. 드래그처럼 폼 요소가 아닌 조작은
              각 탭이 useRetreatCanEdit()으로 따로 잠근다. */}
          {!canEditAdmin && <ReadOnlyBanner what="수련회 행정 자료" why="편집은 행정팀·교역자·통합관리자만 가능합니다." />}
          <fieldset disabled={!canEditAdmin} className="contents">
          <RetreatEditProvider canEdit={canEditAdmin}>
          {/* 방문한 탭은 모두 마운트 후 유지한다. 첫 방문에만 준비하고 재방문은 즉시 복귀한다. */}
          {mountedTabs.has(TAB_IDX.PARTICIPANTS) && (
            <div style={{ display: effectiveTab === TAB_IDX.PARTICIPANTS ? "block" : "none" }}>
              <ParticipantsTab retreat={retreat} />
            </div>
          )}
          {mountedTabs.has(TAB_IDX.GROUPS) && (
            <div style={{ display: effectiveTab === TAB_IDX.GROUPS ? "block" : "none" }}>
              <GroupsTab retreat={retreat} />
            </div>
          )}
          {mountedTabs.has(TAB_IDX.ROOMS) && (
            <div style={{ display: effectiveTab === TAB_IDX.ROOMS ? "block" : "none" }}>
              <RoomsTab retreat={retreat} />
            </div>
          )}
          {mountedTabs.has(TAB_IDX.ROSTER) && (
            <div style={{ display: effectiveTab === TAB_IDX.ROSTER ? "block" : "none" }}>
              <ClassRosterTab retreat={retreat} />
            </div>
          )}
          {mountedTabs.has(TAB_IDX.NOTES) && <div style={{ display: effectiveTab === TAB_IDX.NOTES ? "block" : "none" }}><NotesTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.TEACHERS) && <div style={{ display: effectiveTab === TAB_IDX.TEACHERS ? "block" : "none" }}><TeachersTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.CARPOOL) && <div style={{ display: effectiveTab === TAB_IDX.CARPOOL ? "block" : "none" }}><CarpoolTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.PARTIAL) && <div style={{ display: effectiveTab === TAB_IDX.PARTIAL ? "block" : "none" }}><PartialAttendanceTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.INSURANCE) && <div style={{ display: effectiveTab === TAB_IDX.INSURANCE ? "block" : "none" }}><InsuranceTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.CANCELLATION) && <div style={{ display: effectiveTab === TAB_IDX.CANCELLATION ? "block" : "none" }}><CancellationTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.SUPPLIES) && <div style={{ display: effectiveTab === TAB_IDX.SUPPLIES ? "block" : "none" }}><SuppliesTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.ONSITE) && <div style={{ display: effectiveTab === TAB_IDX.ONSITE ? "block" : "none" }}><OnSiteRegistrationTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.PAYMENTS) && <div style={{ display: effectiveTab === TAB_IDX.PAYMENTS ? "block" : "none" }}><UnmatchedPaymentsTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.TSHIRT) && <div style={{ display: effectiveTab === TAB_IDX.TSHIRT ? "block" : "none" }}><TshirtTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.MEALCOUNT) && <div style={{ display: effectiveTab === TAB_IDX.MEALCOUNT ? "block" : "none" }}><MealCountTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.ADMINSUPPLIES) && <div style={{ display: effectiveTab === TAB_IDX.ADMINSUPPLIES ? "block" : "none" }}><AdminSuppliesTab retreat={retreat} /></div>}
          {mountedTabs.has(TAB_IDX.MEDICAL) && <div style={{ display: effectiveTab === TAB_IDX.MEDICAL ? "block" : "none" }}><MedicalLogTab retreat={retreat} /></div>}
          </RetreatEditProvider>
          </fieldset>
        </main>
    </div>
  );
}
