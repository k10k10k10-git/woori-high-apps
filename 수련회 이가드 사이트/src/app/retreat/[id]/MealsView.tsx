"use client";
import { useMemo, useState } from "react";
import { Group, IguardMeal, IguardMealEntry, IguardSeating } from "@/lib/types";
import { saveIguardMeal, updateIguardMeal, deleteIguardMeal } from "@/lib/db";
import { useUI } from "@/context/UIContext";
import { groupDisplayName } from "@/lib/groupNumber";
import FairAssignButton from "./FairAssignButton";

const groupSort = (a: Group, b: Group) => a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko", { numeric: true });
const SLOT_LABELS = ["아침", "점심", "저녁", "야식"] as const;
const EMPTY = { label: "", day: 1, slot: 1, weight: 1 };
const WEIGHT_PRESETS = [
  { label: "기본", value: 1 },
  { label: "저녁 중요", value: 1.5 },
  { label: "매우 중요", value: 2 },
];

export default function MealsView({ retreatId, meals, groups, seatings }: { retreatId: string; meals: IguardMeal[]; groups: Group[]; seatings: IguardSeating[] }) {
  const { toast, uiConfirm } = useUI();
  const sortedGroups = useMemo(() => [...groups].sort(groupSort), [groups]);
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{ label: string; day: number; slot: number; weight: number }>(EMPTY);

  function orderedFor(meal: IguardMeal) {
    const map = new Map((meal.entries || []).map(e => [e.groupId, e]));
    const present = sortedGroups.filter(g => map.has(g.id)).sort((a, b) => map.get(a.id)!.seq - map.get(b.id)!.seq);
    const absent = sortedGroups.filter(g => !map.has(g.id));
    return [...present, ...absent].map(g => ({ group: g }));
  }
  async function persist(meal: IguardMeal, ordered: { group: Group }[]) {
    const entries: IguardMealEntry[] = ordered.map((o, i) => ({ groupId: o.group.id, seq: i }));
    try { await updateIguardMeal(retreatId, meal.id, { entries }); } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  function move(meal: IguardMeal, i: number, dir: -1 | 1) {
    const o = orderedFor(meal); const j = i + dir; if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]]; persist(meal, o);
  }
  async function saveMeal() {
    if (!form.label.trim()) return toast("식사 이름을 입력해주세요.", "warning");
    const payload = { ...form, weight: form.weight > 0 ? form.weight : null };
    try {
      if (editId) await updateIguardMeal(retreatId, editId, payload);
      else await saveIguardMeal(retreatId, { ...payload, entries: [] });
      setShow(false); setEditId(null); setForm(EMPTY);
    } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function delMeal(m: IguardMeal) {
    if (!await uiConfirm(`"${m.label}" 식사 세션을 삭제할까요?`)) return;
    try { await deleteIguardMeal(retreatId, m.id); } catch (e) { toast(`삭제 오류: ${e}`, "error"); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-500">식사 세션 <strong className="text-slate-800">{meals.length}</strong></span>
        <div className="flex gap-2">
          <FairAssignButton retreatId={retreatId} groups={groups} meals={meals} seatings={seatings} />
          <button onClick={() => { setForm(EMPTY); setEditId(null); setShow(true); }} className="btn-primary">＋ 식사 세션 추가</button>
        </div>
      </div>

      {show && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 modal-backdrop">
          <div className="card p-6 w-full max-w-md modal-card">
            <h3 className="font-bold text-lg mb-4">{editId ? "식사 세션 수정" : "식사 세션 추가"}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium text-slate-600 block mb-1">일자</label>
                  <select className="input" value={form.day} onChange={e => setForm(p => ({ ...p, day: parseInt(e.target.value) }))}>{[1, 2, 3].map(d => <option key={d} value={d}>{d}일차</option>)}</select></div>
                <div><label className="text-sm font-medium text-slate-600 block mb-1">끼니</label>
                  <select className="input" value={form.slot} onChange={e => { const slot = parseInt(e.target.value); setForm(p => ({ ...p, slot, label: p.label || `${p.day}일차 ${SLOT_LABELS[slot]}`, weight: p.weight === 1 && slot === 2 ? 1.5 : p.weight })); }}>{SLOT_LABELS.map((s, i) => <option key={s} value={i}>{s}</option>)}</select></div>
              </div>
              <div><label className="text-sm font-medium text-slate-600 block mb-1">표시 이름</label>
                <input className="input" placeholder="예: 토요일 점심" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} /></div>
              <div><label className="text-sm font-medium text-slate-600 block mb-1">앞순서 효용 가중치</label>
                <input className="input" type="number" min={0.1} step={0.1} value={form.weight} onChange={e => setForm(p => ({ ...p, weight: Number(e.target.value) || 1 }))} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {WEIGHT_PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, weight: preset.value }))}
                      className={`rounded-full border px-2.5 py-1 text-xs ${form.weight === preset.value ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700" : "border-slate-200 bg-white text-slate-500"}`}
                    >
                      {preset.label} {preset.value}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">저녁처럼 앞순서 체감 효용이 큰 끼니는 값을 높이면 공정배정 점수에 더 크게 반영됩니다.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={saveMeal} className="btn-primary flex-1 justify-center">저장</button>
              <button onClick={() => { setShow(false); setEditId(null); }} className="btn-secondary flex-1 justify-center">취소</button></div>
          </div>
        </div>
      )}

      {meals.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🍚</div><p>식사 세션이 없습니다.</p></div>
      ) : (
        <div className="space-y-4">
          {meals.map(meal => {
            const ordered = orderedFor(meal);
            return (
              <div key={meal.id} className="card overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-700 flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-600">{meal.day}일차 {SLOT_LABELS[meal.slot]}</span>
                    <span>{meal.label}</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500">앞순서 효용 {meal.weight ?? 1}</span>
                  </h3>
                  <div className="flex gap-2"><button onClick={() => { setForm({ label: meal.label, day: meal.day, slot: meal.slot, weight: meal.weight ?? 1 }); setEditId(meal.id); setShow(true); }} className="text-xs text-slate-400 hover:text-fuchsia-600">수정</button>
                    <button onClick={() => delMeal(meal)} className="text-xs text-slate-300 hover:text-red-400">삭제</button></div>
                </div>
                {ordered.length === 0 ? <div className="p-6 text-center text-slate-300 text-xs">조편성 데이터가 없습니다.</div> : (
                  <table className="w-full text-sm">
                    <thead><tr className="table-header"><th className="px-3 py-2 text-center w-12">순서</th><th className="px-3 py-2 text-left">조</th><th className="px-3 py-2 text-center w-16">인원</th><th className="px-3 py-2 text-center w-20">이동</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {ordered.map((o, i) => (
                        <tr key={o.group.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-center font-semibold text-slate-500">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-800"><span className="px-1.5 py-0.5 mr-1.5 rounded text-xs bg-slate-100 text-slate-500">{o.group.bu}</span>{groupDisplayName(o.group, groups)}</td>
                          <td className="px-3 py-2 text-center text-xs text-slate-500">{o.group.studentIds?.length || 0}명</td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <button onClick={() => move(meal, i, -1)} disabled={i === 0} className="px-1.5 text-slate-400 hover:text-fuchsia-600 disabled:opacity-20">▲</button>
                            <button onClick={() => move(meal, i, 1)} disabled={i === ordered.length - 1} className="px-1.5 text-slate-400 hover:text-fuchsia-600 disabled:opacity-20">▼</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
