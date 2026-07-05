"use client";
import { useEffect, useState, useMemo } from "react";
import { Retreat, TshirtOrder, TSHIRT_DESIGNS, TSHIRT_SIZES } from "@/lib/types";
import {
  subscribeToTshirtOrders,
  addTshirtOrder,
  updateTshirtOrder,
  deleteTshirtOrder,
  replaceSheetTshirtOrders,
} from "@/lib/db";
import * as XLSX from "xlsx";
import { saveWorkbook, rowsToHtmlTable, exportAsJPG } from "@/lib/exportUtils";
import { fetchSheetCSV } from "@/lib/sheetsParser";
import { useUI } from "@/context/UIContext";

// ── 상수 ──────────────────────────────────────────────────────
const DESIGN_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  "1번": { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  "2번": { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  "3번": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "4번": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
};

const emptyAdd = () => ({ name: "", bu: "1부", grade: "1", cls: "", design: "", size: "", note: "" });

// ── 시트 파서 ──────────────────────────────────────────────────
async function fetchTshirtFromSheet(sheetId: string, gid: string): Promise<Omit<TshirtOrder, "id">[]> {
  const rows = await fetchSheetCSV(sheetId, gid);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());

  // 키워드로 컬럼 인덱스 탐색
  const designIdx = headers.findIndex(h => h.includes("디자인"));
  const sizeIdx   = headers.findIndex(h => h.includes("사이즈"));
  if (designIdx === -1 || sizeIdx === -1) {
    throw new Error("시트에서 '디자인' 또는 '사이즈' 컬럼을 찾을 수 없습니다.\n헤더에 해당 키워드가 포함되어야 합니다.");
  }

  const orders: Omit<TshirtOrder, "id">[] = [];
  for (let i = 1; i < rows.length; i++) {
    const vals = rows[i];
    const name = vals[1]?.trim();
    if (!name) continue;
    const design = vals[designIdx]?.trim() || "";
    const size   = vals[sizeIdx]?.trim()   || "";

    // 신청하지 않은 경우 제외 ("않" 또는 "아니" 포함, 또는 빈값)
    if (!design || design.includes("않") || design.includes("아니")) continue;

    const bu = vals[3]?.trim() || "";
    let grade = 0, cls = 0;
    for (let j = 4; j < headers.length; j++) {
      const h = headers[j], v = vals[j]?.trim() || "";
      if (!v) continue;
      if (h.includes("학년") && !h.includes("반")) {
        const m = v.match(/(\d+)학년/); if (m) grade = parseInt(m[1]);
      } else if (h.includes("반")) {
        const m = v.match(/(\d+)반/);   if (m) cls   = parseInt(m[1]);
      }
    }
    orders.push({ name, grade, class: cls, bu, design, size, source: "sheet", createdAt: Date.now() });
  }
  return orders;
}

// ── 컴포넌트 ──────────────────────────────────────────────────
export default function TshirtTab({ retreat }: { retreat: Retreat }) {
  const { toast, uiConfirm } = useUI();
  const [orders, setOrders]       = useState<TshirtOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 필터
  const [buFilter,     setBuFilter]     = useState("전체");
  const [designFilter, setDesignFilter] = useState("전체");

  // 수동 추가 폼
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyAdd());
  const [adding,  setAdding]  = useState(false);

  // 인라인 수정
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState({ design: "", size: "", note: "" });

  // 시트 불러오기
  const [importing,  setImporting]  = useState(false);
  const [importMsg,  setImportMsg]  = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setLoadError(null);
    try {
      const unsub = subscribeToTshirtOrders(retreat.id, list => {
        setOrders(list);
        setLoading(false);
      });
      return unsub;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setLoading(false);
      return undefined;
    }
  }, [retreat.id]);

  // ── 집계 ──────────────────────────────────────────────────
  const designCounts = useMemo(() =>
    Object.fromEntries(TSHIRT_DESIGNS.map(d => [d, orders.filter(o => o.design === d).length])),
    [orders]
  );
  const sizeCounts = useMemo(() =>
    Object.fromEntries(TSHIRT_SIZES.map(s => [s, orders.filter(o => o.size === s).length])),
    [orders]
  );

  // ── 필터된 목록 ───────────────────────────────────────────
  const filtered = useMemo(() => orders.filter(o => {
    if (buFilter     !== "전체" && o.bu     !== buFilter)     return false;
    if (designFilter !== "전체" && o.design !== designFilter) return false;
    return true;
  }), [orders, buFilter, designFilter]);

  // ── 시트 불러오기 ──────────────────────────────────────────
  async function handleImport() {
    if (!retreat.sheetId) {
      setImportMsg({ type: "err", text: "응답 시트가 설정되지 않았습니다. ⚙ 시트 설정에서 먼저 연결해주세요." });
      return;
    }
    setImporting(true);
    setImportMsg(null);
    try {
      const newOrders = await fetchTshirtFromSheet(retreat.sheetId, retreat.sheetGid);
      await replaceSheetTshirtOrders(retreat.id, newOrders);
      setImportMsg({ type: "ok", text: `시트에서 ${newOrders.length}명의 신청 데이터를 불러왔습니다.` });
    } catch (e) {
      setImportMsg({ type: "err", text: e instanceof Error ? e.message : "오류가 발생했습니다." });
    } finally {
      setImporting(false);
    }
  }

  // ── 수동 추가 ──────────────────────────────────────────────
  async function handleAdd() {
    if (!addForm.name.trim() || !addForm.design || !addForm.size || adding) return;
    setAdding(true);
    try {
      await addTshirtOrder(retreat.id, {
        name:    addForm.name.trim(),
        grade:   parseInt(addForm.grade) || 0,
        class:   parseInt(addForm.cls)   || 0,
        bu:      addForm.bu,
        design:  addForm.design,
        size:    addForm.size,
        source:  "manual",
        note:    addForm.note.trim() || undefined,
        createdAt: Date.now(),
      });
      setAddForm(emptyAdd());
      setShowAdd(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "단체티 신청을 추가하지 못했습니다.", "error");
    } finally {
      setAdding(false);
    }
  }

  // ── 수정 저장 ──────────────────────────────────────────────
  async function handleEditSave(id: string) {
    try {
      await updateTshirtOrder(retreat.id, id, {
        design: editForm.design,
        size:   editForm.size,
        note:   editForm.note.trim() || null,
      });
      setEditingId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "단체티 신청을 수정하지 못했습니다.", "error");
    }
  }

  // ── 삭제 ──────────────────────────────────────────────────
  async function handleDelete(o: TshirtOrder) {
    if (!await uiConfirm(`"${o.name}" 항목을 삭제하시겠습니까?`)) return;
    try {
      await deleteTshirtOrder(retreat.id, o.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "단체티 신청을 삭제하지 못했습니다.", "error");
    }
  }

  // ── 엑셀 다운로드 ─────────────────────────────────────────
  function buildTshirtRows() {
    return filtered.map((o, i) => ({
      "번호": i + 1,
      "이름": o.name,
      "부":   o.bu,
      "학년": o.grade > 0 ? `${o.grade}학년` : "",
      "반":   o.class > 0 ? `${o.class}반`   : "",
      "디자인": o.design,
      "사이즈": o.size,
      "메모":   o.note || "",
      "출처":   o.source === "sheet" ? "시트" : "수동",
    }));
  }

  function exportXLSX() {
    const ws = XLSX.utils.json_to_sheet(buildTshirtRows());
    ws["!cols"] = [
      { wch: 5 }, { wch: 10 }, { wch: 5 }, { wch: 7 }, { wch: 5 },
      { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 6 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "단체티 신청");
    saveWorkbook(wb, `${retreat.name}_단체티신청`);
  }

  async function exportJPG() {
    if (filtered.length === 0) return toast("내보낼 항목이 없습니다.", "warning");
    const html = rowsToHtmlTable(`${retreat.name} 단체티 신청`, `총 ${filtered.length}건 · 출력일: ${new Date().toLocaleDateString("ko-KR")}`, buildTshirtRows());
    if (!await exportAsJPG(html, `${retreat.name}_단체티신청`, true)) {
      toast("JPG 저장에 실패했습니다.", "error");
    }
  }

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;

  return (
    <div className="space-y-5 max-w-4xl">
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      {/* ── 헤더 ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-800">단체티 신청</h2>
          <p className="text-xs text-slate-400 mt-0.5">시트에서 불러오거나 직접 추가할 수 있습니다</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleImport}
            disabled={importing}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            {importing ? "⏳ 불러오는 중..." : "🔄 시트에서 불러오기"}
          </button>
          <button
            onClick={exportXLSX}
            disabled={filtered.length === 0}
            className="btn-secondary text-xs"
          >
            📥 엑셀 다운로드
          </button>
          <button
            onClick={exportJPG}
            disabled={filtered.length === 0}
            className="btn-secondary text-xs"
          >
            🖼️ JPG
          </button>
        </div>
      </div>

      {/* 시트 불러오기 결과 메시지 */}
      {importMsg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${
          importMsg.type === "ok"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {importMsg.type === "ok" ? "✅" : "⚠"} {importMsg.text}
          <button onClick={() => setImportMsg(null)} className="ml-auto text-slate-400 hover:text-slate-600">×</button>
        </div>
      )}

      {/* ── 집계 카드 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* 총계 */}
        <div className="card px-4 py-3 sm:col-span-1 flex items-center gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-800">{orders.length}<span className="text-base font-normal text-slate-400 ml-1">명</span></div>
            <div className="text-xs text-slate-500">총 신청</div>
          </div>
        </div>
        {/* 디자인별 */}
        <div className="card px-4 py-3 sm:col-span-2">
          <div className="text-xs font-semibold text-slate-500 mb-2">디자인별</div>
          <div className="flex flex-wrap gap-2">
            {TSHIRT_DESIGNS.map(d => {
              const s = DESIGN_STYLE[d] ?? { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" };
              return (
                <div key={d} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${s.bg} ${s.border}`}>
                  <span className={`text-sm font-bold ${s.text}`}>{d}</span>
                  <span className={`text-lg font-extrabold ${s.text}`}>{designCounts[d]}</span>
                  <span className={`text-xs ${s.text} opacity-70`}>명</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* 사이즈별 */}
        <div className="card px-4 py-3 col-span-2 sm:col-span-3">
          <div className="text-xs font-semibold text-slate-500 mb-2">사이즈별</div>
          <div className="flex flex-wrap gap-2">
            {TSHIRT_SIZES.map(s => (
              <div key={s} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-xs font-semibold text-slate-600">{s}</span>
                <span className="text-base font-bold text-slate-800 ml-1">{sizeCounts[s]}</span>
                <span className="text-xs text-slate-400">명</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 수동 추가 폼 ── */}
      {showAdd && (
        <div className="card p-4">
          <h3 className="font-semibold text-slate-700 mb-3 text-sm">수동 추가</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <input
              className="input col-span-2 sm:col-span-1"
              placeholder="이름 *"
              value={addForm.name}
              onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
            />
            <select className="input" value={addForm.bu} onChange={e => setAddForm(p => ({ ...p, bu: e.target.value }))}>
              <option value="1부">1부</option>
              <option value="2부">2부</option>
            </select>
            <select className="input" value={addForm.grade} onChange={e => setAddForm(p => ({ ...p, grade: e.target.value }))}>
              <option value="1">1학년</option>
              <option value="2">2학년</option>
              <option value="3">3학년</option>
            </select>
            <input
              className="input"
              placeholder="반"
              type="number" min={1}
              value={addForm.cls}
              onChange={e => setAddForm(p => ({ ...p, cls: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select
              className={`input ${!addForm.design ? "text-slate-400" : ""}`}
              value={addForm.design}
              onChange={e => setAddForm(p => ({ ...p, design: e.target.value }))}
            >
              <option value="">디자인 선택 *</option>
              {TSHIRT_DESIGNS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              className={`input ${!addForm.size ? "text-slate-400" : ""}`}
              value={addForm.size}
              onChange={e => setAddForm(p => ({ ...p, size: e.target.value }))}
            >
              <option value="">사이즈 선택 *</option>
              {TSHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              className="input sm:col-span-2"
              placeholder="메모 (선택)"
              value={addForm.note}
              onChange={e => setAddForm(p => ({ ...p, note: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAdd}
              disabled={adding || !addForm.name.trim() || !addForm.design || !addForm.size}
              className="btn-primary text-sm"
            >
              {adding ? "추가 중..." : "추가"}
            </button>
            <button onClick={() => { setShowAdd(false); setAddForm(emptyAdd()); }} className="btn-secondary text-sm">취소</button>
          </div>
        </div>
      )}

      {/* ── 필터 + 추가 버튼 ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          {/* 부 필터 */}
          {["전체", "1부", "2부"].map(b => (
            <button key={b} onClick={() => setBuFilter(b)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                buFilter === b ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}>
              {b}
            </button>
          ))}
          <span className="text-slate-300 mx-1">|</span>
          {/* 디자인 필터 */}
          {["전체", ...TSHIRT_DESIGNS].map(d => {
            const s = d !== "전체" ? (DESIGN_STYLE[d] ?? null) : null;
            const isActive = designFilter === d;
            return (
              <button key={d} onClick={() => setDesignFilter(d)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  isActive && s
                    ? `${s.bg} ${s.text} ${s.border}`
                    : isActive
                    ? "bg-slate-700 text-white border-transparent"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}>
                {d}
              </button>
            );
          })}
        </div>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs">
            ＋ 직접 추가
          </button>
        )}
      </div>

      {/* ── 신청자 목록 ── */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <div className="text-4xl mb-3">👕</div>
          <p className="font-medium">
            {orders.length === 0 ? "단체티 신청 데이터가 없습니다" : "필터 조건에 맞는 데이터가 없습니다"}
          </p>
          <p className="text-sm mt-1">
            {orders.length === 0
              ? "시트에서 불러오거나 직접 추가해보세요."
              : "필터를 변경해보세요."}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500 font-medium">
            총 {filtered.length}명
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">이름</th>
                <th className="text-left px-4 py-2.5 font-medium">부</th>
                <th className="text-left px-4 py-2.5 font-medium">학년·반</th>
                <th className="text-left px-4 py-2.5 font-medium">디자인</th>
                <th className="text-left px-4 py-2.5 font-medium">사이즈</th>
                <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">메모</th>
                <th className="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(o => {
                const isEditing = editingId === o.id;
                const ds = DESIGN_STYLE[o.design] ?? { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" };
                return (
                  <tr key={o.id} className={`hover:bg-slate-50 transition-colors ${isEditing ? "bg-blue-50/30" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {o.name}
                      {o.source === "manual" && (
                        <span className="ml-1.5 text-[10px] text-slate-400 border border-slate-200 rounded px-1">직접</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        o.bu === "1부" ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"
                      }`}>{o.bu}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {o.grade > 0 ? `${o.grade}학년 ${o.class}반` : "—"}
                    </td>

                    {/* 디자인 셀 */}
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <select className="input text-xs py-1 w-20"
                          value={editForm.design}
                          onChange={e => setEditForm(p => ({ ...p, design: e.target.value }))}>
                          {TSHIRT_DESIGNS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ds.bg} ${ds.text} ${ds.border}`}>
                          {o.design}
                        </span>
                      )}
                    </td>

                    {/* 사이즈 셀 */}
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <select className="input text-xs py-1 w-24"
                          value={editForm.size}
                          onChange={e => setEditForm(p => ({ ...p, size: e.target.value }))}>
                          {TSHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">{o.size}</span>
                      )}
                    </td>

                    {/* 메모 셀 */}
                    <td className="px-4 py-2.5 text-xs text-slate-400 hidden sm:table-cell">
                      {isEditing ? (
                        <input className="input text-xs py-1 w-32"
                          value={editForm.note}
                          placeholder="메모"
                          onChange={e => setEditForm(p => ({ ...p, note: e.target.value }))} />
                      ) : (
                        o.note || "—"
                      )}
                    </td>

                    {/* 액션 */}
                    <td className="px-4 py-2.5 text-right">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => handleEditSave(o.id)} className="btn-primary btn-sm text-xs">저장</button>
                          <button onClick={() => setEditingId(null)} className="btn-secondary btn-sm text-xs">취소</button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => { setEditingId(o.id); setEditForm({ design: o.design, size: o.size, note: o.note || "" }); }}
                            className="btn-secondary btn-sm text-xs"
                          >수정</button>
                          <button onClick={() => handleDelete(o)} className="btn-danger btn-sm text-xs">삭제</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
