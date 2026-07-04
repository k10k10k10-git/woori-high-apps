"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getRetreat, updateRetreat } from "@/lib/db";
import { Retreat } from "@/lib/types";
import { parseSheetUrl, buildSheetUrl } from "@/lib/sheetsParser";
import { useUI } from "@/context/UIContext";
import ParticipantsTab from "./ParticipantsTab";
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

// 자주 사용하는 탭은 한번 마운트되면 CSS display로 보여주기/숨기기 (keep-alive).
// 이를 통해 탭 전환 시 Firebase 재구독과 상태 초기화를 방지합니다.
const KEEP_ALIVE_TABS = new Set([
  0, // PARTICIPANTS
  1, // GROUPS
  2, // ROOMS
  7, // ROSTER
]);
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
const TAB_GROUPS = [
  {
    label: "사전 준비",
    tabs: [
      { label: "시트 연동",   idx: 0 },
      { label: "신청자 취합",  idx: 7 },
      { label: "미납자 현황",  idx: 12 },
      { label: "단체티 신청",  idx: 13 },
      { label: "취소명단",     idx: 9 },
      { label: "여행자 보험",  idx: 8 },
      { label: "조편성",      idx: 1 },
      { label: "방배정",      idx: 2 },
      { label: "교사 참석",   idx: 4 },
      { label: "물품/간식",   idx: 10 },
      { label: "식수 계산",   idx: 15 },
      { label: "행정물품",   idx: 16 },
    ],
  },
  {
    label: "현장 준비",
    tabs: [
      { label: "카풀",       idx: 5 },
      { label: "부분 참석",   idx: 6 },
      { label: "현장 등록",   idx: 11 },
      { label: "의료 일지",   idx: 14 },
      { label: "특이사항",    idx: 3 },
    ],
  },
] as const;

type TabEntry = { label: string; idx: number };

export default function RetreatPageClient() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, loading: authLoading } = useAuth();
  const { toast } = useUI();

  const [retreat, setRetreat] = useState<Retreat | null>(null);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingSheet, setEditingSheet] = useState(false);
  const [sheetForm, setSheetForm] = useState({ name: "", sheetUrl: "" });

  // keep-alive 탭: 한 번이라도 열린 탭은 언마운트하지 않고 CSS로 숨김
  const [mountedTabs, setMountedTabs] = useState<Set<number>>(new Set());
  const mountedTabsRef = useRef(mountedTabs);

  useEffect(() => {
    if (KEEP_ALIVE_TABS.has(tab) && !mountedTabsRef.current.has(tab)) {
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
    if (!id) return;

    let cancelled = false;
    getRetreat(id)
      .then((r) => {
        if (cancelled) return;
        setRetreat(r);
        if (r) setSheetForm({
          name: r.name || "",
          sheetUrl: buildSheetUrl(r.sheetId || "", r.sheetGid || ""),
        });
      })
      .catch((e) => {
        if (cancelled) return;
        toast(e instanceof Error ? e.message : "수련회 정보를 불러오지 못했습니다.", "error");
        setRetreat(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [authLoading, id, router, toast, user]);

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

  // 현재 탭이 속한 그룹
  const activeGroupIdx = TAB_GROUPS.findIndex(g =>
    (g.tabs as ReadonlyArray<TabEntry>).some(t => t.idx === tab)
  );
  const safeGroupIdx = activeGroupIdx >= 0 ? activeGroupIdx : 0;
  const activeGroup  = TAB_GROUPS[safeGroupIdx];

  // ── 로딩 화면 ────────────────────────────────────────────────
  if (authLoading || loading || !user) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-screen-bg)" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
        <div className="text-slate-400 text-sm">로딩 중...</div>
      </div>
    </div>
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
    <div className="min-h-screen bg-slate-50">

      {/* ══════════════════════════════════════════════════════
          Header
      ══════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-20">

        {/* 1단: 다크 배경 — 타이틀 + 대그룹 탭 */}
        <div style={{ background: "var(--color-header-bg)" }}>
          <div className="max-w-6xl mx-auto px-4">

            {/* 타이틀 */}
            <div className="pt-2 sm:pt-3 pb-1.5 sm:pb-2 flex items-center gap-1.5 sm:gap-3 min-w-0">
              <button
                onClick={() => router.push("/")}
                className="text-[11px] sm:text-xs transition-colors shrink-0 py-1 px-1"
                aria-label="수련회 목록으로 돌아가기"
                style={{ color: "#6b7280" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#38bdf8")}
                onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}
              >
                ← 목록
              </button>
              <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold shrink-0"
                style={{ background: "var(--color-badge-bg)", color: "var(--color-primary-light)", border: "1px solid var(--color-badge-border)" }}>
                {retreat.year}년
              </span>
              <h1 className="font-bold text-white text-xs sm:text-base truncate min-w-0">{retreat.name}</h1>
              <button
                onClick={() => setEditingSheet(true)}
                className="ml-auto text-xs flex items-center gap-1 transition-colors shrink-0 hidden sm:flex"
                aria-label="시트 설정 열기"
                style={{ color: "#6b7280" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#38bdf8")}
                onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}
              >
                ⚙ 시트 설정
              </button>
              <button
                onClick={() => setEditingSheet(true)}
                className="ml-auto text-xs transition-colors shrink-0 sm:hidden p-1.5"
                aria-label="시트 설정 열기"
                style={{ color: "#6b7280" }}
              >
                ⚙
              </button>
            </div>

            {/* 대그룹 탭 */}
            <div className="flex gap-0.5 sm:gap-1" role="tablist" aria-label="탭 그룹">
              {TAB_GROUPS.map((g, gi) => {
                const isActive = gi === safeGroupIdx;
                return (
                  <button
                    key={g.label}
                    onClick={() => setTab((g.tabs as ReadonlyArray<TabEntry>)[0].idx)}
                    className="px-2.5 sm:px-5 py-2 text-[11px] sm:text-sm font-semibold transition-all rounded-t-lg whitespace-nowrap"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="tab-content-panel"
                    style={isActive
                      ? { background: "#ffffff", color: "#1e293b" }
                      : { background: "transparent", color: "#6b7280" }
                    }
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "#d1d5db"; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "#6b7280"; }}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2단: 흰 배경 — 소그룹 탭 (가로 스크롤, 모바일 터치 최적화) */}
        <div className="bg-white border-b border-slate-200 relative">
          <div className="max-w-6xl mx-auto px-0 sm:px-4">
            <div className="flex gap-0 overflow-x-auto scrollbar-hide tab-scroll-container" role="tablist" aria-label="세부 탭">
              {(activeGroup.tabs as ReadonlyArray<TabEntry>).map((t) => (
                <button
                  key={t.idx}
                  onClick={() => setTab(t.idx)}
                  role="tab"
                  aria-selected={tab === t.idx}
                  className="px-3 sm:px-4 py-3 sm:py-2.5 text-[12px] sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0"
                  style={tab === t.idx
                    ? { borderColor: "var(--color-primary)", color: "var(--color-primary)", fontWeight: 600 }
                    : { borderColor: "transparent", color: "var(--color-text-muted)" }
                  }
                  onMouseEnter={e => { if (tab !== t.idx) e.currentTarget.style.color = "#1e293b"; }}
                  onMouseLeave={e => { if (tab !== t.idx) e.currentTarget.style.color = "#64748b"; }}
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
          - keep-alive 탭: 한 번 마운트되면 CSS display로 토글 (Firebase 재구독 방지)
          - 기타 탭: 기존 conditional render 유지
      ══════════════════════════════════════════════════════ */}
        <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6" role="tabpanel" id="tab-content-panel">
          {/* keep-alive 탭: 마운트 후 CSS display로 보여주기/숨기기 */}
          {mountedTabs.has(TAB_IDX.PARTICIPANTS) && (
            <div style={{ display: tab === TAB_IDX.PARTICIPANTS ? "block" : "none" }}>
              <ParticipantsTab retreat={retreat} />
            </div>
          )}
          {mountedTabs.has(TAB_IDX.GROUPS) && (
            <div style={{ display: tab === TAB_IDX.GROUPS ? "block" : "none" }}>
              <GroupsTab retreat={retreat} />
            </div>
          )}
          {mountedTabs.has(TAB_IDX.ROOMS) && (
            <div style={{ display: tab === TAB_IDX.ROOMS ? "block" : "none" }}>
              <RoomsTab retreat={retreat} />
            </div>
          )}
          {mountedTabs.has(TAB_IDX.ROSTER) && (
            <div style={{ display: tab === TAB_IDX.ROSTER ? "block" : "none" }}>
              <ClassRosterTab retreat={retreat} />
            </div>
          )}

          {/* 일반 탭: conditional render (사용 빈도 낮아 재마운트 허용) */}
          {tab === TAB_IDX.NOTES       && <NotesTab              retreat={retreat} />}
          {tab === TAB_IDX.TEACHERS    && <TeachersTab           retreat={retreat} />}
          {tab === TAB_IDX.CARPOOL     && <CarpoolTab            retreat={retreat} />}
          {tab === TAB_IDX.PARTIAL     && <PartialAttendanceTab  retreat={retreat} />}
          {tab === TAB_IDX.INSURANCE   && <InsuranceTab          retreat={retreat} />}
          {tab === TAB_IDX.CANCELLATION&& <CancellationTab       retreat={retreat} />}
          {tab === TAB_IDX.SUPPLIES    && <SuppliesTab           retreat={retreat} />}
          {tab === TAB_IDX.ONSITE      && <OnSiteRegistrationTab  retreat={retreat} />}
          {tab === TAB_IDX.PAYMENTS    && <UnmatchedPaymentsTab   retreat={retreat} />}
          {tab === TAB_IDX.TSHIRT      && <TshirtTab             retreat={retreat} />}
          {tab === TAB_IDX.MEALCOUNT   && <MealCountTab          retreat={retreat} />}
          {tab === TAB_IDX.ADMINSUPPLIES && <AdminSuppliesTab    retreat={retreat} />}
          {tab === TAB_IDX.MEDICAL     && <MedicalLogTab         retreat={retreat} />}
        </main>
    </div>
  );
}
