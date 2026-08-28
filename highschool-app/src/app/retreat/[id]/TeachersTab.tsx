"use client";
import { useEffect, useState } from "react";
import { Database } from "@phosphor-icons/react";
import { Retreat, TeacherAttendance } from "@/lib/types";
import { getTeachers, subscribeToTeachers, saveTeacher, updateTeacher, deleteTeacher, loadTeachersFromDB, getRetreats } from "@/lib/db";
import { prepareTeacherUpdate } from "@/lib/teacherWrite";
import { resolveTeacherGender } from "@/lib/teacherGender";
import {
  getTeacherSourceLabel,
  getVisibleTeacherAttendanceLabel,
  sortTeachersForTable,
  TeacherSortDirection,
  TeacherSortKey,
} from "@/lib/teacherTableSort";
import { useUI } from "@/context/UIContext";
import { useSubmitLock } from "@/lib/useSubmitLock";

interface Props { retreat: Retreat; }
type TeacherFormState = Omit<TeacherAttendance, "id">;

const STATUS_COLORS = {
  "전참": "tag-green",
  "부분참": "tag-yellow",
  "불참": "tag-red",
  "선발대": "tag-blue",
  "본대": "tag-green",
  "후발대": "tag-yellow",
};

const STAFF_ROLE_OPTIONS = ["조스탭", "조스탭 외 인원"] as const;
const STAFF_ATTENDANCE_OPTIONS = ["선발대", "본대", "후발대", "불참"] as const;
const TEACHER_ATTENDANCE_OPTIONS = ["전참", "부분참", "불참"] as const;

function isStaffBu(bu: string) {
  return bu === "스탭";
}

function deriveTeacherState(form: TeacherFormState): Pick<TeacherAttendance, "status" | "corps"> {
  if (isStaffBu(form.bu)) {
    if (form.status === "불참") {
      return { status: "불참", corps: undefined };
    }
    return { status: form.corps === "후발대" ? "부분참" : "전참", corps: form.corps || "본대" };
  }
  return { status: form.status, corps: undefined };
}

function needsScheduleDetails(form: TeacherFormState) {
  return isStaffBu(form.bu) ? form.status !== "불참" && form.corps === "후발대" : form.status === "부분참";
}

function needsTransport(form: TeacherFormState) {
  return needsScheduleDetails(form);
}

const EMPTY_FORM: TeacherFormState = {
  name: "", bu: "1부", classKey: "", status: "전참" as TeacherAttendance["status"],
  note: "", arrivalInfo: "", transport: "", gender: undefined,
  age: "",
  role: "",
  corps: "본대",
  lateArrival: "",
  programTeam: "",
  worship: false,
  source: "manual-retreat",
  originType: "manual-teacher",
};

function normalizeMatchText(value: string | undefined | null) {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function teacherExactKey(t: Pick<TeacherAttendance, "bu" | "classKey" | "name"> | { bu: string; classKey: string; name: string }) {
  return `${t.bu}-${normalizeMatchText(t.classKey)}-${normalizeMatchText(t.name)}`;
}

function teacherNameKey(t: Pick<TeacherAttendance, "bu" | "name"> | { bu: string; name: string }) {
  return `${t.bu}-${normalizeMatchText(t.name)}`;
}

export default function TeachersTab({ retreat }: Props) {
  const { toast, uiConfirm } = useUI();
  // 느린 네트워크에서 저장 연타 시 레코드가 중복 생성되는 것을 막는다.
  const { busy: saving, run: runSave } = useSubmitLock();
  const [teachers, setTeachers] = useState<TeacherAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TeacherFormState>(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [sortState, setSortState] = useState<{ key: TeacherSortKey; direction: TeacherSortDirection } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importList, setImportList] = useState<{ name: string; bu: string; classKey: string; originKey: string; gender?: "남" | "여"; selected: boolean }[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    return subscribeToTeachers(retreat.id, (list) => {
      setTeachers(list.sort((a, b) => {
        if (a.bu !== b.bu) return a.bu < b.bu ? -1 : 1;
        return a.classKey.localeCompare(b.classKey, "ko");
      }));
      setLoading(false);
    }, (error) => {
      setLoadError(error.message);
      setLoading(false);
    });
  }, [retreat.id]);

async function handleSave() {
    if (!form.name.trim()) return toast("이름을 입력해주세요.", "warning");
    const derived = deriveTeacherState(form);
    const payload: TeacherFormState = {
      ...form,
      classKey: form.bu === "스탭" && !form.classKey.trim() ? "보조스탭" : form.classKey,
      status: derived.status,
      age: form.age?.trim() || undefined,
      role: isStaffBu(form.bu) ? (form.role?.trim() || undefined) : undefined,
      corps: isStaffBu(form.bu) ? (derived.corps || "본대") : undefined,
      lateArrival: isStaffBu(form.bu) && derived.corps === "후발대" ? (form.lateArrival?.trim() || undefined) : undefined,
      programTeam: form.programTeam?.trim() || undefined,
      worship: form.worship ? true : undefined,
      arrivalInfo: needsScheduleDetails(form) ? (form.arrivalInfo?.trim() || undefined) : undefined,
      transport: needsTransport(form) ? (form.transport?.trim() || undefined) : undefined,
      gender: resolveTeacherGender(form) || undefined,
      source: form.source || (form.bu === "스탭" ? "manual-assistant" : "manual-retreat"),
      originType: form.originType || (form.bu === "스탭" ? "assistant-staff" : "manual-teacher"),
    };
    try {
      if (editId) {
        await updateTeacher(retreat.id, editId, prepareTeacherUpdate(payload));
      } else {
        await saveTeacher(retreat.id, payload);
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
      await deleteTeacher(retreat.id, id);
    } catch (e) {
      toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function startEdit(t: TeacherAttendance) {
    const inferredStatus = t.bu === "스탭"
      ? (t.status === "불참" ? "불참" : (t.corps || "본대"))
      : t.status;
    setForm({
      name: t.name,
      bu: t.bu,
      classKey: t.classKey,
      status: inferredStatus === "선발대" || inferredStatus === "본대" || inferredStatus === "후발대"
        ? (inferredStatus === "후발대" ? "부분참" : "전참")
        : inferredStatus,
      note: t.note || "",
      arrivalInfo: t.arrivalInfo || "",
      transport: t.transport || "",
      gender: resolveTeacherGender(t) || undefined,
      age: t.age || "",
      role: t.role === "조스탭" || t.role === "조스탭 외 인원" ? t.role : "",
      corps: t.bu === "스탭" ? (t.corps || "본대") : "본대",
      lateArrival: t.lateArrival || "",
      programTeam: t.programTeam || "",
      worship: !!t.worship,
      source: t.source || (t.bu === "스탭" ? "manual-assistant" : "manual-retreat"),
      originType: t.originType || (t.bu === "스탭" ? "assistant-staff" : "manual-teacher"),
    });
    setEditId(t.id);
    setShowAdd(true);
  }

  function startAddTeacher() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowAdd(true);
  }

  function startAddAssistant() {
    setForm({
      ...EMPTY_FORM,
      bu: "스탭",
      classKey: "보조스탭",
      source: "manual-assistant",
      originType: "assistant-staff",
    });
    setEditId(null);
    setShowAdd(true);
  }

  async function openImport() {
    try {
      const { teachers: dbTeachers, hasStaffNode } = await loadTeachersFromDB(retreat.year);
      const currentTeachers = await getTeachers(retreat.id);
      if (!hasStaffNode) {
        toast(`${retreat.year}년 공식스탭(teacherStaff) 데이터가 없습니다. '교사/스탭 출석부'에서 ${retreat.year}년 스탭을 먼저 등록한 뒤 불러오세요. (지금은 반교사만 표시됩니다)`, "warning");
      }

      // 이전 수련회에서 수동 등록된 비반담임 교사(부장·회계·전도사 등)를 가져오기
      const allRetreats = await getRetreats();
      const otherRetreats = allRetreats.filter(r => r.id !== retreat.id);
      const seenNames = new Set(dbTeachers.map(t => `${t.bu}-${t.name}`));
      for (const r of otherRetreats) {
        const prevTeachers = await getTeachers(r.id);
        prevTeachers.forEach(t => {
          if (t.bu === "스탭") return;
          if (/\d학년\s*\d+반/.test(t.classKey)) return;
          const key = `${t.bu}-${t.name}`;
          if (seenNames.has(key)) return;
          seenNames.add(key);
          dbTeachers.push({
            name: t.name,
            bu: t.bu,
            classKey: t.classKey,
            originKey: `prev:${t.bu}-${t.classKey}-${t.name}`,
            gender: resolveTeacherGender(t) || undefined,
          });
        });
      }

      const existingByOrigin = new Set(currentTeachers.map(t => t.originKey).filter(Boolean));
      const legacyKeys = new Set(currentTeachers.map(teacherExactKey));
      const nameKeys = new Set(currentTeachers.map(teacherNameKey));
      const list = dbTeachers.map(t => ({
        ...t,
        selected: !existingByOrigin.has(t.originKey) && !legacyKeys.has(teacherExactKey(t)) && !nameKeys.has(teacherNameKey(t)),
      }));
      setTeachers(currentTeachers.sort((a, b) => {
        if (a.bu !== b.bu) return a.bu < b.bu ? -1 : 1;
        return a.classKey.localeCompare(b.classKey, "ko");
      }));
      setImportList(list);
      setShowImport(true);
    } catch (e) {
      toast(`불러오기 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleImport() {
    const toAdd = importList.filter(t => t.selected);
    if (toAdd.length === 0) return setShowImport(false);
    setImporting(true);
    try {
      // originKey 기준 upsert: 같은 출처가 이미 있으면 갱신(개명/반변경 반영), 없으면 신규.
      // originKey 없는 레거시 교사는 부-반-이름으로 폴백 매칭해 originKey를 backfill(중복 방지).
      const currentTeachers = await getTeachers(retreat.id);
      const byOrigin = new Map(teachers.filter(t => t.originKey).map(t => [t.originKey!, t]));
      currentTeachers.filter(t => t.originKey).forEach(t => byOrigin.set(t.originKey!, t));
      const byLegacy = new Map(currentTeachers.map(t => [teacherExactKey(t), t]));
      const byName = new Map(currentTeachers.map(t => [teacherNameKey(t), t]));
      for (const t of toAdd) {
        const existing = byOrigin.get(t.originKey) ?? byLegacy.get(teacherExactKey(t)) ?? byName.get(teacherNameKey(t));
        if (existing) {
          // 이름/부/반만 출석부 원본 기준으로 갱신, 나머지 수련회 입력값은 보존
          const sourceGender = t.gender || resolveTeacherGender(existing) || undefined;
          await updateTeacher(retreat.id, existing.id, { name: t.name, bu: t.bu, classKey: t.classKey, originKey: t.originKey, ...(sourceGender ? { gender: sourceGender } : {}) });
          continue;
        }
        const payload: TeacherFormState = {
          name: t.name,
          bu: t.bu,
          classKey: t.classKey,
          status: "전참",
          note: "",
          arrivalInfo: "",
          transport: "",
          gender: t.gender,
          source: "attendance-db",
          originType: t.bu === "스탭" ? "official-staff" : "class-teacher",
          originKey: t.originKey,
        };
        await saveTeacher(retreat.id, payload);
      }
      setShowImport(false);
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setImporting(false);
    }
  }

  const matchingTeachers = teachers.filter(t => {
    if (buFilter !== "전체" && t.bu !== buFilter) return false;
    if (statusFilter !== "전체" && t.status !== statusFilter) return false;
    if (search && !t.name.includes(search) && !t.classKey.includes(search)) return false;
    return true;
  });
  const filtered = sortState
    ? sortTeachersForTable(matchingTeachers, sortState.key, sortState.direction)
    : matchingTeachers;

  function toggleSort(key: TeacherSortKey) {
    setSortState(current => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  const sortableHeaders: { key: TeacherSortKey; label: string }[] = [
    { key: "name", label: "이름" },
    { key: "source", label: "출처" },
    { key: "bu", label: "부" },
    { key: "gender", label: "성별" },
    { key: "classKey", label: "담당반" },
    { key: "attendance", label: "참석" },
    { key: "schedule", label: "이동/일정" },
    { key: "note", label: "비고" },
  ];

  const stats = teachers.reduce(
    (acc, t) => { acc[t.status as keyof typeof acc]++; acc.total++; return acc; },
    { total: 0, 전참: 0, 부분참: 0, 불참: 0 }
  );

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}
      {/* Controls */}
      <div className="space-y-2 sm:space-y-0 mb-4">
        {/* 상단: 통계 + 검색 */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm mr-1">
            <span className="text-slate-500">전체 <strong className="text-slate-800">{stats.total}</strong></span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">전참 <strong className="text-green-700">{stats.전참}</strong></span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">부분참 <strong className="text-yellow-700">{stats.부분참}</strong></span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">불참 <strong className="text-red-600">{stats.불참}</strong></span>
          </div>
          <input className="input w-full sm:w-[140px] order-last sm:order-none" placeholder="이름/반 검색" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        {/* 중단: 필터 */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {["전체", "1부", "2부", "스탭"].map(f => (
              <button key={f} onClick={() => setBuFilter(f)}
                className={`px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                  buFilter === f ? "bg-sky-600 text-white border-sky-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}>{f}</button>
            ))}
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {["전체", "전참", "부분참", "불참"].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                  statusFilter === f ? "bg-sky-600 text-white border-sky-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}>{f}</button>
            ))}
          </div>
        </div>
        {/* 하단: 버튼 */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={openImport} className="btn-secondary text-xs sm:text-sm"><Database aria-hidden="true" size={16} />DB에서 불러오기</button>
          <div className="ml-auto flex gap-2">
            <button onClick={startAddAssistant} className="btn-secondary text-xs sm:text-sm">＋ 보조스탭</button>
            <button onClick={startAddTeacher} className="btn-primary text-xs sm:text-sm">＋ 교사 추가</button>
          </div>
        </div>
      </div>

      {/* DB 불러오기 모달 */}
      {showImport && (
        <div role="dialog" aria-modal="true" aria-label="출석부 DB에서 교사 불러오기" className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-1">출석부 DB에서 교사 불러오기</h3>
            <p className="text-sm text-slate-500 mb-4">{retreat.year}년도 출석부 DB에서 교사 명단을 가져옵니다. 이미 추가된 교사는 체크 해제되어 있습니다.</p>
            {importList.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">DB에서 교사 데이터를 찾을 수 없습니다.</p>
            ) : (
              <>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setImportList(l => l.map(t => ({ ...t, selected: true })))} className="text-xs text-blue-500 hover:underline">전체 선택</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={() => setImportList(l => l.map(t => ({ ...t, selected: false })))} className="text-xs text-slate-400 hover:underline">전체 해제</button>
                  <span className="ml-auto text-xs text-slate-400">{importList.filter(t => t.selected).length}명 선택됨</span>
                </div>
                <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                  {importList.map((t, i) => (
                    <label key={`${t.bu}-${t.classKey}-${t.name}-${i}`} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50 ${t.selected ? "" : "opacity-50"}`}>
                      <input type="checkbox" checked={t.selected} onChange={e => setImportList(l => l.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))} />
                      <span className={`tag ${t.bu === "1부" ? "tag-green" : t.bu === "2부" ? "tag-purple" : "tag-blue"}`}>{t.bu}</span>
                      <span className="text-sm font-medium text-slate-700">{t.name}</span>
                      <span className="text-xs text-slate-400">{t.classKey}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={handleImport} disabled={importing || importList.filter(t => t.selected).length === 0}
                className="btn-primary flex-1 justify-center">{importing ? "추가 중..." : `${importList.filter(t => t.selected).length}명 추가`}</button>
              <button onClick={() => setShowImport(false)} className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAdd && (
        <div role="dialog" aria-modal="true" aria-label="교사 편집" className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden">
            <h3 className="font-bold text-lg px-6 pt-6 pb-3 shrink-0">
              {editId ? "교사 수정" : form.source === "manual-assistant" ? "보조스탭 추가" : "교사 추가"}
            </h3>
            <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-3 pb-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className="input" placeholder="이름" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                <select className="input" value={form.bu}
                  onChange={e => {
                    const nextBu = e.target.value;
                    setForm(p => {
                      const nextManualType = nextBu === "스탭"
                        ? { source: "manual-assistant" as const, originType: "assistant-staff" as const, classKey: p.classKey || "보조스탭" }
                        : { source: "manual-retreat" as const, originType: "manual-teacher" as const, classKey: p.classKey === "보조스탭" ? "" : p.classKey };
                      return {
                        ...p,
                        bu: nextBu,
                        status: nextBu === "스탭" ? "전참" : "전참",
                        corps: nextBu === "스탭" ? "본대" : "본대",
                        lateArrival: nextBu === "스탭" ? p.lateArrival : "",
                        arrivalInfo: "",
                        transport: "",
                        role: nextBu === "스탭" ? p.role : "",
                        ...(p.source === "attendance-db" ? {} : nextManualType),
                      };
                    });
                  }}>
                  <option>1부</option><option>2부</option><option>스탭</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className="input" placeholder={form.bu === "스탭" ? "직함/구분 (예: 보조스탭, 사진팀)" : "담당 학년반 (예: 1학년 1반)"} value={form.classKey}
                  onChange={e => setForm(p => ({ ...p, classKey: e.target.value }))} />
                <select className="input" value={form.gender || ""} onChange={e => setForm(p => ({ ...p, gender: e.target.value === "남" || e.target.value === "여" ? e.target.value : undefined }))}>
                  <option value="">성별 선택</option>
                  <option value="남">남</option>
                  <option value="여">여</option>
                </select>
              </div>
              {!resolveTeacherGender(form) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  남녀 분리 버스 자동배정을 사용하려면 교사 성별을 선택해주세요.
                </div>
              )}
              {form.source === "manual-assistant" && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  이 항목은 <strong>수련회 전용 보조스탭</strong>으로 저장됩니다. 출석부 연도 원본에는 쓰지 않고, 현재 수련회 명단과 이가드에만 반영됩니다.
                </div>
              )}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500">
                  {isStaffBu(form.bu) ? "스탭 참석 구분" : "교사 참석 구분"}
                </div>
                <div className="flex gap-2">
                  {(isStaffBu(form.bu) ? STAFF_ATTENDANCE_OPTIONS : TEACHER_ATTENDANCE_OPTIONS).map(s => {
                    const staffOption = s as typeof STAFF_ATTENDANCE_OPTIONS[number];
                    const active = isStaffBu(form.bu)
                      ? (staffOption === "불참" ? form.status === "불참" : (form.corps || "본대") === staffOption && form.status !== "불참")
                      : form.status === s;
                    const activeClass =
                      s === "불참" ? "bg-red-100 border-red-400 text-red-700" :
                      s === "부분참" || s === "후발대" ? "bg-yellow-100 border-yellow-400 text-yellow-700" :
                      s === "선발대" ? "bg-blue-100 border-blue-400 text-blue-700" :
                      "bg-green-100 border-green-400 text-green-700";
                    return (
                      <button
                        key={s}
                        onClick={() => {
                          if (isStaffBu(form.bu)) {
                            setForm(p => ({
                              ...p,
                              status: staffOption === "불참" ? "불참" : (staffOption === "후발대" ? "부분참" : "전참"),
                              corps: staffOption === "불참" ? undefined : staffOption,
                            }));
                            return;
                          }
                          setForm(p => ({ ...p, status: s as TeacherAttendance["status"] }));
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          active ? activeClass : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              {needsScheduleDetails(form) && (
                <input className="input" placeholder="도착/출발 정보 (예: 금 오후 도착, 토 오전 드림센터)"
                  value={form.arrivalInfo} onChange={e => setForm(p => ({ ...p, arrivalInfo: e.target.value }))} />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="input"
                  placeholder="나이/연생 (예: 96)"
                  value={form.age || ""}
                  onChange={e => setForm(p => ({ ...p, age: e.target.value }))}
                />
                {isStaffBu(form.bu) ? (
                  <select
                    className="input"
                    value={form.role || ""}
                    onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                  >
                    <option value="">역할 선택</option>
                    {STAFF_ROLE_OPTIONS.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">
                    교사는 역할 선택 없음
                  </div>
                )}
              </div>
              {isStaffBu(form.bu) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    본대 여부: <strong>{form.status === "불참" ? "불참" : (form.corps || "본대")}</strong>
                  </div>
                  <input
                    className="input"
                    placeholder="후발 입소 (예: 토 아침)"
                    value={form.lateArrival || ""}
                    disabled={form.corps !== "후발대" || form.status === "불참"}
                    onChange={e => setForm(p => ({ ...p, lateArrival: e.target.value }))}
                  />
                </div>
              )}
              <input
                className="input"
                placeholder="프로그램팀 (예: 4층 진행)"
                value={form.programTeam || ""}
                onChange={e => setForm(p => ({ ...p, programTeam: e.target.value }))}
              />
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={!!form.worship}
                  onChange={e => setForm(p => ({ ...p, worship: e.target.checked }))}
                />
                찬양팀
              </label>
              {needsTransport(form) && (
                <input className="input" placeholder="이동방법 (예: 자차, 카풀, 대중교통)"
                  value={form.transport} onChange={e => setForm(p => ({ ...p, transport: e.target.value }))} />
              )}
              <input className="input" placeholder="비고" value={form.note}
                onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
            </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
              <button onClick={() => runSave(handleSave)} disabled={saving} className="btn-primary flex-1 justify-center">{saving ? "저장 중…" : "저장"}</button>
              <button onClick={() => { setShowAdd(false); setEditId(null); }}
                className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <div className="text-3xl mb-2">👨‍🏫</div>
            <p>교사 데이터가 없습니다.</p>
            <p className="text-sm mt-1">교사 추가 버튼을 눌러 입력하세요.</p>
          </div>
        ) : (
          <table className="w-full text-xs sm:text-sm min-w-[600px] sm:min-w-0">
            <thead>
              <tr className="table-header">
                {sortableHeaders.map(({ key, label }) => {
                  const active = sortState?.key === key;
                  return (
                    <th
                      key={key}
                      className="px-2 sm:px-4 py-2 sm:py-2.5 text-left whitespace-nowrap"
                      aria-sort={active ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className="inline-flex items-center gap-1 select-none hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
                        title={`${label} ${active && sortState.direction === "asc" ? "내림차순" : "오름차순"} 정렬`}
                      >
                        <span>{label}</span>
                        <span className={active ? "text-blue-600" : "text-slate-300"} aria-hidden="true">
                          {active ? (sortState.direction === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th className="px-2 sm:px-4 py-2 sm:py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-2 sm:px-4 py-2 sm:py-2.5 font-medium text-slate-800 whitespace-nowrap">{t.name}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-2.5">
                    <span className={`tag ${
                      t.source === "attendance-db" ? "tag-green" :
                      t.source === "manual-assistant" ? "tag-purple" :
                      "tag-yellow"
                    }`}>
                      {getTeacherSourceLabel(t)}
                    </span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-2.5">
                    <span className={`tag ${t.bu === "1부" ? "tag-green" : t.bu === "2부" ? "tag-purple" : "tag-blue"}`}>{t.bu}</span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-slate-600">{resolveTeacherGender(t) || "-"}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-slate-600 whitespace-nowrap">{t.classKey || "-"}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-2.5">
                    <span className={`tag ${STATUS_COLORS[getVisibleTeacherAttendanceLabel(t)]}`}>
                      {getVisibleTeacherAttendanceLabel(t)}
                    </span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-slate-500 text-xs whitespace-nowrap">
                    {t.arrivalInfo && <div>{t.arrivalInfo}</div>}
                    {t.lateArrival && <div>입소: {t.lateArrival}</div>}
                    {t.transport && <div className="text-slate-400">{t.transport}</div>}
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-slate-400 text-xs">{t.note || "-"}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-2.5">
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(t)} className="text-slate-400 hover:text-blue-500 text-xs whitespace-nowrap">수정</button>
                      <button onClick={() => handleDelete(t.id)} className="text-slate-300 hover:text-red-400 text-xs whitespace-nowrap">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 부분참 요약 */}
      {teachers.filter(t => t.status === "부분참").length > 0 && (
        <div className="mt-4 card p-4">
          <h4 className="text-sm font-semibold text-slate-600 mb-3">⏰ 부분 참석/후발대 일정 요약</h4>
          <div className="space-y-1.5">
            {teachers.filter(t => t.status === "부분참").map(t => (
              <div key={t.id} className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                <span className={`tag ${t.bu === "1부" ? "tag-green" : t.bu === "2부" ? "tag-purple" : "tag-blue"} text-[10px]`}>{t.bu}</span>
                <span className="font-medium text-slate-700">{t.name}</span>
                <span className="text-slate-500">{t.classKey}</span>
                <span className={`tag ${STATUS_COLORS[getVisibleTeacherAttendanceLabel(t)]}`}>{getVisibleTeacherAttendanceLabel(t)}</span>
                {t.arrivalInfo && <span className="text-slate-400 text-xs">· {t.arrivalInfo}</span>}
                {t.lateArrival && <span className="text-slate-400 text-xs">· 입소 {t.lateArrival}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
