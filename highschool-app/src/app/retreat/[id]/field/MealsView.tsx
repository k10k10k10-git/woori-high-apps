"use client";
import { useState } from "react";
import OverlayShell from "@/components/OverlayShell";
import { Group, IguardMeal, IguardMealEntry, IguardSeating } from "@/features/iguard/lib/types";
import { saveIguardMeal, updateIguardMeal, deleteIguardMeal } from "@/features/iguard/lib/db";
import { useUI } from "@/context/UIContext";
import { buildMealOrderItems, type MealOrderItem } from "@/features/iguard/lib/mealOrder";
import FairAssignButton from "./FairAssignButton";

const SLOT_LABELS = ["아침", "점심", "저녁", "야식"] as const;
const EMPTY = { label: "", day: 1, slot: 1 };
type PinnedInputs = Record<string, string>;

export default function MealsView({ retreatId, meals, groups, seatings }: { retreatId: string; meals: IguardMeal[]; groups: Group[]; seatings: IguardSeating[] }) {
  const { toast, uiConfirm } = useUI();
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{ label: string; day: number; slot: number }>(EMPTY);
  const [pinnedInputs, setPinnedInputs] = useState<PinnedInputs>({});

  async function savePinnedFront(meal: IguardMeal, value: string) {
    try { await updateIguardMeal(retreatId, meal.id, { pinnedFront: value.trim() || null }); }
    catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }

  function orderedFor(meal: IguardMeal) {
    return buildMealOrderItems(meal, groups);
  }
  async function persist(meal: IguardMeal, ordered: MealOrderItem[]) {
    const entries: IguardMealEntry[] = ordered.map((o, i) => ({ groupId: o.group.id, seq: i }));
    try { await updateIguardMeal(retreatId, meal.id, { entries }); } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  function move(meal: IguardMeal, i: number, dir: -1 | 1) {
    const o = orderedFor(meal); const j = i + dir; if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]]; persist(meal, o);
  }
  async function saveMeal() {
    if (!form.label.trim()) return toast("식사 이름을 입력해주세요.", "warning");
    const payload = { ...form };
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
        <OverlayShell
          label={editId ? "식사 세션 수정" : "식사 세션 추가"}
          onClose={() => { setShow(false); setEditId(null); }}
          panelClassName="w-full max-w-md"
        >
          <div className="max-h-[85dvh] overflow-y-auto p-6">
            <h3 className="font-bold text-lg mb-4">{editId ? "식사 세션 수정" : "식사 세션 추가"}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium text-slate-600 block mb-1">일자</label>
                  <select className="input" value={form.day} onChange={e => setForm(p => ({ ...p, day: parseInt(e.target.value) }))}>{[1, 2, 3].map(d => <option key={d} value={d}>{d}일차</option>)}</select></div>
                <div><label className="text-sm font-medium text-slate-600 block mb-1">끼니</label>
                  <select className="input" value={form.slot} onChange={e => { const slot = parseInt(e.target.value); setForm(p => ({ ...p, slot, label: p.label || `${p.day}일차 ${SLOT_LABELS[slot]}` })); }}>{SLOT_LABELS.map((s, i) => <option key={s} value={i}>{s}</option>)}</select></div>
              </div>
              <div><label className="text-sm font-medium text-slate-600 block mb-1">표시 이름</label>
                <input className="input" placeholder="예: 토요일 점심" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={saveMeal} className="btn-primary flex-1 justify-center">저장</button>
              <button onClick={() => { setShow(false); setEditId(null); }} className="btn-secondary flex-1 justify-center">취소</button></div>
          </div>
        </OverlayShell>
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
                  </h3>
                  <div className="flex gap-2"><button onClick={() => { setForm({ label: meal.label, day: meal.day, slot: meal.slot }); setEditId(meal.id); setShow(true); }} className="text-xs text-slate-400 hover:text-emerald-600">수정</button>
                    <button onClick={() => delMeal(meal)} className="text-xs text-slate-300 hover:text-red-400">삭제</button></div>
                </div>
                <div className="px-4 py-2.5 bg-white border-b border-slate-100 flex items-center gap-2">
                  <label className="text-xs text-slate-400 whitespace-nowrap">맨앞 고정 조</label>
                  <input
                    className="input flex-1 text-xs py-1"
                    placeholder="예: 1조 또는 1조, 3조 (이 끼니만 자동배정 시 맨 앞으로)"
                    value={pinnedInputs[meal.id] ?? meal.pinnedFront ?? ""}
                    onChange={e => setPinnedInputs(p => ({ ...p, [meal.id]: e.target.value }))}
                    onBlur={e => savePinnedFront(meal, e.target.value)}
                  />
                </div>
                {ordered.length === 0 ? <div className="p-6 text-center text-slate-300 text-xs">조편성 데이터가 없습니다. 행정 사이트에서 조편성이 완료되면 자동으로 나타납니다.</div> : (
                  <div className="p-4">
                    <p className="mb-2 text-xs font-medium text-slate-400">순번 카드 전체를 한 화면에 표시합니다. 카드 안 화살표로 순서를 조정하세요.</p>
                    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 xl:grid-cols-11" aria-label={`${meal.label} 조별 식사 순서`}>
                        {ordered.map((item, i) => (
                          <li key={item.group.id} className="min-w-0">
                            <div className="flex min-h-[6.5rem] h-full flex-col justify-between rounded-lg border border-amber-200 bg-amber-50 px-1.5 py-2 text-center">
                              <div className="text-[10px] font-semibold text-amber-500">{item.order}번째</div>
                              <div className="mt-0.5 text-base font-extrabold text-slate-800">{item.label}</div>
                              <div className="text-[10px] text-slate-400">{item.group.bu} · {item.people}명</div>
                              <div className="mt-1 flex justify-center gap-1 border-t border-amber-100 pt-1">
                                <button
                                  onClick={() => move(meal, i, -1)}
                                  disabled={i === 0}
                                  className="rounded px-1.5 text-xs text-slate-400 hover:bg-white hover:text-emerald-600 disabled:opacity-20"
                                  aria-label={`${item.label}을 한 순서 앞으로 이동`}
                                >◀</button>
                                <button
                                  onClick={() => move(meal, i, 1)}
                                  disabled={i === ordered.length - 1}
                                  className="rounded px-1.5 text-xs text-slate-400 hover:bg-white hover:text-emerald-600 disabled:opacity-20"
                                  aria-label={`${item.label}을 한 순서 뒤로 이동`}
                                >▶</button>
                              </div>
                            </div>
                          </li>
                        ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
