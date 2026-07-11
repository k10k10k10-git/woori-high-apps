"use client";
import { useMemo, useState } from "react";
import { RetreatPeriod, Milestone, Retreat } from "@/lib/types";
import { saveMilestone, updateMilestone, deleteMilestone, type RetreatPeriodWithOwner } from "@/lib/db";
import { useUI } from "@/context/UIContext";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const PRESET_MILESTONES = [
  "신청 오픈", "신청 마감", "입금 마감", "조편성 완료", "방배정 완료",
  "단체티 주문 마감", "여행자 보험 등록 마감", "카풀 매칭 마감",
  "교사 참석 확인 마감", "최종 인원 확인", "수련회 용품 구매 완료",
];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function parse(s?: string): { y: number; m: number; d: number } | null {
  const x = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return x ? { y: +x[1], m: +x[2], d: +x[3] } : null;
}
function todayStr(): string { const d = new Date(); return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function diffDays(fromStr: string, toStr: string): number {
  const a = parse(fromStr)!, b = parse(toStr)!;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}
function dateLabel(dateStr: string): string {
  const p = parse(dateStr)!;
  return `${p.m}월 ${p.d}일`;
}

function milestoneColor(m: Milestone, today: string) {
  if (m.done) {
    return m.sourceSite === "move-guide"
      ? "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200"
      : "bg-sky-100 text-sky-700 border-sky-200";
  }
  const d = diffDays(today, m.targetDate);
  if (d <= 3) return "bg-red-100 text-red-700 border-red-200";
  if (d <= 7) return "bg-orange-100 text-orange-700 border-orange-200";
  if (d <= 13) return "bg-yellow-100 text-yellow-700 border-yellow-200";
  return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
}
function doneCheckClass(m: Milestone): string {
  if (!m.done) return "border-slate-700";
  return m.sourceSite === "move-guide"
    ? "bg-fuchsia-600 border-transparent text-white"
    : "bg-sky-500 border-transparent text-white";
}

const PERIOD_COLORS = [
  { bg: "bg-fuchsia-100", text: "text-fuchsia-800", border: "border-fuchsia-300", dot: "bg-fuchsia-600", rangeBg: "bg-fuchsia-50/70" },
  { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300", dot: "bg-slate-400", rangeBg: "bg-slate-50" },
  { bg: "bg-pink-100", text: "text-pink-800", border: "border-pink-300", dot: "bg-pink-500", rangeBg: "bg-pink-50" },
  { bg: "bg-violet-100", text: "text-violet-800", border: "border-violet-300", dot: "bg-violet-500", rangeBg: "bg-violet-50" },
  { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-300", dot: "bg-rose-500", rangeBg: "bg-rose-50" },
];
function periodColor(idx: number) { return PERIOD_COLORS[idx % PERIOD_COLORS.length]; }

export default function PrepCalendar({ periods, milestones, retreats }: {
  periods: RetreatPeriodWithOwner[];
  milestones: Milestone[];
  retreats?: Retreat[];
}) {
  const { toast, uiConfirm } = useUI();
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // 기본 표시 월: "오늘 이후" 가장 가까운 마일스톤/수련회 시작일 → 없으면 오늘.
  // (과거 첫 항목 기준이면 지난 겨울 달력(1월)이 떠서 매번 현재 달까지 넘겨야 했다 — 2026-07-12 수정)
  const initial = useMemo(() => {
    const upcoming = [
      ...milestones.map(ms => ms.targetDate),
      ...periods.map(p => p.startDate),
    ].filter(d => !!d && d >= today).sort()[0];
    const p = parse(upcoming || today) ?? parse(today)!;
    return { y: p.y, m: p.m };
  }, [milestones, periods, today]);
  const [ym, setYm] = useState(initial);

  // 날짜별 마일스톤
  const byDate = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    milestones.forEach(ms => { (map.get(ms.targetDate) ?? map.set(ms.targetDate, []).get(ms.targetDate)!).push(ms); });
    return map;
  }, [milestones]);

  function move(delta: number) {
    let { y, m } = ym; m += delta;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    setYm({ y, m });
  }

  // 그리드 셀 (앞 공백 + 일수)
  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m - 1, 1).getDay();
    const days = new Date(ym.y, ym.m, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < first; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [ym]);

  const periodsByDate = useMemo(() => {
    const map = new Map<string, { period: RetreatPeriod; idx: number; isStart: boolean; isEnd: boolean }[]>();
    periods.forEach((p, idx) => {
      let cur = p.startDate;
      while (cur <= p.endDate) {
        const list = map.get(cur) ?? [];
        list.push({ period: p, idx, isStart: cur === p.startDate, isEnd: cur === p.endDate });
        map.set(cur, list);
        const d = parse(cur)!;
        const next = new Date(d.y, d.m - 1, d.d + 1);
        cur = ymd(next.getFullYear(), next.getMonth() + 1, next.getDate());
      }
    });
    return map;
  }, [periods]);

  function ddayBadge(p: RetreatPeriod) {
    const dd = diffDays(today, p.startDate);
    if (dd > 0) return { text: `D-${dd}`, cls: "bg-fuchsia-100 text-fuchsia-700" };
    if (p.endDate >= today) return { text: "진행 중", cls: "bg-emerald-100 text-emerald-700" };
    return { text: "종료", cls: "bg-slate-100 text-slate-400" };
  }
  const nights = (p: RetreatPeriod) => { const n = diffDays(p.startDate, p.endDate); return n > 0 ? `${n}박 ${n + 1}일` : "당일"; };
  const selectedMilestones = selectedDate ? byDate.get(selectedDate) || [] : [];
  const upcoming = milestones.filter(m => m.targetDate >= today && !m.done).slice(0, 6);

  async function addMilestone() {
    if (!selectedDate || !title.trim() || saving) return;
    setSaving(true);
    try {
      await saveMilestone({
        title: title.trim(),
        targetDate: selectedDate,
        done: false,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setTitle("");
      setNote("");
      toast("준비 일정이 추가되었습니다.", "success");
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(m: Milestone) {
    try {
      await updateMilestone(m.id, { done: !m.done });
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim() || !editDate || editSaving) return;
    setEditSaving(true);
    try {
      await updateMilestone(editingId, {
        title: editTitle.trim(),
        targetDate: editDate,
        note: editNote.trim() || null,
      });
      setEditingId(null);
      toast("수정되었습니다.", "success");
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setEditSaving(false);
    }
  }

  async function removeMilestone(id: string) {
    if (!await uiConfirm("이 준비 일정을 삭제할까요?")) return;
    try {
      await deleteMilestone(id);
    } catch (e) {
      toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function closeSelected() {
    setSelectedDate(null);
    setEditingId(null);
    setTitle("");
    setNote("");
  }

  return (
    <div>
      {/* 수련회 기간 */}
      <div className="card p-4 mb-4">
        <div className="text-sm font-semibold text-slate-600 mb-3">수련회 기간</div>
        {periods.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 기간이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {periods.map(p => {
              const b = ddayBadge(p);
              const ownerName = retreats?.find(r => r.id === p.retreatId)?.name;
              return (
                <div key={p.id} className={`rounded-lg border p-3 ${b.text === "진행 중" ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {ownerName && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">{ownerName}</span>
                    )}
                    <span className="font-bold text-slate-800">{p.startDate} ~ {p.endDate?.slice(5)}</span>
                    <span className="text-xs text-slate-500">{nights(p)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${b.cls}`}>{b.text}</span>
                  </div>
                  {(p.theme || p.label) && <div className="text-sm text-slate-600 mt-1">📌 {p.label ? `[${p.label}] ` : ""}{p.theme}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="text-sm font-semibold text-slate-600 mb-3">다가오는 준비 일정</div>
          <div className="space-y-2">
            {upcoming.map(m => {
              const d = diffDays(today, m.targetDate);
              return (
                <button key={m.id} onClick={() => setSelectedDate(m.targetDate)}
                  className="w-full flex items-center gap-2 text-left text-sm">
                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${milestoneColor(m, today)}`}>
                    {d >= 0 ? `D-${d}` : `D+${Math.abs(d)}`}
                  </span>
                  <span className="text-xs text-slate-400 w-12 shrink-0">{m.targetDate.slice(5).replace("-", "/")}</span>
                  <span className="font-medium text-slate-700 truncate">{m.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 월 달력 그리드 */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
          <button onClick={() => move(-1)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-base leading-none">‹</button>
          <div className="flex items-center gap-1.5">
            <select
              className="input text-sm font-semibold py-1 px-2 cursor-pointer"
              style={{ width: 90 }}
              value={ym.y}
              onChange={e => setYm(prev => ({ ...prev, y: Number(e.target.value) }))}
            >
              {Array.from({ length: 101 }, (_, i) => 2000 + i).map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <select
              className="input text-sm font-semibold py-1 px-2 cursor-pointer"
              style={{ width: 70 }}
              value={ym.m}
              onChange={e => setYm(prev => ({ ...prev, m: Number(e.target.value) }))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>
          <button onClick={() => move(1)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-base leading-none">›</button>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-100">
          {WD.map((w, i) => (
            <div key={w} className={`py-1.5 text-center text-[10px] font-semibold ${
              i === 0 ? "text-red-500" : i === 6 ? "text-fuchsia-500" : "text-slate-400"
            }`}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (d === null) return <div key={`empty-${i}`} className="border-b border-r border-slate-100 h-[72px] bg-slate-50/20" />;
            const ds = ymd(ym.y, ym.m, d);
            const mss = byDate.get(ds) || [];
            const dayPeriods = periodsByDate.get(ds) ?? [];
            const dow = (i % 7);
            const selected = selectedDate === ds;
            const primaryPeriod = dayPeriods[0];
            const primaryColor = primaryPeriod ? periodColor(primaryPeriod.idx) : null;
            return (
              <button key={i} onClick={() => { setSelectedDate(selected ? null : ds); setEditingId(null); }}
                className={`block w-full border-b border-r border-slate-100 h-[72px] p-1 text-left cursor-pointer transition-colors ${
                  selected ? "bg-fuchsia-50 ring-1 ring-inset ring-fuchsia-300" :
                  primaryColor ? primaryColor.rangeBg :
                  ds === today ? "bg-slate-50" :
                  ds < today ? "bg-slate-50/20" :
                  "hover:bg-slate-50"
                }`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                    ds === today ? "bg-fuchsia-600 text-white" :
                    primaryColor && (primaryPeriod.isStart || primaryPeriod.isEnd) ? `${primaryColor.dot} text-white` :
                    ds < today ? "text-slate-400" :
                    dow === 0 ? "text-red-600" :
                    dow === 6 ? "text-fuchsia-600" :
                    "text-slate-800"
                  }`}>{d}</span>
                </div>

                {dayPeriods.filter(dp => dp.isStart && dp.period.theme).map(dp => {
                  const c = periodColor(dp.idx);
                  return (
                    <div key={dp.period.id} className={`text-[9px] px-1 py-0.5 rounded mb-0.5 truncate ${c.bg} ${c.text} ${c.border} border`}>
                      📌 {dp.period.theme}
                    </div>
                  );
                })}

                <div className="space-y-0.5">
                  {mss.slice(0, 2).map(m => (
                    <div key={m.id} className={`text-[9px] px-1 py-0.5 rounded border leading-tight flex items-center gap-0.5 ${milestoneColor(m, today)}`}>
                      <span className={`w-1 h-1 rounded-full shrink-0 ${m.done ? (m.sourceSite === "move-guide" ? "bg-fuchsia-500" : "bg-sky-500") : "bg-current"}`} />
                      <span className="truncate">{m.title}</span>
                    </div>
                  ))}
                  {mss.length > 2 && (
                    <div className="text-[9px] text-slate-400">+{mss.length - 2}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="card p-4 mt-4 border-2 border-fuchsia-200">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-slate-700 text-sm">{dateLabel(selectedDate)} 준비 일정</span>
            <button onClick={closeSelected} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>

          {selectedMilestones.length > 0 && (
            <div className="space-y-2 mb-4">
              {selectedMilestones.map(m => {
                const isEditing = editingId === m.id;
                return (
                  <div key={m.id} className={`rounded-lg border p-2 ${milestoneColor(m, today)}`}>
                    {isEditing ? (
                      <div className="space-y-2">
                        <input className="input text-sm" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" className="input text-sm" value={editDate} onChange={e => setEditDate(e.target.value)} />
                          <input className="input text-sm" placeholder="메모" value={editNote} onChange={e => setEditNote(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={editSaving} className="btn-primary btn-sm flex-1 justify-center text-xs">{editSaving ? "저장 중..." : "저장"}</button>
                          <button onClick={() => setEditingId(null)} className="btn-secondary btn-sm flex-1 justify-center text-xs">취소</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleDone(m)}
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${doneCheckClass(m)}`}>
                          {m.done && <span className="text-[8px] font-bold">✓</span>}
                        </button>
                        <span className={`flex-1 min-w-0 text-xs font-medium ${m.done ? "line-through opacity-60" : ""}`}>
                          {m.title}{m.note && <span className="ml-1 opacity-70">{m.note}</span>}
                        </span>
                        <button onClick={() => { setEditingId(m.id); setEditTitle(m.title); setEditDate(m.targetDate); setEditNote(m.note ?? ""); }}
                          className="text-xs opacity-60 hover:opacity-100">수정</button>
                        <button onClick={() => removeMilestone(m.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
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
                .filter(t => !selectedMilestones.some(m => m.title === t))
                .map(t => (
                  <button key={t} onClick={() => setTitle(t)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      title === t ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-600 border-slate-300 hover:border-slate-500"
                    }`}>{t}</button>
                ))}
            </div>
            <input className="input text-sm" placeholder="직접 입력 (또는 위에서 선택)" value={title}
              onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && addMilestone()} />
            <div className="flex gap-2">
              <input className="input text-sm flex-1" placeholder="메모 (선택)" value={note} onChange={e => setNote(e.target.value)} />
              <button onClick={addMilestone} disabled={!title.trim() || saving} className="btn-primary btn-sm whitespace-nowrap">
                {saving ? "저장 중..." : "＋ 추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
