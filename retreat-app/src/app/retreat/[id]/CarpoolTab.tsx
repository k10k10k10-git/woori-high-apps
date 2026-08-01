"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import { Retreat, CarPool, Participant } from "@/lib/types";
import { getCarpools, saveCarpool, updateCarpool, deleteCarpool, getParticipants } from "@/lib/db";
import { useUI } from "@/context/UIContext";
import { useSubmitLock } from "@/lib/useSubmitLock";
import NameAutocomplete from "./NameAutocomplete";

interface Props { retreat: Retreat; }

const TIME_OPTIONS = ["금요일 오후", "토요일 오전", "직접 입력"];
const EMPTY_FORM: Omit<CarPool, "id"> = {
  studentName: "", studentId: null, grade: 0, class: 0, bu: "1부",
  phone: "", pPhone: "", desiredTime: "금요일 오후", location: "", teacherDriver: "", note: "",
};

export default function CarpoolTab({ retreat }: Props) {
  const { toast, uiConfirm } = useUI();
  // 느린 네트워크에서 저장 연타 시 레코드가 중복 생성되는 것을 막는다.
  const { busy: saving, run: runSave } = useSubmitLock();
  const [carpools, setCarpools] = useState<CarPool[]>([]);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<CarPool, "id">>(EMPTY_FORM);
  const [customTime, setCustomTime] = useState("");
  const [filter, setFilter] = useState("전체");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cp, parts] = await Promise.all([getCarpools(retreat.id), getParticipants(retreat.id)]);
      setCarpools(cp);
      setParticipants(parts);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [retreat.id]);

  useEffect(() => { void load(); }, [load]);

  // 이름 자동완성 후보 — 참가자 명단 기반 (이름 + 부/학년/반 표시, 클릭 시 자동 입력)
  const suggestions = useMemo(() =>
    Object.entries(participants)
      .map(([key, p]) => ({
        key,
        name: p.name,
        bu: p.bu,
        grade: p.grade,
        classNum: p.class,
        studentId: p.studentId ?? null,
        phone: p.phone ?? "",
        pPhone: p.pPhone ?? "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [participants]);

  function selectParticipant(s: typeof suggestions[0]) {
    setForm(prev => ({
      ...prev,
      studentName: s.name,
      studentId: s.studentId,
      grade: s.grade,
      class: s.classNum,
      bu: s.bu,
      // 이미 손으로 적어둔 연락처는 덮지 않는다
      phone: prev.phone || s.phone,
      pPhone: prev.pPhone || s.pPhone,
    }));
  }

  async function handleSave() {
    if (!form.studentName.trim()) return toast("학생 이름을 입력해주세요.", "warning");
    const finalTime = form.desiredTime === "직접 입력" ? customTime : form.desiredTime;
    const data = { ...form, desiredTime: finalTime };
    try {
      if (editId) {
        await updateCarpool(retreat.id, editId, data);
        setCarpools(prev => prev.map(c => c.id === editId ? { ...c, ...data } : c));
      } else {
        const id = await saveCarpool(retreat.id, data);
        setCarpools(prev => [...prev, { id, ...data }]);
      }
      setForm(EMPTY_FORM);
      setCustomTime("");
      setShowAdd(false);
      setEditId(null);
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleDelete(id: string) {
    if (!await uiConfirm("삭제하시겠습니까?")) return;
    try {
      await deleteCarpool(retreat.id, id);
      setCarpools(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function startEdit(c: CarPool) {
    const isCustom = !TIME_OPTIONS.slice(0, 2).includes(c.desiredTime);
    setForm({ ...c, desiredTime: isCustom ? "직접 입력" : c.desiredTime });
    if (isCustom) setCustomTime(c.desiredTime);
    setEditId(c.id);
    setShowAdd(true);
  }

  const filtered = carpools.filter(c => {
    if (filter === "미배정") return !c.teacherDriver;
    if (filter === "배정완료") return !!c.teacherDriver;
    if (filter === "금요일 오후" || filter === "토요일 오전") return c.desiredTime === filter;
    return true;
  });

  // 교사별 그룹핑
  const byDriver = useMemo(() => {
    const map = new Map<string, CarPool[]>();
    carpools.filter(c => c.teacherDriver).forEach(c => {
      const key = c.teacherDriver!;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return map;
  }, [carpools]);

  const unassigned = carpools.filter(c => !c.teacherDriver);

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
          <span className="text-slate-500">전체 <strong className="text-slate-800">{carpools.length}</strong></span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">금요일 <strong className="text-slate-800">{carpools.filter(c => c.desiredTime === "금요일 오후").length}</strong></span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">토요일 <strong className="text-slate-800">{carpools.filter(c => c.desiredTime === "토요일 오전").length}</strong></span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">미배정 <strong className={unassigned.length > 0 ? "text-amber-600" : "text-slate-800"}>{unassigned.length}</strong></span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {["전체", "미배정", "배정완료", "금요일 오후", "토요일 오전"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === f ? "bg-sky-600 text-white border-sky-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}>{f}</button>
          ))}
        </div>
        <button onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowAdd(true); }}
          className="btn-primary ml-auto">＋ 카풀 추가</button>
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">{editId ? "카풀 수정" : "카풀 추가"}</h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <NameAutocomplete
                  value={form.studentName}
                  onChange={v => setForm(p => ({ ...p, studentName: v }))}
                  onSelect={selectParticipant}
                  suggestions={suggestions}
                  placeholder="학생 이름 (검색 후 클릭)"
                />
                <select className="input" value={form.bu}
                  onChange={e => setForm(p => ({ ...p, bu: e.target.value }))}>
                  <option>1부</option><option>2부</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className="input" type="number" placeholder="학년" value={form.grade || ""}
                  onChange={e => setForm(p => ({ ...p, grade: parseInt(e.target.value) || 0 }))} />
                <input className="input" type="number" placeholder="반" value={form.class || ""}
                  onChange={e => setForm(p => ({ ...p, class: parseInt(e.target.value) || 0 }))} />
              </div>
              <input className="input" placeholder="학생 연락처" value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              <input className="input" placeholder="학부모 연락처" value={form.pPhone}
                onChange={e => setForm(p => ({ ...p, pPhone: e.target.value }))} />
              <select className="input" value={form.desiredTime}
                onChange={e => setForm(p => ({ ...p, desiredTime: e.target.value }))}>
                {TIME_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
              {form.desiredTime === "직접 입력" && (
                <input className="input" placeholder="출발 시간 직접 입력" value={customTime}
                  onChange={e => setCustomTime(e.target.value)} />
              )}
              <input className="input" placeholder="픽업 장소 (예: 드림센터, 정자역)" value={form.location}
                onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
              <input className="input" placeholder="배정 교사 (예: 박종국T)" value={form.teacherDriver}
                onChange={e => setForm(p => ({ ...p, teacherDriver: e.target.value }))} />
              <input className="input" placeholder="비고" value={form.note}
                onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => runSave(handleSave)} disabled={saving} className="btn-primary flex-1 justify-center">{saving ? "저장 중…" : "저장"}</button>
              <button onClick={() => { setShowAdd(false); setEditId(null); }}
                className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 미배정 목록 */}
      {filter === "전체" && unassigned.length > 0 && (
        <div className="mb-4 card p-4 border-l-4 border-yellow-400">
          <h4 className="text-sm font-semibold text-yellow-700 mb-2">⚠ 교사 미배정 ({unassigned.length}명)</h4>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(c => (
              <div key={c.id} className="bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-xs flex items-center gap-1">
                <span className="font-medium">{c.studentName}</span>
                <span className="text-slate-400">{c.desiredTime}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 교사별 카풀 그룹 */}
      {filter === "전체" && byDriver.size > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-600 mb-3">🚗 교사별 카풀 현황</h4>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from(byDriver.entries()).map(([driver, students]) => (
              <div key={driver} className="card p-3">
                <div className="font-semibold text-slate-700 text-sm mb-1">{driver}</div>
                <div className="text-xs text-slate-500 mb-2">{students[0]?.desiredTime}</div>
                <div className="space-y-1">
                  {students.map(s => (
                    <div key={s.id} className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-700">{s.studentName}</span>
                      <span className="text-slate-400">{s.grade}학년 {s.class}반</span>
                      {s.location && <span className="text-slate-400">· {s.location}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 상세 테이블 */}
      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <div className="text-3xl mb-2">🚗</div>
            <p>카풀 데이터가 없습니다.</p>
            <p className="text-sm mt-1">카풀 추가 버튼을 눌러 입력하세요.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-2.5 text-left">이름</th>
                <th className="px-4 py-2.5 text-left">부/학년반</th>
                <th className="px-4 py-2.5 text-left">출발시간</th>
                <th className="px-4 py-2.5 text-left">장소</th>
                <th className="px-4 py-2.5 text-left">배정교사</th>
                <th className="px-4 py-2.5 text-left">연락처</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{c.studentName}</td>
                  <td className="px-4 py-2.5">
                    <span className={`tag ${c.bu === "1부" ? "tag-green" : "tag-purple"} mr-1`}>{c.bu}</span>
                    <span className="text-slate-600">{c.grade > 0 ? `${c.grade}학년 ${c.class}반` : "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{c.desiredTime}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{c.location || "—"}</td>
                  <td className="px-4 py-2.5">
                    {c.teacherDriver
                      ? <span className="tag tag-purple">{c.teacherDriver}</span>
                      : <span className="tag tag-yellow">미배정</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {c.phone && <div>{c.phone}</div>}
                    {c.pPhone && <div className="text-slate-300">{c.pPhone}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(c)} className="text-xs text-slate-400 hover:text-blue-500 whitespace-nowrap">수정</button>
                      <button onClick={() => handleDelete(c.id)} className="text-xs text-slate-300 hover:text-red-400 whitespace-nowrap">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
