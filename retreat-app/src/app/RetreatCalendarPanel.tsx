"use client";
import { useEffect, useState, useMemo } from "react";
import { Retreat, Milestone } from "@/lib/types";
import { toYMD } from "@/lib/dateFormat";
import {
  subscribeToMilestones, saveMilestone, updateMilestone, deleteMilestone,
  subscribeToAllRetreatPeriods, saveRetreatPeriod, updateRetreatPeriod, deleteRetreatPeriod,
  type RetreatPeriodWithOwner,
} from "@/lib/db";
import { useUI } from "@/context/UIContext";

/* ── 유틸 ── */
const WEEK_DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function parseYMD(value: string): Date {
  const [yyyy, mm, dd] = value.split("-").map(Number);
  return new Date(yyyy, (mm || 1) - 1, dd || 1);
}
function diffDays(targetDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = parseYMD(targetDate); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}
function calcDuration(start: string, end: string): string {
  const nights = Math.round((parseYMD(end).getTime() - parseYMD(start).getTime()) / 86400000);
  return nights > 0 ? `${nights}박${nights + 1}일` : "당일";
}
function getCalendarCells(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
function getMilestoneColor(m: Milestone): { bg: string; text: string; border: string; dot: string } {
  if (m.done) {
    return m.sourceSite === "move-guide"
      ? { bg: "bg-fuchsia-100", text: "text-fuchsia-700", border: "border-fuchsia-200", dot: "bg-fuchsia-500" }
      : { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-200", dot: "bg-sky-500" };
  }
  const d = diffDays(m.targetDate);
  if (d < 0)   return { bg: "bg-red-100",    text: "text-red-700",    border: "border-red-200",    dot: "bg-red-400" };
  if (d <= 3)  return { bg: "bg-red-100",    text: "text-red-700",    border: "border-red-200",    dot: "bg-red-400" };
  if (d <= 7)  return { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-400" };
  if (d <= 13) return { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-400" };
  return       { bg: "bg-blue-50",   text: "text-blue-600",   border: "border-blue-200",   dot: "bg-blue-300" };
}

// 수련회 기간에 쓸 색상 팔레트 (기간 index 기준)
const PERIOD_COLORS = [
  { bg: "bg-sky-100",    text: "text-sky-800",     border: "border-sky-300",    dot: "bg-sky-500",    rangeBg: "bg-sky-50"    },
  { bg: "bg-slate-100",  text: "text-slate-700",   border: "border-slate-300",  dot: "bg-slate-400",  rangeBg: "bg-slate-50"  },
  { bg: "bg-cyan-100",   text: "text-cyan-800",    border: "border-cyan-300",   dot: "bg-cyan-500",   rangeBg: "bg-cyan-50"   },
  { bg: "bg-blue-100",   text: "text-blue-800",    border: "border-blue-300",   dot: "bg-blue-500",   rangeBg: "bg-blue-50"   },
  { bg: "bg-teal-100",   text: "text-teal-800",    border: "border-teal-300",   dot: "bg-teal-500",   rangeBg: "bg-teal-50"   },
];
function periodColor(idx: number) { return PERIOD_COLORS[idx % PERIOD_COLORS.length]; }

const PRESET_MILESTONES = [
  "신청 오픈", "신청 마감", "입금 마감", "조편성 완료", "방배정 완료",
  "단체티 주문 마감", "여행자 보험 등록 마감", "카풀 매칭 마감",
  "교사 참석 확인 마감", "최종 인원 확인", "수련회 용품 구매 완료",
];

export default function RetreatCalendarPanel({ retreat, retreats }: { retreat?: Retreat; retreats: Retreat[] }) {
  const { toast, uiConfirm } = useUI();
  const today = toYMD(new Date());

  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [periods, setPeriods] = useState<RetreatPeriodWithOwner[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 달력 표시 연/월 — 가장 가까운 기간 기준으로 초기화
  const [calYear,  setCalYear]  = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  // 기간 추가/편집 폼
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editingPeriodRetreatId, setEditingPeriodRetreatId] = useState<string | null>(null);
  const [periodForm, setPeriodForm] = useState({ startDate: "", endDate: "", theme: "", label: "" });
  const [savingPeriod, setSavingPeriod] = useState(false);

  // 마일스톤 날짜 클릭 패널
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formNote,  setFormNote]  = useState("");
  const [saving,    setSaving]    = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate,  setEditDate]  = useState("");
  const [editNote,  setEditNote]  = useState("");

  // 수련회 전환 시 폼 초기화
  useEffect(() => {
    setShowPeriodForm(false);
    setEditingPeriodId(null);
  }, [retreat?.id]);

  // 마일스톤(준비 일정)은 전역 공유 — 선택된 수련회와 무관하게 항상 구독.
  useEffect(() => {
    const unsubM = subscribeToMilestones(list =>
      setMilestones(list.sort((a, b) => a.targetDate.localeCompare(b.targetDate))),
      e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)
    );
    return () => unsubM();
  }, []);

  // 수련회 기간(periods)은 선택과 무관하게 모든 수련회를 합쳐서 항상 표시.
  const retreatIds = useMemo(() => retreats.map(r => r.id), [retreats]);
  useEffect(() => {
    let movedCal = false;
    const unsubP = subscribeToAllRetreatPeriods(retreatIds, list => {
      setPeriods(list);
      if (!movedCal && list.length > 0) {
        movedCal = true;
        const earliest = list.reduce((a, b) => a.startDate < b.startDate ? a : b);
        const d = parseYMD(earliest.startDate);
        setCalYear(d.getFullYear());
        setCalMonth(d.getMonth());
      }
    }, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`));
    return () => unsubP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retreatIds.join(",")]);

  const cells = useMemo(() => getCalendarCells(calYear, calMonth), [calYear, calMonth]);
  const milestonesByDate = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    milestones.forEach(m => {
      const list = map.get(m.targetDate) ?? [];
      list.push(m);
      map.set(m.targetDate, list);
    });
    return map;
  }, [milestones]);

  // 날짜 → 해당하는 기간 목록 (index 포함)
  const periodsByDate = useMemo(() => {
    const map = new Map<string, { period: RetreatPeriodWithOwner; idx: number; isStart: boolean; isEnd: boolean }[]>();
    periods.forEach((p, idx) => {
      let cur = p.startDate;
      while (cur <= p.endDate) {
        const list = map.get(cur) ?? [];
        list.push({ period: p, idx, isStart: cur === p.startDate, isEnd: cur === p.endDate });
        map.set(cur, list);
        const d = parseYMD(cur); d.setDate(d.getDate() + 1);
        cur = toYMD(d);
      }
    });
    return map;
  }, [periods]);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  function openAddPeriod() {
    setEditingPeriodId(null);
    setEditingPeriodRetreatId(null);
    setPeriodForm({ startDate: "", endDate: "", theme: "", label: "" });
    setShowPeriodForm(true);
  }
  function openEditPeriod(p: RetreatPeriodWithOwner) {
    setEditingPeriodId(p.id);
    setEditingPeriodRetreatId(p.retreatId);
    setPeriodForm({ startDate: p.startDate, endDate: p.endDate, theme: p.theme ?? "", label: p.label ?? "" });
    setShowPeriodForm(true);
  }

  async function handleSavePeriod() {
    if (!periodForm.startDate || !periodForm.endDate) return toast("시작일과 종료일을 모두 입력해주세요.", "warning");
    if (periodForm.endDate < periodForm.startDate) return toast("종료일은 시작일 이후여야 합니다.", "warning");
    // 새 기간은 사이드바에서 선택된 수련회 소유로, 수정은 그 기간이 원래 속한 수련회 소유로 저장
    const targetRetreatId = editingPeriodId ? editingPeriodRetreatId : retreat?.id;
    if (!targetRetreatId) return;
    setSavingPeriod(true);
    try {
      const data = {
        startDate: periodForm.startDate,
        endDate: periodForm.endDate,
        ...(periodForm.theme.trim() ? { theme: periodForm.theme.trim() } : {}),
        ...(periodForm.label.trim() ? { label: periodForm.label.trim() } : {}),
      };
      if (editingPeriodId) {
        await updateRetreatPeriod(targetRetreatId, editingPeriodId, data);
      } else {
        await saveRetreatPeriod(targetRetreatId, data);
      }
      setShowPeriodForm(false);
      setEditingPeriodId(null);
      setEditingPeriodRetreatId(null);
      // 달력을 시작일 월로 이동
      const d = parseYMD(periodForm.startDate);
      setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
    } catch {
      toast("저장 중 오류가 발생했습니다.", "error");
    } finally {
      setSavingPeriod(false);
    }
  }

  async function handleDeletePeriod(retreatId: string, id: string) {
    if (!await uiConfirm("이 수련회 기간을 삭제하시겠습니까?")) return;
    try {
      await deleteRetreatPeriod(retreatId, id);
    } catch { toast("삭제 중 오류가 발생했습니다.", "error"); }
  }

  async function handleAdd() {
    if (!formTitle.trim() || !selectedDate || saving) return;
    setSaving(true);
    try {
      const data: Parameters<typeof saveMilestone>[0] = { title: formTitle.trim(), targetDate: selectedDate, done: false };
      if (formNote.trim()) data.note = formNote.trim();
      await saveMilestone(data);
      setFormTitle(""); setFormNote("");
    } catch { toast("저장 중 오류가 발생했습니다.", "error"); }
    finally { setSaving(false); }
  }

  async function toggleDone(m: Milestone) {
    try {
      await updateMilestone(m.id, { done: !m.done });
    } catch { toast("저장 중 오류가 발생했습니다.", "error"); }
  }
  const [editSaving, setEditSaving] = useState(false);
  async function saveEdit() {
    if (!editingId || !editTitle.trim() || !editDate || editSaving) return;
    setEditSaving(true);
    try {
      await updateMilestone(editingId, {
        title: editTitle.trim(), targetDate: editDate,
        note: editNote.trim() || null,
      });
      setEditingId(null);
    } catch { toast("저장 중 오류가 발생했습니다.", "error"); }
    finally { setEditSaving(false); }
  }
  async function handleDeleteMilestone(id: string) {
    if (!await uiConfirm("이 일정을 삭제하시겠습니까?")) return;
    try {
      await deleteMilestone(id);
    } catch {
      toast("삭제 중 오류가 발생했습니다.", "error");
    }
  }

  const upcoming = milestones.filter(m => m.targetDate >= today && !m.done).slice(0, 6);

  // 가장 이른 수련회 기간 기준 D-Day
  const nextPeriod = periods.find(p => p.endDate >= today);
  const dDay = nextPeriod ? diffDays(nextPeriod.startDate) : null;

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      {/* 수련회 기간 목록 */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-500">수련회 기간</span>
          {retreat && (
            <button onClick={openAddPeriod}
              className="text-xs px-2.5 py-1 rounded-lg font-medium transition-colors"
              style={{ color: "var(--color-primary)", background: "var(--color-primary-glow)", border: "1px solid var(--color-primary-ring)" }}>
              ＋ 기간 추가
            </button>
          )}
        </div>

        {periods.length === 0 ? (
          <p className="text-xs text-slate-400">수련회 기간을 추가하면 모든 수련회·이가드와 공유되어 달력에 표시됩니다.</p>
        ) : (
          <div className="space-y-2">
            {periods.map((p, idx) => {
              const c = periodColor(idx);
              const d = diffDays(p.startDate);
              const ownerName = retreats.find(r => r.id === p.retreatId)?.name;
              return (
                <div key={p.id} className={`rounded-lg border p-3 ${c.bg} ${c.border}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {ownerName && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/70 text-slate-500 border border-slate-200">{ownerName}</span>
                        )}
                        {p.label && (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${c.dot} text-white`}>{p.label}</span>
                        )}
                        <span className={`text-sm font-semibold ${c.text}`}>
                          {p.startDate.replace(/-/g, "/")} ~ {p.endDate.slice(5).replace("-", "/")}
                        </span>
                        <span className={`text-xs ${c.text} opacity-70`}>{calcDuration(p.startDate, p.endDate)}</span>
                        {p.endDate >= today && (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full border ${c.border} ${c.text}`}>
                            {d === 0 ? "D-Day" : d > 0 ? `D-${d}` : `D+${Math.abs(d)}`}
                          </span>
                        )}
                      </div>
                      {p.theme && (
                        <p className={`text-xs mt-1 ${c.text} opacity-80`}>📌 {p.theme}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openEditPeriod(p)} className={`text-xs ${c.text} opacity-60 hover:opacity-100`}>수정</button>
                      <button onClick={() => handleDeletePeriod(p.retreatId, p.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 기간 추가/편집 폼 */}
        {showPeriodForm && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500 block mb-1">시작일</label>
                <input type="date" className="input text-sm" value={periodForm.startDate}
                  onChange={e => setPeriodForm(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">종료일</label>
                <input type="date" className="input text-sm" value={periodForm.endDate}
                  onChange={e => setPeriodForm(p => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>
            <input className="input text-sm" placeholder="주제 (예: 사랑하셔서 오시었네)"
              value={periodForm.theme}
              onChange={e => setPeriodForm(p => ({ ...p, theme: e.target.value }))} />
            <input className="input text-sm" placeholder="구분 레이블 (예: 1부, 2부 — 선택)"
              value={periodForm.label}
              onChange={e => setPeriodForm(p => ({ ...p, label: e.target.value }))} />
            <div className="flex gap-2 pt-1">
              <button onClick={handleSavePeriod} disabled={savingPeriod}
                className="btn-primary flex-1 justify-center text-sm">
                {savingPeriod ? "저장 중..." : editingPeriodId ? "수정 완료" : "추가"}
              </button>
              <button onClick={() => { setShowPeriodForm(false); setEditingPeriodId(null); }}
                className="btn-secondary text-sm">취소</button>
            </div>
          </div>
        )}
      </div>

      {/* 다가오는 준비 일정 */}
      {upcoming.length > 0 && (
        <div className="card p-4">
          <h3 className="text-xs font-bold text-slate-500 mb-2">
            다가오는 준비 일정
            {dDay !== null && dDay >= 0 && (
              <span className="ml-2 font-normal text-blue-500">수련회까지 D-{dDay}</span>
            )}
          </h3>
          <div className="space-y-1.5">
            {upcoming.map(m => {
              const c = getMilestoneColor(m);
              const d = diffDays(m.targetDate);
              return (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>{d >= 0 ? `D-${d}` : `D+${Math.abs(d)}`}</span>
                  <span className="text-slate-400 text-xs w-10 shrink-0">
                    {parseYMD(m.targetDate).getMonth()+1}/{parseYMD(m.targetDate).getDate()}
                  </span>
                  <span className="text-slate-700 text-xs font-medium truncate">{m.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 달력 */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
          <button onClick={prevMonth} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-base leading-none">‹</button>
          <div className="flex items-center gap-1.5">
            <select
              className="input text-sm font-semibold py-1 px-2 cursor-pointer"
              style={{ width: 90 }}
              value={calYear}
              onChange={e => setCalYear(Number(e.target.value))}
            >
              {Array.from({ length: 101 }, (_, i) => 2000 + i).map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <select
              className="input text-sm font-semibold py-1 px-2 cursor-pointer"
              style={{ width: 70 }}
              value={calMonth}
              onChange={e => setCalMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i).map(m => (
                <option key={m} value={m}>{m + 1}월</option>
              ))}
            </select>
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-base leading-none">›</button>
        </div>



        <div className="grid grid-cols-7 border-b border-slate-100">
          {WEEK_DAYS.map((d, i) => (
            <div key={d} className={`py-1.5 text-center text-[10px] font-semibold ${
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-400"
            }`}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return (
              <div key={`empty-${i}`} className="border-b border-r border-slate-100 h-[72px] bg-slate-50/20" />
            );

            const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const dayMilestones = milestonesByDate.get(dateStr) ?? [];
            const dayPeriods = periodsByDate.get(dateStr) ?? [];
            const isToday    = dateStr === today;
            const isPast     = dateStr < today;
            const dow        = i % 7;
            const isSelected = selectedDate === dateStr;

            // 첫 번째 기간 기준으로 배경색
            const primaryPeriod = dayPeriods[0];
            const primaryColor = primaryPeriod ? periodColor(primaryPeriod.idx) : null;

            return (
              <div
                key={dateStr}
                onClick={() => {
                  if (isSelected) { setSelectedDate(null); }
                  else { setSelectedDate(dateStr); setEditingId(null); }
                }}
                className={`border-b border-r border-slate-100 h-[72px] p-1 cursor-pointer transition-colors ${
                  isSelected      ? "bg-blue-50 ring-1 ring-inset ring-blue-300" :
                  primaryColor    ? primaryColor.rangeBg :
                  isToday         ? "bg-slate-50" :
                  isPast          ? "bg-slate-50/20" :
                  "hover:bg-slate-50"
                }`}
              >
                {/* 날짜 숫자 */}
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? "bg-blue-500 text-white" :
                    primaryColor && (primaryPeriod.isStart || primaryPeriod.isEnd) ? `${primaryColor.dot} text-white` :
                    isPast  ? "text-slate-400" :
                    dow === 0 ? "text-red-600" :
                    dow === 6 ? "text-blue-600" :
                    "text-slate-800"
                  }`}>{day}</span>
                </div>

                {/* 주제 (시작일에만 한 줄) */}
                {dayPeriods.filter(dp => dp.isStart && dp.period.theme).map(dp => {
                  const c = periodColor(dp.idx);
                  return (
                    <div key={dp.period.id} className={`text-[9px] px-1 py-0.5 rounded mb-0.5 truncate ${c.bg} ${c.text} ${c.border} border`}>
                      📌 {dp.period.theme}
                    </div>
                  );
                })}

                {/* 마일스톤 칩 */}
                <div className="space-y-0.5">
                  {dayMilestones.slice(0, 2).map(m => {
                    const c = getMilestoneColor(m);
                    return (
                      <div key={m.id} onClick={e => e.stopPropagation()}
                        className={`text-[9px] px-1 py-0.5 rounded border leading-tight flex items-center gap-0.5 ${c.bg} ${c.text} ${c.border}`}>
                        <span className={`w-1 h-1 rounded-full shrink-0 ${c.dot}`} />
                        <span className="truncate">{m.title}</span>
                      </div>
                    );
                  })}
                  {dayMilestones.length > 2 && (
                    <div className="text-[9px] text-slate-400">+{dayMilestones.length - 2}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 날짜 클릭 패널 */}
      {selectedDate && (
        <div className="card p-4 border-2 border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-slate-700 text-sm">
              {parseYMD(selectedDate).getMonth()+1}월 {parseYMD(selectedDate).getDate()}일 준비 일정
            </span>
            <button onClick={() => { setSelectedDate(null); setEditingId(null); setFormTitle(""); setFormNote(""); }}
              className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>

          {(milestonesByDate.get(selectedDate) ?? []).length > 0 && (
            <div className="space-y-1.5 mb-3">
              {(milestonesByDate.get(selectedDate) ?? []).map(m => {
                const c = getMilestoneColor(m);
                const isEditing = editingId === m.id;
                return (
                  <div key={m.id} className={`rounded-lg border p-2 ${c.bg} ${c.border}`}>
                    {isEditing ? (
                      <div className="space-y-2">
                        <input className="input text-sm" value={editTitle}
                          onChange={e => setEditTitle(e.target.value)} />
                        <div className="flex gap-2">
                          <input type="date" className="input text-sm flex-1" value={editDate}
                            onChange={e => setEditDate(e.target.value)} />
                          <input className="input text-sm flex-1" placeholder="메모"
                            value={editNote} onChange={e => setEditNote(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={editSaving} className="btn-primary btn-sm flex-1 justify-center text-xs">{editSaving ? "..." : "저장"}</button>
                          <button onClick={() => setEditingId(null)} className="btn-secondary btn-sm flex-1 justify-center text-xs">취소</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleDone(m)}
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                            m.done ? `${c.dot} border-transparent text-white` : "border-current"
                          }`}>
                          {m.done && <span className="text-[8px] font-bold">✓</span>}
                        </button>
                        <span className={`flex-1 text-xs font-medium ${c.text} ${m.done ? "line-through opacity-60" : ""}`}>
                          {m.title}
                          {m.note && <span className="ml-1 opacity-70">{m.note}</span>}
                        </span>
                        <button onClick={() => { setEditingId(m.id); setEditTitle(m.title); setEditDate(m.targetDate); setEditNote(m.note ?? ""); }}
                          className={`text-xs ${c.text} opacity-60 hover:opacity-100`}>수정</button>
                        <button onClick={() => handleDeleteMilestone(m.id)}
                          className="text-xs text-red-400 hover:text-red-600">삭제</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {PRESET_MILESTONES
                .filter(t => !(milestonesByDate.get(selectedDate) ?? []).some(m => m.title === t))
                .map(t => (
                  <button key={t} onClick={() => setFormTitle(t)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      formTitle === t ? "bg-slate-700 text-white border-slate-700"
                        : "bg-white text-slate-600 border-slate-300 hover:border-slate-500"
                    }`}>{t}</button>
                ))}
            </div>
            <input className="input text-sm" placeholder="직접 입력 (또는 위에서 선택)"
              value={formTitle} onChange={e => setFormTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()} />
            <div className="flex gap-2">
              <input className="input text-sm flex-1" placeholder="메모 (선택)"
                value={formNote} onChange={e => setFormNote(e.target.value)} />
              <button onClick={handleAdd} disabled={!formTitle.trim() || saving}
                className="btn-primary btn-sm whitespace-nowrap">
                {saving ? "..." : "＋ 추가"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
