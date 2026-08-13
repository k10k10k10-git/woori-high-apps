"use client";
import { useEffect, useState } from "react";
import { Retreat, SupplyItem, SnackItem } from "@/lib/types";
import {
  subscribeToSupplies, saveSupply, updateSupply, deleteSupply,
  subscribeToSnacks, saveSnack, updateSnack, deleteSnack,
  subscribeToSuppliesBudget, updateSuppliesBudget,
} from "@/lib/db";
import { useUI } from "@/context/UIContext";

interface Props { retreat: Retreat; }

const SNACK_CATEGORIES = ["첫째날 야식", "둘째날 야식", "스탭 간식", "GBS 간식"] as const;

const EMPTY_SUPPLY: Omit<SupplyItem, "id"> = { name: "", actualQty: "", buyQty: "", price: 0, link: "", note: "" };
const EMPTY_SNACK: Omit<SnackItem, "id"> = { category: "첫째날 야식", name: "", qty: "", unitPrice: 0, price: 0, link: "", note: "" };

// 수량 문자열("80개", "12세트", "1,200개")에서 숫자 부분 추출
function parseQtyNumber(qty: string): number {
  const m = qty.replace(/,/g, "").match(/\d+/);
  return m ? parseInt(m[0]) : 0;
}

export default function SuppliesTab({ retreat }: Props) {
  const { toast, uiConfirm } = useUI();
  const [innerTab, setInnerTab] = useState<"물품" | "간식">("물품");

  // 물품
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [supplyLoading, setSupplyLoading] = useState(true);
  const [supplyError, setSupplyError] = useState<string | null>(null);
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [editSupplyId, setEditSupplyId] = useState<string | null>(null);
  const [supplyForm, setSupplyForm] = useState<Omit<SupplyItem, "id">>(EMPTY_SUPPLY);

  // 간식
  const [snacks, setSnacks] = useState<SnackItem[]>([]);
  const [snackLoading, setSnackLoading] = useState(true);
  const [snackError, setSnackError] = useState<string | null>(null);
  const [showSnackModal, setShowSnackModal] = useState(false);
  const [editSnackId, setEditSnackId] = useState<string | null>(null);
  const [snackForm, setSnackForm] = useState<Omit<SnackItem, "id">>(EMPTY_SNACK);

  // 예산
  const [supplyBudget, setSupplyBudget] = useState<number>(0);
  const [snackBudgets, setSnackBudgets] = useState<Record<string, number>>({});
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [supplyBudgetInput, setSupplyBudgetInput] = useState("");
  const [snackBudgetInputs, setSnackBudgetInputs] = useState<Record<string, string>>({});
  // 예산 항목별 "인당 단가 × 총원" 계산기 입력값 (key: "물품" 또는 간식 카테고리명) — DB에 저장하지 않는 보조 입력
  const [budgetCalc, setBudgetCalc] = useState<Record<string, { unitPrice: string; headcount: string }>>({});

  useEffect(() => {
    const unsubSupplies = subscribeToSupplies(retreat.id, (next) => {
      setSupplies(next);
      setSupplyLoading(false);
    }, (error) => { setSupplyError(error.message); setSupplyLoading(false); });
    const unsubSnacks = subscribeToSnacks(retreat.id, (next) => {
      setSnacks(next);
      setSnackLoading(false);
    }, (error) => { setSnackError(error.message); setSnackLoading(false); });
    const unsubBudget = subscribeToSuppliesBudget(retreat.id, (b) => {
      const sBudget = b?.supplyBudget || 0;
      const cBudgets = b?.snackBudgets || {};
      setSupplyBudget(sBudget);
      setSnackBudgets(cBudgets);
      setSupplyBudgetInput(sBudget > 0 ? String(sBudget) : "");
      setSnackBudgetInputs(Object.fromEntries(SNACK_CATEGORIES.map(c => [c, cBudgets[c] > 0 ? String(cBudgets[c]) : ""])));
    }, (error) => setSupplyError((previous) => previous ?? error.message));
    return () => { unsubSupplies(); unsubSnacks(); unsubBudget(); };
  }, [retreat.id]);

  // ─── 물품 CRUD ───────────────────────────────────────────

  async function handleSaveSupply() {
    if (!supplyForm.name.trim()) return toast("물품명을 입력해주세요.", "warning");
    try {
      if (editSupplyId) {
        await updateSupply(retreat.id, editSupplyId, supplyForm);
      } else {
        await saveSupply(retreat.id, supplyForm);
      }
      setSupplyForm(EMPTY_SUPPLY);
      setShowSupplyModal(false);
      setEditSupplyId(null);
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleDeleteSupply(id: string) {
    if (!await uiConfirm("삭제하시겠습니까?")) return;
    try {
      await deleteSupply(retreat.id, id);
    } catch (e) {
      toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function startEditSupply(s: SupplyItem) {
    setSupplyForm({ name: s.name, actualQty: s.actualQty || "", buyQty: s.buyQty || "",
      price: s.price || 0, link: s.link || "", note: s.note || "" });
    setEditSupplyId(s.id);
    setShowSupplyModal(true);
  }

  // ─── 간식 CRUD ───────────────────────────────────────────

  async function handleSaveSnack() {
    if (!snackForm.name.trim()) return toast("품목명을 입력해주세요.", "warning");
    try {
      if (editSnackId) {
        await updateSnack(retreat.id, editSnackId, snackForm);
      } else {
        await saveSnack(retreat.id, snackForm);
      }
      setSnackForm(EMPTY_SNACK);
      setShowSnackModal(false);
      setEditSnackId(null);
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleDeleteSnack(id: string) {
    if (!await uiConfirm("삭제하시겠습니까?")) return;
    try {
      await deleteSnack(retreat.id, id);
    } catch (e) {
      toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function startEditSnack(s: SnackItem) {
    setSnackForm({ category: s.category, name: s.name, qty: s.qty || "",
      unitPrice: s.unitPrice || 0, price: s.price || 0, link: s.link || "", note: s.note || "" });
    setEditSnackId(s.id);
    setShowSnackModal(true);
  }

  // 수량/단가 변경 시 금액 자동 계산 (단가가 있을 때만 — 없으면 금액 직접 입력 유지)
  function applySnackAutoPrice(next: Omit<SnackItem, "id">): Omit<SnackItem, "id"> {
    const unit = next.unitPrice || 0;
    if (unit > 0) {
      const n = parseQtyNumber(next.qty || "");
      if (n > 0) return { ...next, price: n * unit };
    }
    return next;
  }

  // ─── 합계 계산 ───────────────────────────────────────────

  const supplyTotal = supplies.reduce((acc, s) => acc + (s.price || 0), 0);
  const snackTotal = snacks.reduce((acc, s) => acc + (s.price || 0), 0);
  const snackBudgetTotal = SNACK_CATEGORIES.reduce((acc, c) => acc + (snackBudgets[c] || 0), 0);

  const formatPrice = (p: number) => p > 0 ? `${p.toLocaleString()}원` : "-";

  async function handleSaveBudget() {
    const newSupplyBudget = parseInt(supplyBudgetInput.replace(/,/g, "")) || 0;
    const newSnackBudgets: Record<string, number> = {};
    for (const c of SNACK_CATEGORIES) {
      newSnackBudgets[c] = parseInt((snackBudgetInputs[c] || "").replace(/,/g, "")) || 0;
    }
    try {
      await updateSuppliesBudget(retreat.id, { supplyBudget: newSupplyBudget, snackBudgets: newSnackBudgets });
      setSupplyBudget(newSupplyBudget);
      setSnackBudgets(newSnackBudgets);
      setShowBudgetEdit(false);
      toast("예산이 저장되었습니다.", "success");
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  // 단가×총원 입력이 둘 다 있으면 해당 예산 입력칸에 자동으로 채워 넣는다.
  function applyBudgetCalc(key: string, next: { unitPrice: string; headcount: string }, setAmount: (v: string) => void) {
    setBudgetCalc(p => ({ ...p, [key]: next }));
    const unit = parseInt(next.unitPrice.replace(/,/g, "")) || 0;
    const head = parseInt(next.headcount.replace(/,/g, "")) || 0;
    if (unit > 0 && head > 0) setAmount(String(unit * head));
  }

  function renderBudgetCalcRow(key: string, setAmount: (v: string) => void) {
    const calc = budgetCalc[key] || { unitPrice: "", headcount: "" };
    const unit = parseInt(calc.unitPrice.replace(/,/g, "")) || 0;
    const head = parseInt(calc.headcount.replace(/,/g, "")) || 0;
    return (
      <div className="grid grid-cols-2 gap-2 mt-1.5">
        <input className="input text-xs py-1.5" type="number" placeholder="인당 단가 (원)"
          value={calc.unitPrice}
          onChange={e => applyBudgetCalc(key, { ...calc, unitPrice: e.target.value }, setAmount)} />
        <input className="input text-xs py-1.5" type="number" placeholder="총원 (명)"
          value={calc.headcount}
          onChange={e => applyBudgetCalc(key, { ...calc, headcount: e.target.value }, setAmount)} />
        {unit > 0 && head > 0 && (
          <p className="col-span-2 text-xs text-blue-600">
            자동 계산: {unit.toLocaleString()}원 × {head.toLocaleString()}명 = {(unit * head).toLocaleString()}원
          </p>
        )}
      </div>
    );
  }

  function renderBudgetBlock(label: string, budget: number, used: number) {
    const remaining = budget - used;
    const pct = budget > 0 ? Math.min((used / budget) * 100, 100) : 0;
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-slate-600">{label}</span>
          {budget > 0 && (
            <span className={`text-xs ${remaining >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {remaining >= 0 ? `잔여 ${remaining.toLocaleString()}원` : `초과 ${Math.abs(remaining).toLocaleString()}원`}
            </span>
          )}
        </div>
        <p className="text-sm mb-1.5">
          <span className={`font-bold ${budget > 0 && used > budget ? "text-red-500" : "text-blue-600"}`}>
            {used.toLocaleString()}원
          </span>
          {budget > 0 && <span className="text-slate-400"> / {budget.toLocaleString()}원</span>}
        </p>
        {budget > 0 ? (
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${used > budget ? "bg-red-400" : "bg-blue-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : (
          <p className="text-xs text-slate-400">예산 미설정</p>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* 예산 카드 */}
      <div className="card p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-slate-700">예산 현황</span>
          <button onClick={() => setShowBudgetEdit(true)} className="text-xs text-slate-400 hover:text-blue-500">예산 설정</button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {renderBudgetBlock("물품 (행정물품 비용)", supplyBudget, supplyTotal)}
          {renderBudgetBlock("간식 (야식/GBS 등)", snackBudgetTotal, snackTotal)}
        </div>
      </div>

      {/* 예산 설정 Modal */}
      {showBudgetEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">예산 설정</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">물품 예산 (행정물품 비용)</label>
                <input type="number" className="input" placeholder="예산 입력 (원) — 또는 아래에서 단가×총원으로 계산"
                  value={supplyBudgetInput} onChange={e => setSupplyBudgetInput(e.target.value)} />
                {renderBudgetCalcRow("물품", setSupplyBudgetInput)}
              </div>
              {SNACK_CATEGORIES.map(c => (
                <div key={c} className="pt-2 border-t border-slate-100">
                  <label className="text-xs text-slate-500 mb-1 block">{c} 예산</label>
                  <input type="number" className="input" placeholder="예산 입력 (원) — 또는 아래에서 단가×총원으로 계산"
                    value={snackBudgetInputs[c] || ""}
                    onChange={e => setSnackBudgetInputs(p => ({ ...p, [c]: e.target.value }))} />
                  {renderBudgetCalcRow(c, v => setSnackBudgetInputs(p => ({ ...p, [c]: v })))}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => void handleSaveBudget()} className="btn-primary flex-1 justify-center">저장</button>
              <button onClick={() => setShowBudgetEdit(false)} className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* Inner Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
        {(["물품", "간식"] as const).map(t => (
          <button key={t} onClick={() => setInnerTab(t)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              innerTab === t ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
            }`}>{t === "물품" ? "🛒 물품 리스트" : "🍜 간식"}</button>
        ))}
      </div>

      {/* ─── 물품 탭 ─────────────────────────────────── */}
      {innerTab === "물품" && (
        <div>
          {supplyError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              ⚠ 로드 오류: {supplyError}
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">등록 물품 <strong className="text-slate-800">{supplies.length}</strong></span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">합계 <strong className="text-blue-600">{supplyTotal.toLocaleString()}원</strong></span>
            </div>
            <button onClick={() => { setSupplyForm(EMPTY_SUPPLY); setEditSupplyId(null); setShowSupplyModal(true); }}
              className="btn-primary">＋ 물품 추가</button>
          </div>

          {/* 물품 Modal */}
          {showSupplyModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h3 className="font-bold text-lg mb-4">{editSupplyId ? "물품 수정" : "물품 추가"}</h3>
                <div className="space-y-3">
                  <input className="input" placeholder="물품명 *" value={supplyForm.name}
                    onChange={e => setSupplyForm(p => ({ ...p, name: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <input className="input" placeholder="실수량 (예: 500개)" value={supplyForm.actualQty}
                      onChange={e => setSupplyForm(p => ({ ...p, actualQty: e.target.value }))} />
                    <input className="input" placeholder="구매수량 (예: 20개)" value={supplyForm.buyQty}
                      onChange={e => setSupplyForm(p => ({ ...p, buyQty: e.target.value }))} />
                  </div>
                  <input className="input" type="number" placeholder="금액 (원)" value={supplyForm.price || ""}
                    onChange={e => setSupplyForm(p => ({ ...p, price: parseInt(e.target.value) || 0 }))} />
                  <input className="input" placeholder="구매링크 (URL)" value={supplyForm.link}
                    onChange={e => setSupplyForm(p => ({ ...p, link: e.target.value }))} />
                  <input className="input" placeholder="비고" value={supplyForm.note}
                    onChange={e => setSupplyForm(p => ({ ...p, note: e.target.value }))} />
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={handleSaveSupply} className="btn-primary flex-1 justify-center">저장</button>
                  <button onClick={() => { setShowSupplyModal(false); setEditSupplyId(null); }}
                    className="btn-secondary flex-1 justify-center">취소</button>
                </div>
              </div>
            </div>
          )}

          {/* 물품 테이블 */}
          <div className="card overflow-x-auto">
            {supplyLoading ? (
              <div className="p-8 text-center text-slate-400">로딩 중...</div>
            ) : supplies.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <div className="text-3xl mb-2">🛒</div>
                <p>등록된 물품이 없습니다.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-2.5 text-left">물품명</th>
                    <th className="px-4 py-2.5 text-center">실수량</th>
                    <th className="px-4 py-2.5 text-center">구매수량</th>
                    <th className="px-4 py-2.5 text-right">금액</th>
                    <th className="px-4 py-2.5 text-left">구매링크</th>
                    <th className="px-4 py-2.5 text-left">비고</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplies.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                      <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{s.actualQty || "-"}</td>
                      <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{s.buyQty || "-"}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 font-medium text-xs">{formatPrice(s.price || 0)}</td>
                      <td className="px-4 py-2.5 text-xs max-w-[160px]">
                        {s.link ? (
                          <a href={s.link} target="_blank" rel="noopener noreferrer"
                            className="text-blue-500 hover:underline truncate block">🔗 링크</a>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{s.note || "-"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          <button onClick={() => startEditSupply(s)} className="text-xs text-slate-400 hover:text-blue-500 whitespace-nowrap">수정</button>
                          <button onClick={() => handleDeleteSupply(s.id)} className="text-xs text-slate-300 hover:text-red-400 whitespace-nowrap">삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {/* 합계 행 */}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-4 py-2.5 text-slate-700" colSpan={3}>합계</td>
                    <td className="px-4 py-2.5 text-right text-blue-600">{supplyTotal.toLocaleString()}원</td>
                    <td colSpan={3}></td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── 간식 탭 ─────────────────────────────────── */}
      {innerTab === "간식" && (
        <div>
          {snackError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              ⚠ 로드 오류: {snackError}
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">등록 품목 <strong className="text-slate-800">{snacks.length}</strong></span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">합계 <strong className="text-blue-600">{snackTotal.toLocaleString()}원</strong></span>
            </div>
            <button onClick={() => { setSnackForm(EMPTY_SNACK); setEditSnackId(null); setShowSnackModal(true); }}
              className="btn-primary">＋ 간식 추가</button>
          </div>

          {/* 간식 Modal */}
          {showSnackModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h3 className="font-bold text-lg mb-4">{editSnackId ? "간식 수정" : "간식 추가"}</h3>
                <div className="space-y-3">
                  <select className="input" value={snackForm.category}
                    onChange={e => setSnackForm(p => ({ ...p, category: e.target.value }))}>
                    {SNACK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input className="input" placeholder="품목명 *" value={snackForm.name}
                    onChange={e => setSnackForm(p => ({ ...p, name: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <input className="input" placeholder="수량 (예: 370개)" value={snackForm.qty}
                      onChange={e => setSnackForm(p => applySnackAutoPrice({ ...p, qty: e.target.value }))} />
                    <input className="input" type="number" placeholder="개당 단가 (원)" value={snackForm.unitPrice || ""}
                      onChange={e => setSnackForm(p => applySnackAutoPrice({ ...p, unitPrice: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <input className="input" type="number" placeholder="금액 (원)" value={snackForm.price || ""}
                      readOnly={(snackForm.unitPrice || 0) > 0 && parseQtyNumber(snackForm.qty || "") > 0}
                      onChange={e => setSnackForm(p => ({ ...p, price: parseInt(e.target.value) || 0 }))} />
                    {(snackForm.unitPrice || 0) > 0 && parseQtyNumber(snackForm.qty || "") > 0 && (
                      <p className="mt-1 text-xs text-blue-600">
                        자동 계산: {parseQtyNumber(snackForm.qty || "").toLocaleString()} × {(snackForm.unitPrice || 0).toLocaleString()}원 = {(snackForm.price || 0).toLocaleString()}원
                      </p>
                    )}
                  </div>
                  <input className="input" placeholder="구매링크 또는 연락처" value={snackForm.link}
                    onChange={e => setSnackForm(p => ({ ...p, link: e.target.value }))} />
                  <input className="input" placeholder="비고" value={snackForm.note}
                    onChange={e => setSnackForm(p => ({ ...p, note: e.target.value }))} />
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={handleSaveSnack} className="btn-primary flex-1 justify-center">저장</button>
                  <button onClick={() => { setShowSnackModal(false); setEditSnackId(null); }}
                    className="btn-secondary flex-1 justify-center">취소</button>
                </div>
              </div>
            </div>
          )}

          {/* 카테고리별 간식 목록 */}
          {snackLoading ? (
            <div className="text-center text-slate-400 py-10">로딩 중...</div>
          ) : snacks.length === 0 && snackBudgetTotal === 0 ? (
            <div className="card p-8 text-center text-slate-400">
              <div className="text-3xl mb-2">🍜</div>
              <p>등록된 간식이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {SNACK_CATEGORIES.map(cat => {
                const items = snacks.filter(s => s.category === cat);
                const catBudget = snackBudgets[cat] || 0;
                if (items.length === 0 && catBudget === 0) return null;
                const catTotal = items.reduce((acc, s) => acc + (s.price || 0), 0);
                return (
                  <div key={cat} className="card overflow-x-auto">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-700">{cat}</h3>
                      <span className={`text-sm font-medium ${catBudget > 0 && catTotal > catBudget ? "text-red-500" : "text-blue-600"}`}>
                        {catTotal.toLocaleString()}원{catBudget > 0 && <span className="text-slate-400 font-normal"> / 예산 {catBudget.toLocaleString()}원</span>}
                      </span>
                    </div>
                    {items.length === 0 && (
                      <p className="px-4 py-6 text-center text-slate-400 text-sm">등록된 품목이 없습니다.</p>
                    )}
                    {items.length > 0 && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="table-header">
                          <th className="px-4 py-2 text-left">품목</th>
                          <th className="px-4 py-2 text-center">수량</th>
                          <th className="px-4 py-2 text-right">개당 단가</th>
                          <th className="px-4 py-2 text-right">금액</th>
                          <th className="px-4 py-2 text-left">구매처/연락처</th>
                          <th className="px-4 py-2 text-left">비고</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                            <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{s.qty || "-"}</td>
                            <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{formatPrice(s.unitPrice || 0)}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-xs">{formatPrice(s.price || 0)}</td>
                            <td className="px-4 py-2.5 text-xs max-w-[160px]">
                              {s.link ? (
                                s.link.startsWith("http") ? (
                                  <a href={s.link} target="_blank" rel="noopener noreferrer"
                                    className="text-blue-500 hover:underline">🔗 링크</a>
                                ) : (
                                  <span className="text-slate-500">{s.link}</span>
                                )
                              ) : <span className="text-slate-300">-</span>}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-400">{s.note || "-"}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex gap-2">
                                <button onClick={() => startEditSnack(s)} className="text-xs text-slate-400 hover:text-blue-500 whitespace-nowrap">수정</button>
                                <button onClick={() => handleDeleteSnack(s.id)} className="text-xs text-slate-300 hover:text-red-400 whitespace-nowrap">삭제</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    )}
                  </div>
                );
              })}

              {/* 전체 합계 */}
              <div className="card p-4 flex items-center justify-between bg-blue-50">
                <span className="font-semibold text-slate-700">총 간식 비용</span>
                <span className="text-xl font-bold text-blue-600">{snackTotal.toLocaleString()}원</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
