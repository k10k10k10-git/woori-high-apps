"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { Retreat, MedicalLog, Participant } from "@/lib/types";
import {
  subscribeToMedicalLogs, saveMedicalLog, updateMedicalLog, deleteMedicalLog,
  getMedicinePresets, saveMedicinePresets, getParticipants,
} from "@/lib/db";
import { useUI } from "@/context/UIContext";
import { saveWorkbook } from "@/lib/exportUtils";
import * as XLSX from "xlsx";

const OUTCOME_PRESETS = ["약 처방 후 복귀", "휴식 권고", "보호자 연락", "병원 이송", "관찰 중"];

const DAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const day = DAY[d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}(${day}) ${hh}:${mi}`;
}

function outcomeColor(outcome: string): string {
  if (outcome === "병원 이송") return "bg-red-100 text-red-700 border-red-200";
  if (outcome === "보호자 연락") return "bg-orange-100 text-orange-700 border-orange-200";
  if (outcome === "관찰 중") return "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (outcome === "휴식 권고") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-green-50 text-green-700 border-green-200";
}

interface Props { retreat: Retreat; }

const EMPTY_FORM = {
  name: "", bu: "", grade: "", classNum: "",
  symptoms: "", medicines: [] as string[], outcome: "", note: "",
};

interface ParticipantSuggestion {
  name: string;
  bu: string;
  grade: number;
  classNum: number;
}

// ── 이름 자동완성 컴포넌트 ───────────────────────────────────
function NameAutocomplete({
  value, onChange, onSelect, suggestions, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: ParticipantSuggestion) => void;
  suggestions: ParticipantSuggestion[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim();
    if (!q) return suggestions.slice(0, 8); // 부서+학년+반 선택된 경우 전체 표시
    return suggestions.filter(s => s.name.includes(q)).slice(0, 8);
  }, [value, suggestions]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        className="input text-sm w-full"
        placeholder={placeholder ?? "이름 *"}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (filtered.length > 0) setOpen(true); }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((s, i) => (
            <li key={i}>
              <button type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                onMouseDown={e => { e.preventDefault(); onSelect(s); setOpen(false); }}>
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-slate-400">{s.bu} {s.grade}학년 {s.classNum}반</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 폼 서브컴포넌트 (hooks 규칙 준수를 위해 분리) ──────────────
function MedicalForm({
  f, setF, presets, suggestions,
  onSubmit, onCancel, submitLabel, submitting,
  onOpenPresets,
}: {
  f: typeof EMPTY_FORM;
  setF: (v: typeof EMPTY_FORM) => void;
  presets: string[];
  suggestions: ParticipantSuggestion[];
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
  onOpenPresets: () => void;
}) {
  // 부서+학년 기준 반 목록
  const availableClasses = useMemo(() => {
    if (!f.bu || !f.grade) return [] as number[];
    const g = Number(f.grade);
    return [...new Set(
      suggestions.filter(s => s.bu === f.bu && s.grade === g).map(s => s.classNum)
    )].sort((a, b) => a - b);
  }, [f.bu, f.grade, suggestions]);

  // 부서+학년+반 모두 선택 시 해당 학생만
  const nameSuggestions = useMemo(() => {
    if (!f.bu || !f.grade || !f.classNum) return suggestions;
    const g = Number(f.grade);
    const c = Number(f.classNum);
    return suggestions.filter(s => s.bu === f.bu && s.grade === g && s.classNum === c);
  }, [f.bu, f.grade, f.classNum, suggestions]);

  function toggleMed(med: string) {
    const next = f.medicines.includes(med)
      ? f.medicines.filter(m => m !== med)
      : [...f.medicines, med];
    setF({ ...f, medicines: next });
  }

  return (
    <div className="space-y-3">
      {/* 부서 → 학년 → 반 */}
      <div className="grid grid-cols-3 gap-2">
        <select className="input text-sm" value={f.bu}
          onChange={e => setF({ ...f, bu: e.target.value, grade: "", classNum: "", name: "" })}>
          <option value="">부서 선택</option>
          <option value="1부">1부</option>
          <option value="2부">2부</option>
        </select>
        <select className="input text-sm" value={f.grade} disabled={!f.bu}
          onChange={e => setF({ ...f, grade: e.target.value, classNum: "", name: "" })}>
          <option value="">학년 선택</option>
          {[1, 2, 3].map(g => <option key={g} value={g}>{g}학년</option>)}
        </select>
        <select className="input text-sm" value={f.classNum}
          disabled={!f.grade || availableClasses.length === 0}
          onChange={e => setF({ ...f, classNum: e.target.value, name: "" })}>
          <option value="">반 선택</option>
          {availableClasses.map(c => <option key={c} value={c}>{c}반</option>)}
        </select>
      </div>

      {/* 이름 */}
      <NameAutocomplete
        value={f.name}
        onChange={v => setF({ ...f, name: v })}
        onSelect={s => setF({ ...f, name: s.name, bu: s.bu, grade: String(s.grade), classNum: String(s.classNum) })}
        suggestions={nameSuggestions}
        placeholder={f.bu && f.grade && f.classNum ? "이름 선택 또는 직접 입력 *" : "이름 *"}
      />

      {/* 증상 */}
      <textarea className="input text-sm resize-none" rows={2} placeholder="증상 설명 *"
        value={f.symptoms} onChange={e => setF({ ...f, symptoms: e.target.value })} />

      {/* 처방 약 */}
      <div>
        <p className="text-xs text-slate-500 mb-1.5">처방한 약 (복수 선택 가능)</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {presets.map(med => (
            <button key={med} type="button" onClick={() => toggleMed(med)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                f.medicines.includes(med)
                  ? "border-transparent text-white"
                  : "border-slate-300 text-slate-600 hover:border-slate-400"
              }`}
              style={f.medicines.includes(med) ? { background: "var(--color-primary)" } : {}}>
              {med}
            </button>
          ))}
          <button type="button" onClick={onOpenPresets}
            className="text-xs px-2 py-1 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600 transition-colors">
            ✎ 편집
          </button>
        </div>
      </div>

      {/* 처리 결과 */}
      <div>
        <p className="text-xs text-slate-500 mb-1.5">처리 결과 *</p>
        <div className="flex flex-wrap gap-1.5">
          {OUTCOME_PRESETS.map(o => (
            <button key={o} type="button"
              onClick={() => setF({ ...f, outcome: o })}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                f.outcome === o
                  ? `${outcomeColor(o)} font-semibold`
                  : "border-slate-200 text-slate-500 hover:border-slate-400"
              }`}>
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* 메모 */}
      <input className="input text-sm" placeholder="추가 메모 (선택)"
        value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />

      <div className="flex gap-2 pt-1">
        <button onClick={onSubmit} disabled={submitting} className="btn-primary flex-1 justify-center text-sm">
          {submitting ? "저장 중..." : submitLabel}
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">취소</button>
      </div>
    </div>
  );
}

export default function MedicalLogTab({ retreat }: Props) {
  const { toast, uiConfirm } = useUI();

  const [logs, setLogs]             = useState<MedicalLog[]>([]);
  const [presets, setPresets]       = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<ParticipantSuggestion[]>([]);
  const [loadError, setLoadError]   = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);

  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);

  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetDraft, setPresetDraft]         = useState<string[]>([]);
  const [newPreset, setNewPreset]             = useState("");
  const [savingPresets, setSavingPresets]     = useState(false);

  useEffect(() => {
    let alive = true;
    setLoadError(null);

    getMedicinePresets(retreat.id)
      .then(p => { if (alive) setPresets(p); })
      .catch(() => {
        if (alive) toast("약 목록을 불러오지 못했습니다. 기본 목록으로 진행합니다.", "warning");
      });

    getParticipants(retreat.id).then(rec => {
      if (!alive) return;
      const list: ParticipantSuggestion[] = Object.values(rec as Record<string, Participant>).map(p => ({
        name:     p.name,
        bu:       p.bu,
        grade:    p.grade,
        classNum: p.class,
      }));
      const seen = new Set<string>();
      setSuggestions(list.filter(s => {
        const key = `${s.name}-${s.bu}-${s.grade}-${s.classNum}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    }).catch(e => {
      if (alive) setLoadError(e instanceof Error ? e.message : "참가자 데이터를 불러오지 못했습니다.");
    });

    try {
      const unsub = subscribeToMedicalLogs(retreat.id, list => {
        if (alive) setLogs(list);
      });
      return () => { alive = false; unsub(); };
    } catch (e) {
      if (alive) setLoadError(e instanceof Error ? e.message : "의료 기록을 불러오지 못했습니다.");
      return () => { alive = false; };
    }
  }, [retreat.id, toast]);

  function handleExport() {
    if (logs.length === 0) return toast("내보낼 기록이 없습니다.", "warning");
    const rows = logs.map(l => ({
      "시각":      formatTime(l.createdAt),
      "이름":      l.name,
      "부서":      l.bu ?? "",
      "학년":      l.grade ?? "",
      "반":        l.classNum ?? "",
      "증상":      l.symptoms,
      "처방 약":   l.medicines.join(", "),
      "처리 결과": l.outcome,
      "메모":      l.note ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [10, 8, 6, 4, 4, 30, 20, 12, 20].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "의료일지");
    saveWorkbook(wb, `${retreat.name}_의료일지`);
  }

  async function handleSave() {
    if (!form.name.trim()) return toast("이름을 입력해주세요.", "warning");
    if (!form.symptoms.trim()) return toast("증상을 입력해주세요.", "warning");
    if (!form.outcome) return toast("처리 결과를 선택해주세요.", "warning");
    setSaving(true);
    try {
      await saveMedicalLog(retreat.id, {
        name:      form.name.trim(),
        bu:        form.bu || undefined,
        grade:     form.grade ? Number(form.grade) : undefined,
        classNum:  form.classNum ? Number(form.classNum) : undefined,
        symptoms:  form.symptoms.trim(),
        medicines: form.medicines,
        outcome:   form.outcome,
        note:      form.note.trim() || undefined,
        createdAt: Date.now(),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch { toast("저장 중 오류가 발생했습니다.", "error"); }
    finally { setSaving(false); }
  }

  function openEdit(log: MedicalLog) {
    setEditingId(log.id);
    setEditForm({
      name:      log.name,
      bu:        log.bu ?? "",
      grade:     log.grade ? String(log.grade) : "",
      classNum:  log.classNum ? String(log.classNum) : "",
      symptoms:  log.symptoms,
      medicines: [...log.medicines],
      outcome:   log.outcome,
      note:      log.note ?? "",
    });
  }

  async function handleEditSave() {
    if (!editingId || editSaving) return;
    if (!editForm.name.trim()) return toast("이름을 입력해주세요.", "warning");
    if (!editForm.symptoms.trim()) return toast("증상을 입력해주세요.", "warning");
    if (!editForm.outcome) return toast("처리 결과를 선택해주세요.", "warning");
    setEditSaving(true);
    try {
      await updateMedicalLog(retreat.id, editingId, {
        name:      editForm.name.trim(),
        bu:        editForm.bu || undefined,
        grade:     editForm.grade ? Number(editForm.grade) : undefined,
        classNum:  editForm.classNum ? Number(editForm.classNum) : undefined,
        symptoms:  editForm.symptoms.trim(),
        medicines: editForm.medicines,
        outcome:   editForm.outcome,
        note:      editForm.note.trim() || undefined,
      });
      setEditingId(null);
    } catch { toast("저장 중 오류가 발생했습니다.", "error"); }
    finally { setEditSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!await uiConfirm("이 의료 기록을 삭제하시겠습니까?")) return;
    try { await deleteMedicalLog(retreat.id, id); }
    catch { toast("삭제 중 오류가 발생했습니다.", "error"); }
  }

  async function handleSavePresets() {
    setSavingPresets(true);
    const filtered = presetDraft.map(s => s.trim()).filter(Boolean);
    try {
      await saveMedicinePresets(retreat.id, filtered);
      setPresets(filtered);
      setShowPresetModal(false);
    } catch { toast("저장 중 오류가 발생했습니다.", "error"); }
    finally { setSavingPresets(false); }
  }

  const stats = useMemo(() => {
    const total = logs.length;
    const hospital = logs.filter(l => l.outcome === "병원 이송").length;
    const medCount: Record<string, number> = {};
    logs.forEach(l => l.medicines.forEach(m => { medCount[m] = (medCount[m] ?? 0) + 1; }));
    const medList = Object.entries(medCount).sort((a, b) => b[1] - a[1]);
    return { total, hospital, medList };
  }, [logs]);

  const commonFormProps = { presets, suggestions, onOpenPresets: () => { setPresetDraft([...presets]); setShowPresetModal(true); } };

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      {/* 상단 집계 + 버튼 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">총 <strong>{stats.total}</strong>건</span>
          {stats.hospital > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-semibold">
              병원 이송 {stats.hospital}건
            </span>
          )}
          {stats.medList.map(([med, cnt]) => (
            <span key={med} className="text-xs px-2 py-0.5 rounded-full border border-slate-200 text-slate-600">
              {med} <span className="font-semibold" style={{ color: "var(--color-primary)" }}>{cnt}</span>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          {logs.length > 0 && (
            <button onClick={handleExport} className="btn-secondary text-sm">↓ 엑셀</button>
          )}
          <button onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }} className="btn-primary text-sm">
            ＋ 기록 추가
          </button>
        </div>
      </div>

      {/* 기록 추가 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-800">새 의료 기록</h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <MedicalForm
              {...commonFormProps}
              f={form} setF={setForm}
              onSubmit={handleSave} onCancel={() => setShowForm(false)}
              submitLabel="기록 저장" submitting={saving}
            />
          </div>
        </div>
      )}

      {/* 일지 목록 */}
      {logs.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-3xl mb-2">💊</div>
          <p className="text-slate-500 text-sm">아직 의료 기록이 없습니다.</p>
          <p className="text-slate-400 text-xs mt-1">증상을 호소하는 친구가 오면 기록해두세요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="card p-4">
              {editingId === log.id ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-500">기록 수정</span>
                    <span className="text-xs text-slate-400">{formatTime(log.createdAt)}</span>
                  </div>
                  <MedicalForm
                    {...commonFormProps}
                    f={editForm} setF={setEditForm}
                    onSubmit={handleEditSave} onCancel={() => setEditingId(null)}
                    submitLabel="수정 완료" submitting={editSaving}
                  />
                </>
              ) : (
                <div className="flex items-start gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold shrink-0 mt-0.5 text-center ${outcomeColor(log.outcome)}`}
                    style={{ minWidth: "6.5rem" }}>
                    {log.outcome}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-slate-800 text-sm">{log.name}</span>
                      {(log.bu || log.grade) && (
                        <span className="text-xs text-slate-500">
                          {[log.bu, log.grade && `${log.grade}학년`, log.classNum && `${log.classNum}반`].filter(Boolean).join(" ")}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 ml-auto">{formatTime(log.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-700 mb-1.5">{log.symptoms}</p>
                    {log.medicines.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {log.medicines.map(m => (
                          <span key={m} className="text-xs px-2 py-0.5 rounded-full border text-white"
                            style={{ background: "var(--color-primary)", borderColor: "var(--color-primary)" }}>
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                    {log.note && <p className="text-xs text-slate-400 italic">{log.note}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEdit(log)} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">수정</button>
                    <button onClick={() => handleDelete(log.id)} className="text-xs text-red-300 hover:text-red-600 transition-colors">삭제</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 약 프리셋 편집 모달 */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">약 목록 편집</h3>
              <button onClick={() => setShowPresetModal(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
              {presetDraft.map((med, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input text-sm flex-1" value={med}
                    onChange={e => setPresetDraft(d => d.map((x, j) => j === i ? e.target.value : x))} />
                  <button onClick={() => setPresetDraft(d => d.filter((_, j) => j !== i))}
                    className="text-red-300 hover:text-red-600 text-lg leading-none transition-colors shrink-0">×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mb-4">
              <input className="input text-sm flex-1" placeholder="새 약 이름"
                value={newPreset} onChange={e => setNewPreset(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newPreset.trim()) {
                    setPresetDraft(d => [...d, newPreset.trim()]); setNewPreset("");
                  }
                }} />
              <button onClick={() => {
                if (newPreset.trim()) { setPresetDraft(d => [...d, newPreset.trim()]); setNewPreset(""); }
              }} className="btn-primary text-sm px-3">추가</button>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSavePresets} disabled={savingPresets} className="btn-primary flex-1 justify-center">
                {savingPresets ? "저장 중..." : "저장"}
              </button>
              <button onClick={() => setShowPresetModal(false)} className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
