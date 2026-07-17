"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import { Retreat, Cancellation } from "@/lib/types";
import {
  deleteCancellation, deleteCancellationWithRosterMarker, getCancellations, getCellColors, getClassesByYear,
  saveCancellation, saveCancellationWithRosterMarker, setCellColor,
  updateCancellationWithRosterMarker,
} from "@/lib/db";
import { parseClassKey } from "@/lib/classKey";
import { buildCancellationRosterStudents, CancellationRosterStudent, resolveCancellationStudentKey } from "@/lib/cancellationRoster";
import { useUI } from "@/context/UIContext";

interface Props { retreat: Retreat; }

const EMPTY_FORM: Omit<Cancellation, "id"> = {
  bu: "1부", grade: 0, class: 0, name: "", phone: "", reason: "", account: "", note: "", paymentAmount: null,
};

function parseOptionalAmount(value: string, valueAsNumber: number): number | null {
  if (value === "") return null;
  return Number.isFinite(valueAsNumber) ? valueAsNumber : null;
}

export default function CancellationTab({ retreat }: Props) {
  const { toast, uiConfirm } = useUI();
  const [records, setRecords] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Cancellation, "id">>(EMPTY_FORM);
  const [filter, setFilter] = useState<"전체" | "1부" | "2부">("전체");
  const [rosterStudents, setRosterStudents] = useState<CancellationRosterStudent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // 1) cellColors + 학생 DB + 기존 취소명단 동시 로드
      const [colors, classesRaw, existing] = await Promise.all([
        getCellColors(retreat.id),
        getClassesByYear(retreat.year),
        getCancellations(retreat.id),
      ]);
      const roster = buildCancellationRosterStudents(classesRaw);
      setRosterStudents(roster);

      // 2) 빨간색 셀 → 취소명단 자동 동기화
      const existingKeys = new Set(existing.map(c => c.studentKey).filter(Boolean));
      const redEntries = Object.entries(colors).filter(([, color]) => color === "red");

      if (redEntries.length > 0 && Object.keys(classesRaw).length > 0) {
        // studentId → { name, grade, classNum, buNum } 맵 생성
        const studentMap = new Map<string, { name: string; grade: number; classNum: number; buNum: number }>();
        Object.entries(classesRaw).forEach(([classKey, cd]) => {
          const parsed = parseClassKey(classKey);
          if (!parsed) return;
          const { buNum, grade, classNum } = parsed;
          Object.entries(cd.students || {}).forEach(([sid, s]) => {
            studentMap.set(`${buNum}_${sid}`, { name: s.name, grade, classNum, buNum });
          });
        });

        // 빨간 셀 중 취소명단에 없는 학생 추가
        for (const [key] of redEntries) {
          if (existingKeys.has(key)) continue;
          const info = studentMap.get(key);
          if (!info) continue;
          const bu = info.buNum === 1 ? "1부" : "2부" as "1부" | "2부";
          const newId = await saveCancellation(retreat.id, {
            bu, grade: info.grade, class: info.classNum,
            name: info.name, phone: "", reason: "", account: "", note: "",
            studentKey: key,
          });
          existing.push({ id: newId, bu, grade: info.grade, class: info.classNum,
            name: info.name, phone: "", reason: "", account: "", note: "", studentKey: key });
        }
      }

      // 과거 수동 취소는 private 명단에만 있고 cellColors가 없을 수 있다.
      // 정확히 한 학생으로 연결되는 경우에만 공개 red 마커를 보강해 IGuard 인원체크에서도 제외한다.
      const resolvedExisting = existing.map(record => {
        const studentKey = resolveCancellationStudentKey(record, roster);
        return studentKey ? { ...record, studentKey } : record;
      });
      await Promise.all(resolvedExisting
        .filter((record): record is Cancellation & { studentKey: string } => !!record.studentKey && colors[record.studentKey] !== "red")
        .map(record => setCellColor(retreat.id, record.studentKey, "red")));
      setRecords(resolvedExisting);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [retreat.id, retreat.year]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    if (!form.name.trim()) return toast("학생 이름을 입력해주세요.", "warning");
    const studentKey = resolveCancellationStudentKey(form, rosterStudents);
    if (!studentKey) return toast("출석부에서 부·학년·반·이름이 정확히 일치하는 학생을 찾지 못했습니다. 학생 정보를 확인해주세요.", "warning");
    const payload = { ...form, studentKey };
    try {
      if (editId) {
        const previousStudentKey = records.find(record => record.id === editId)?.studentKey;
        await updateCancellationWithRosterMarker(retreat.id, editId, payload, previousStudentKey);
        setRecords(prev => prev.map(r => r.id === editId ? { ...r, ...payload } : r));
      } else {
        const id = await saveCancellationWithRosterMarker(retreat.id, payload);
        setRecords(prev => [...prev, { id, ...payload }]);
      }
      setForm(EMPTY_FORM);
      setShowAdd(false);
      setEditId(null);
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleDelete(id: string) {
    if (!await uiConfirm("삭제하시겠습니까?")) return;
    try {
      const studentKey = records.find(record => record.id === id)?.studentKey;
      if (studentKey) await deleteCancellationWithRosterMarker(retreat.id, id, studentKey);
      else await deleteCancellation(retreat.id, id);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function startEdit(r: Cancellation) {
    setForm({ bu: r.bu, grade: r.grade, class: r.class, name: r.name,
      phone: r.phone || "", reason: r.reason || "", account: r.account || "", note: r.note || "",
      paymentAmount: r.paymentAmount ?? null, studentKey: r.studentKey });
    setEditId(r.id);
    setShowAdd(true);
  }

  const { filtered, bu1, bu2 } = useMemo(() => {
    let bu1 = 0, bu2 = 0;
    const filtered = records.filter(r => {
      if (r.bu === "1부") bu1++;
      else if (r.bu === "2부") bu2++;
      return filter === "전체" || r.bu === filter;
    });
    return { filtered, bu1, bu2 };
  }, [records, filter]);

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm mr-1">
          <span className="text-slate-500">전체 <strong className="text-slate-800">{records.length}</strong></span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">1부 <strong className="text-green-700">{bu1}</strong></span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">2부 <strong className="text-purple-700">{bu2}</strong></span>
        </div>
        <div className="flex gap-1">
          {(["전체", "1부", "2부"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === f ? "bg-sky-600 text-white border-sky-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}>{f}</button>
          ))}
        </div>
        <button onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowAdd(true); }}
          className="btn-primary ml-auto">＋ 취소 추가</button>
      </div>

      {/* Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">{editId ? "취소 수정" : "취소 추가"}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input className="input" placeholder="학생 이름" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                <select className="input" value={form.bu}
                  onChange={e => setForm(p => ({ ...p, bu: e.target.value as "1부" | "2부" }))}>
                  <option>1부</option><option>2부</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className="input" type="number" placeholder="학년" value={form.grade || ""}
                  onChange={e => setForm(p => ({ ...p, grade: parseInt(e.target.value) || 0 }))} />
                <input className="input" type="number" placeholder="반" value={form.class || ""}
                  onChange={e => setForm(p => ({ ...p, class: parseInt(e.target.value) || 0 }))} />
              </div>
              <input className="input" placeholder="연락처" value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              <input className="input" placeholder="취소 사유 (예: 개인 사정, 부상)" value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
              <input className="input" type="number" placeholder="입금 금액 (예: 50000)" value={form.paymentAmount ?? ""}
                onChange={e => setForm(p => ({ ...p, paymentAmount: parseOptionalAmount(e.target.value, e.target.valueAsNumber) }))} />
              <input className="input" placeholder="환불 계좌 (예: 카카오뱅크 3333-01-1234567 홍길동)" value={form.account}
                onChange={e => setForm(p => ({ ...p, account: e.target.value }))} />
              <input className="input" placeholder="비고" value={form.note}
                onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSave} className="btn-primary flex-1 justify-center">저장</button>
              <button onClick={() => { setShowAdd(false); setEditId(null); }}
                className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <div className="text-3xl mb-2">📋</div>
            <p>취소 명단이 없습니다.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-2.5 text-left">이름</th>
                <th className="px-4 py-2.5 text-left">부/학년반</th>
                <th className="px-4 py-2.5 text-left">연락처</th>
                <th className="px-4 py-2.5 text-left">취소 사유</th>
                <th className="px-4 py-2.5 text-left">입금 금액</th>
                <th className="px-4 py-2.5 text-left">환불 계좌</th>
                <th className="px-4 py-2.5 text-left">비고</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`tag ${r.bu === "1부" ? "tag-green" : "tag-purple"} mr-1`}>{r.bu}</span>
                    <span className="text-slate-600 text-xs">{r.grade > 0 ? `${r.grade}학년 ${r.class}반` : "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.phone || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{r.reason || "—"}</td>
                  <td className="px-4 py-2.5 text-xs font-medium">
                    {r.paymentAmount != null
                      ? <span className="text-blue-600">{r.paymentAmount.toLocaleString()}원</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[180px] truncate">{r.account || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{r.note || "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(r)} className="text-xs text-slate-400 hover:text-blue-500 whitespace-nowrap">수정</button>
                      <button onClick={() => handleDelete(r.id)} className="text-xs text-slate-300 hover:text-red-400 whitespace-nowrap">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 부별 요약 */}
      {records.length > 0 && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {(["1부", "2부"] as const).map(bu => {
            const group = records.filter(r => r.bu === bu);
            if (group.length === 0) return null;
            return (
              <div key={bu} className="card p-4">
                <h4 className="text-sm font-semibold text-slate-600 mb-2">
                  <span className={`tag ${bu === "1부" ? "tag-green" : "tag-purple"} mr-2`}>{bu}</span>
                  {group.length}명 취소
                </h4>
                <div className="space-y-1">
                  {group.map(r => (
                    <div key={r.id} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-medium">{r.name}</span>
                      {r.grade > 0 && <span className="text-slate-400">{r.grade}학년 {r.class}반</span>}
                      {r.reason && <span className="text-slate-400 ml-auto">({r.reason})</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
