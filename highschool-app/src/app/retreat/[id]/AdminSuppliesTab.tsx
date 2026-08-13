"use client";
import { useEffect, useMemo, useState } from "react";
import { Retreat, AdminSupplyItem, AdminSupplyKind, ADMIN_SUPPLY_KINDS } from "@/lib/types";
import { subscribeToAdminSupplies, saveAdminSupply, updateAdminSupply, deleteAdminSupply } from "@/lib/db";
import { useUI } from "@/context/UIContext";

interface Props { retreat: Retreat; }

const KIND_ICON: Record<AdminSupplyKind, string> = { "행정물품": "🗂️", "의약품": "💊" };

function emptyItem(kind: AdminSupplyKind): Omit<AdminSupplyItem, "id"> {
  return { kind, name: "", category: "", neededQty: "", stockQty: "", checked: false, note: "" };
}
const UNCATEGORIZED = "미분류";

export default function AdminSuppliesTab({ retreat }: Props) {
  const { toast, uiConfirm } = useUI();
  const [innerTab, setInnerTab] = useState<AdminSupplyKind>("행정물품");
  const [items, setItems] = useState<AdminSupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<AdminSupplyItem, "id">>(emptyItem("행정물품"));
  const [hideChecked, setHideChecked] = useState(false);

  useEffect(() => {
    return subscribeToAdminSupplies(retreat.id, (next) => {
      setItems(next);
      setLoading(false);
    }, (error) => {
      setLoadError(error.message);
      setLoading(false);
    });
  }, [retreat.id]);

  async function handleSave() {
    if (!form.name.trim()) return toast("품목명을 입력해주세요.", "warning");
    try {
      if (editId) {
        await updateAdminSupply(retreat.id, editId, form);
      } else {
        await saveAdminSupply(retreat.id, form);
      }
      setForm(emptyItem(innerTab));
      setShowModal(false);
      setEditId(null);
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleDelete(id: string) {
    if (!await uiConfirm("삭제하시겠습니까?")) return;
    try {
      await deleteAdminSupply(retreat.id, id);
    } catch (e) {
      toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function toggleChecked(item: AdminSupplyItem) {
    const checked = !item.checked;
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, checked } : it));
    try {
      await updateAdminSupply(retreat.id, item.id, { checked });
    } catch (e) {
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, checked: !checked } : it));
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function startEdit(it: AdminSupplyItem) {
    setForm({ kind: it.kind || innerTab, name: it.name, category: it.category || "", neededQty: it.neededQty || "",
      stockQty: it.stockQty || "", checked: it.checked, note: it.note || "" });
    setEditId(it.id);
    setShowModal(true);
  }

  // kind 없이 저장된 옛 데이터는 "행정물품"으로 취급 (하위 호환)
  const itemsInTab = useMemo(() => items.filter(it => (it.kind || "행정물품") === innerTab), [items, innerTab]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminSupplyItem[]>();
    itemsInTab.forEach(it => {
      const cat = it.category?.trim() || UNCATEGORIZED;
      const list = map.get(cat) || [];
      list.push(it);
      map.set(cat, list);
    });
    return [...map.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b, "ko");
    });
  }, [itemsInTab]);

  const checkedCount = itemsInTab.filter(it => it.checked).length;

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      {/* Inner Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
        {ADMIN_SUPPLY_KINDS.map(k => (
          <button key={k} onClick={() => setInnerTab(k)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              innerTab === k ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
            }`}>{KIND_ICON[k]} {k}</button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">준비 완료 <strong className="text-emerald-600">{checkedCount}</strong> / {itemsInTab.length}</span>
          {itemsInTab.length > 0 && (
            <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${itemsInTab.length > 0 ? (checkedCount / itemsInTab.length) * 100 : 0}%` }} />
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-400 ml-2">
            <input type="checkbox" checked={hideChecked} onChange={e => setHideChecked(e.target.checked)} />
            준비 완료 숨기기
          </label>
        </div>
        <button onClick={() => { setForm(emptyItem(innerTab)); setEditId(null); setShowModal(true); }} className="btn-primary">
          ＋ 품목 추가
        </button>
      </div>

      {/* 추가/수정 Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onKeyDown={e => { if (e.key === "Escape") setShowModal(false); }}>
          <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="행정물품 추가/수정">
            <h3 className="font-bold text-lg mb-4">{editId ? "품목 수정" : "품목 추가"}</h3>
            <div className="space-y-3">
              <select className="input" value={form.kind}
                onChange={e => setForm(p => ({ ...p, kind: e.target.value as AdminSupplyKind }))}>
                {ADMIN_SUPPLY_KINDS.map(k => <option key={k} value={k}>{KIND_ICON[k]} {k}</option>)}
              </select>
              <input className="input" placeholder="품목명 *" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <input className="input" placeholder="분류 (예: 사무용품, 의료용품)" value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <input className="input" placeholder="필요 수량 (예: 20개)" value={form.neededQty}
                  onChange={e => setForm(p => ({ ...p, neededQty: e.target.value }))} />
                <input className="input" placeholder="현재 재고 (예: 12개)" value={form.stockQty}
                  onChange={e => setForm(p => ({ ...p, stockQty: e.target.value }))} />
              </div>
              <input className="input" placeholder="비고" value={form.note}
                onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={form.checked}
                  onChange={e => setForm(p => ({ ...p, checked: e.target.checked }))} />
                준비 완료
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSave} className="btn-primary flex-1 justify-center">저장</button>
              <button onClick={() => { setShowModal(false); setEditId(null); }} className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 분류별 목록 */}
      {loading ? (
        <div className="text-center text-slate-400 py-10">로딩 중...</div>
      ) : itemsInTab.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          <div className="text-3xl mb-2">{KIND_ICON[innerTab]}</div>
          <p>등록된 {innerTab}이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([cat, catItems]) => {
            const visible = hideChecked ? catItems.filter(it => !it.checked) : catItems;
            if (visible.length === 0) return null;
            const catChecked = catItems.filter(it => it.checked).length;
            return (
              <div key={cat} className="card overflow-x-auto">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-700">{cat}</h3>
                  <span className="text-xs text-slate-400">{catChecked} / {catItems.length}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-2 text-center w-10">✓</th>
                      <th className="px-4 py-2 text-left">품목</th>
                      <th className="px-4 py-2 text-center">필요 수량</th>
                      <th className="px-4 py-2 text-center">현재 재고</th>
                      <th className="px-4 py-2 text-left">비고</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map(it => (
                      <tr key={it.id} className={it.checked ? "bg-emerald-50/40" : "hover:bg-slate-50"}>
                        <td className="px-4 py-2.5 text-center">
                          <input type="checkbox" checked={it.checked} onChange={() => toggleChecked(it)}
                            aria-label={`${it.name} 준비 완료`} />
                        </td>
                        <td className={`px-4 py-2.5 font-medium ${it.checked ? "text-slate-400 line-through" : "text-slate-800"}`}>{it.name}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{it.neededQty || "—"}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{it.stockQty || "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{it.note || "—"}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-2">
                            <button onClick={() => startEdit(it)} className="text-xs text-slate-400 hover:text-blue-500 whitespace-nowrap">수정</button>
                            <button onClick={() => handleDelete(it.id)} className="text-xs text-slate-300 hover:text-red-400 whitespace-nowrap">삭제</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
