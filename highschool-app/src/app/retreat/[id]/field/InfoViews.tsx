"use client";
import { useState } from "react";
import { Milestone } from "@/features/iguard/lib/types";
import { saveIguardGuide, saveMilestone, updateMilestone, deleteMilestone } from "@/features/iguard/lib/db";
import { useUI } from "@/context/UIContext";
import { todayStr } from "@/features/iguard/lib/scheduleTime";

function todoCheckClass(t: Milestone): string {
  if (!t.done) return "border-slate-300 text-transparent";
  return t.sourceSite === "move-guide"
    ? "bg-fuchsia-600 border-fuchsia-600 text-white"
    : "bg-sky-500 border-sky-500 text-white";
}

// ── 조스탭 가이드 (편집 가능 안내문) ────────────────────────
export function GuideView({ retreatId, guide }: { retreatId: string; guide: string[] }) {
  const { toast, uiConfirm } = useUI();
  const [adding, setAdding] = useState("");
  async function save(items: string[]) {
    try { await saveIguardGuide(retreatId, items); } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function add() { if (!adding.trim()) return; await save([...guide, adding.trim()]); setAdding(""); }
  async function del(i: number) { if (!await uiConfirm("이 항목을 삭제할까요?")) return; await save(guide.filter((_, idx) => idx !== i)); }

  return (
    <div>
      <div className="mb-4 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-700">ℹ️ 조스탭이 숙지할 행동 수칙. 현장에서 폰으로 빠르게 확인합니다.</div>
      <div className="card divide-y divide-slate-100">
        {guide.map((g, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <p className="text-sm text-slate-700 flex-1">{g}</p>
            <button onClick={() => del(i)} className="text-xs text-slate-300 hover:text-red-400">삭제</button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="input min-w-0 flex-1" placeholder="수칙 추가" value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <button onClick={add} className="btn-secondary min-h-11 min-w-[96px] whitespace-nowrap px-4 text-sm">＋ 추가</button>
      </div>
    </div>
  );
}

// ── 준비 할 일(행정 사이트 준비 일정과 공유) ─────────────────
export function TodosView({ todos }: { todos: Milestone[] }) {
  const { toast, uiConfirm } = useUI();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(todayStr());
  const [note, setNote] = useState("");
  const done = todos.filter(t => t.done).length;
  const sorted = [...todos].sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.title.localeCompare(b.title, "ko"));

  async function add() {
    if (!title.trim() || !due) return;
    try {
      await saveMilestone({
        title: title.trim(),
        targetDate: due,
        done: false,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setTitle("");
      setNote("");
    }
    catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function del(t: Milestone) { if (!await uiConfirm("삭제할까요?")) return; await deleteMilestone(t.id); }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-500">완료 <strong className="text-fuchsia-700">{done}</strong> / {todos.length}</span>
        <span className="text-xs text-slate-400">행정 사이트 준비 일정과 실시간 공유</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[160px_1fr_auto] mb-2">
        <input type="date" className="input" value={due} onChange={e => setDue(e.target.value)} />
        <input className="input" placeholder="준비 항목 추가 (예: 무전기·인이어 충전)" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <button onClick={add} className="btn-primary whitespace-nowrap">＋ 추가</button>
      </div>
      <div className="mb-4">
        <input className="input" placeholder="메모 (선택)" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
      </div>
      {todos.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">📝</div><p>준비 항목이 없습니다.</p></div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {sorted.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => updateMilestone(t.id, { done: !t.done })}
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm shrink-0 ${todoCheckClass(t)}`}>✓</button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${t.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</div>
                <div className="text-xs text-slate-400">{t.targetDate}{t.note ? ` · ${t.note}` : ""}</div>
              </div>
              <button onClick={() => del(t)} className="text-xs text-slate-300 hover:text-red-400">삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
