"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Retreat, MealSlot, MealAdjustment, MealRoleCounts, MealPersonAssignment, MealRole,
  RetreatPeriod, TeacherAttendance, Participant, PartialAttendance, Student,
} from "@/lib/types";
import {
  getMealCount, saveMealCount, getParticipants, getCellColors, getTeachers,
  getPartialAttendances, getStudentsByYear, subscribeToRetreatPeriods,
} from "@/lib/db";
import { toYMD } from "@/lib/dateFormat";
import { useUI } from "@/context/UIContext";
import { buildMealPartialPeople } from "@/lib/mealCountPeople";

// DB에서 끌어온 후발/선복귀 대상자 한 명 (교사 부분참 · 스탭 후발대/부분참 · 학생 부분참)
interface DbPerson {
  key: string;          // "t_{teacherId}" | "s_{studentKey}"
  role: MealRole;       // staff | teacher | student
  bu: string;           // "1부" | "2부" | "스탭"
  name: string;
  affiliation: string;  // 반/직함 표시용
  detail: string;       // 일정 텍스트 (arrivalInfo / lateArrival / 부분참 note)
  defaultKind: "후발" | "선복귀";
}

interface Props { retreat: Retreat; }

const EMPTY_COUNTS: MealRoleCounts = { staff: 0, teacher: 0, minister: 0, student: 0, extra: 0 };
const ROLE_LABELS: { key: keyof MealRoleCounts; label: string }[] = [
  { key: "staff", label: "스탭" },
  { key: "teacher", label: "교사" },
  { key: "minister", label: "교역자" },
  { key: "student", label: "학생" },
  { key: "extra", label: "기타" },
];
const MEAL_NAME_ORDER: Record<string, number> = { "아침": 0, "점심": 1, "저녁": 2 };
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function sumCounts(c: MealRoleCounts): number {
  return (c.staff || 0) + (c.teacher || 0) + (c.minister || 0) + (c.student || 0) + (c.extra || 0);
}

function fmtDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
}

function sortMeals(meals: MealSlot[]): MealSlot[] {
  return [...meals].sort((a, b) =>
    a.date.localeCompare(b.date) || (MEAL_NAME_ORDER[a.name] ?? 9) - (MEAL_NAME_ORDER[b.name] ?? 9));
}

// 수련회 기간(여러 부 합산 최소~최대 날짜)에서 기본 끼니 목록 생성
// 첫날: 점심·저녁 / 중간: 아침·점심·저녁 / 마지막날: 아침·점심 — 이후 수동 편집 가능
function generateMealsFromPeriods(periods: RetreatPeriod[]): MealSlot[] {
  if (periods.length === 0) return [];
  const start = periods.reduce((m, p) => p.startDate < m ? p.startDate : m, periods[0].startDate);
  const end = periods.reduce((m, p) => p.endDate > m ? p.endDate : m, periods[0].endDate);
  const out: MealSlot[] = [];
  const d = new Date(`${start}T00:00:00`);
  const endD = new Date(`${end}T00:00:00`);
  let i = 0;
  while (d <= endD && i < 14) {
    const date = toYMD(d);
    const isFirst = date === start;
    const isLast = date === end;
    const names = isFirst ? ["점심", "저녁"] : isLast ? ["아침", "점심"] : ["아침", "점심", "저녁"];
    names.forEach(name => out.push({ id: `m_${date}_${name}`, date, name }));
    d.setDate(d.getDate() + 1);
    i++;
  }
  return out;
}

export default function MealCountTab({ retreat }: Props) {
  const { toast, uiConfirm } = useUI();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [base, setBase] = useState<MealRoleCounts>(EMPTY_COUNTS);
  const [extraLabel, setExtraLabel] = useState("음향/조명");
  const [meals, setMeals] = useState<MealSlot[]>([]);
  const [adjustments, setAdjustments] = useState<MealAdjustment[]>([]);
  const [personAssignments, setPersonAssignments] = useState<Record<string, MealPersonAssignment>>({});
  const [periods, setPeriods] = useState<RetreatPeriod[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  // DB 명단 원본 (교사/스탭 + 학생 부분참)
  const [dbTeachers, setDbTeachers] = useState<TeacherAttendance[]>([]);
  const [dbParticipants, setDbParticipants] = useState<Record<string, Participant>>({});
  const [dbStudents, setDbStudents] = useState<Record<string, Student>>({});
  const [dbPartials, setDbPartials] = useState<PartialAttendance[]>([]);
  const [dbListError, setDbListError] = useState<string | null>(null);

  // 새 끼니 추가 입력
  const [newMeal, setNewMeal] = useState({ date: "", name: "점심" });

  const loadDbList = useCallback(async () => {
    setDbListError(null);
    try {
      const [teachers, parts, students, partials] = await Promise.all([
        getTeachers(retreat.id), getParticipants(retreat.id), getStudentsByYear(retreat.year),
        getPartialAttendances(retreat.id),
      ]);
      setDbTeachers(teachers);
      setDbParticipants(parts);
      setDbStudents(students);
      setDbPartials(partials);
    } catch (e) {
      setDbListError(e instanceof Error ? e.message : String(e));
    }
  }, [retreat.id, retreat.year]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getMealCount(retreat.id);
      if (data) {
        setBase({ ...EMPTY_COUNTS, ...(data.base || {}) });
        setExtraLabel(data.extraLabel ?? "음향/조명");
        setMeals(sortMeals(data.meals || []));
        setAdjustments(data.adjustments || []);
        setPersonAssignments(data.personAssignments || {});
      }
      await loadDbList();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [retreat.id, loadDbList]);

  useEffect(() => {
    void load();
    const unsub = subscribeToRetreatPeriods(retreat.id, setPeriods,
      e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`));
    return unsub;
  }, [load, retreat.id]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveMealCount(retreat.id, { base, extraLabel, meals, adjustments, personAssignments });
      setDirty(false);
      toast("식수 계산을 저장했습니다.", "success");
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  // ── 기준 인원 자동 제안 (학생=신청자-취소, 교사/스탭=교사참석 탭의 불참 제외 인원) ──
  async function suggestBase() {
    setSuggesting(true);
    try {
      const [parts, colors, teachers] = await Promise.all([
        getParticipants(retreat.id), getCellColors(retreat.id), getTeachers(retreat.id),
      ]);
      const studentCount = Object.keys(parts).filter(k => colors[k] !== "red").length;
      const staffCount = teachers.filter(t => t.bu === "스탭" && t.status !== "불참").length;
      const teacherCount = teachers.filter(t => t.bu !== "스탭" && t.status !== "불참").length;
      setBase(p => ({ ...p, student: studentCount, staff: staffCount, teacher: teacherCount }));
      setDirty(true);
      toast(`자동 제안: 학생 ${studentCount} · 교사 ${teacherCount} · 스탭 ${staffCount} (기타는 직접 입력)`, "success");
    } catch (e) {
      toast(`불러오기 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSuggesting(false);
    }
  }

  // ── 끼니 목록 ──────────────────────────────────────────
  function generateMeals() {
    if (periods.length === 0) return toast("수련회 기간이 없습니다. 홈 화면에서 기간을 먼저 등록해주세요.", "warning");
    const generated = generateMealsFromPeriods(periods);
    setMeals(generated);
    setDirty(true);
  }

  function addMeal() {
    if (!newMeal.date) return toast("날짜를 선택해주세요.", "warning");
    if (meals.some(m => m.date === newMeal.date && m.name === newMeal.name))
      return toast("이미 있는 끼니입니다.", "warning");
    setMeals(prev => sortMeals([...prev, { id: `m_${newMeal.date}_${newMeal.name}_${Date.now()}`, date: newMeal.date, name: newMeal.name }]));
    setDirty(true);
  }

  function removeMeal(id: string) {
    setMeals(prev => prev.filter(m => m.id !== id));
    setDirty(true);
  }

  // ── 조정 그룹 ──────────────────────────────────────────
  function addAdjustment(type: "후발" | "선복귀") {
    if (meals.length === 0) return toast("끼니 목록을 먼저 만들어주세요.", "warning");
    const defaultMeal = type === "후발" ? meals[Math.min(1, meals.length - 1)] : meals[meals.length - 1];
    setAdjustments(prev => [...prev, {
      id: `adj_${Date.now()}`,
      type,
      label: "",
      counts: { ...EMPTY_COUNTS },
      mealId: defaultMeal.id,
    }]);
    setDirty(true);
  }

  function updateAdjustment(id: string, patch: Partial<MealAdjustment>) {
    setAdjustments(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
    setDirty(true);
  }

  async function removeAdjustment(id: string) {
    if (!await uiConfirm("이 조정 항목을 삭제하시겠습니까?")) return;
    setAdjustments(prev => prev.filter(a => a.id !== id));
    setDirty(true);
  }

  // ── DB 명단 (교사 부분참 · 스탭 후발대/부분참 · 학생 부분참) ──
  const dbPersons = useMemo<DbPerson[]>(() => {
    const out: DbPerson[] = [];
    // 교사/스탭 — 교사 참석 탭의 "부분 참석/후발대 일정 요약"과 동일 기준
    dbTeachers.forEach(t => {
      const isStaff = t.bu === "스탭";
      const isTarget = t.status === "부분참" || (isStaff && t.corps === "후발대" && t.status !== "불참");
      if (!isTarget || !t.name?.trim()) return;
      const detail = [t.arrivalInfo, t.lateArrival && `입소 ${t.lateArrival}`].filter(Boolean).join(" · ");
      out.push({
        key: `t_${t.id}`,
        role: isStaff ? "staff" : "teacher",
        bu: t.bu, name: t.name.trim(), affiliation: t.classKey || (isStaff ? "스탭" : ""),
        detail, defaultKind: "후발",
      });
    });
    // 학생 — 부분 참석 탭과 동일하게 participants → classes 원장 순으로 보완
    buildMealPartialPeople(dbParticipants, dbStudents, dbPartials).forEach(p => {
      out.push({
        key: `s_${p.id}`,
        role: "student",
        bu: p.bu, name: p.name,
        affiliation: p.matched ? `${p.grade}학년 ${p.classNum}반` : "",
        detail: p.note,
        defaultKind: p.type === "선복귀" ? "선복귀" : "후발",
      });
    });
    // 역할(교사·스탭 → 학생) → 부(1부→2부→스탭) → 이름순 정렬 — 교사/스탭과 학생이 섞여 헷갈리지 않도록 역할을 우선 그룹화
    const roleOrder = (r: MealRole) => r === "teacher" ? 0 : r === "staff" ? 1 : 2;
    const buOrder = (b: string) => b === "1부" ? 0 : b === "2부" ? 1 : b === "스탭" ? 2 : 3;
    return out.sort((a, b) =>
      roleOrder(a.role) - roleOrder(b.role) ||
      buOrder(a.bu) - buOrder(b.bu) ||
      a.name.localeCompare(b.name, "ko")
    );
  }, [dbTeachers, dbParticipants, dbStudents, dbPartials]);

  function getAssignment(p: DbPerson): MealPersonAssignment {
    return personAssignments[p.key] ?? { kind: p.defaultKind };
  }

  function updateAssignment(p: DbPerson, patch: Partial<MealPersonAssignment>) {
    setPersonAssignments(prev => ({ ...prev, [p.key]: { ...getAssignment(p), ...patch } }));
    setDirty(true);
  }

  // ── 끼니별 계산 ────────────────────────────────────────
  const mealIndexById = useMemo(() => new Map(meals.map((m, i) => [m.id, i])), [meals]);

  const mealRows = useMemo(() => meals.map((meal, idx) => {
    const counts: MealRoleCounts = { ...base };
    // 수동 조정 그룹
    adjustments.forEach(adj => {
      const refIdx = mealIndexById.get(adj.mealId);
      if (refIdx === undefined) return; // 참조 끼니가 삭제됨 — 계산에서 제외 (아래 경고 표시)
      const excluded = adj.type === "후발" ? idx < refIdx : idx > refIdx;
      if (excluded) {
        counts.staff -= adj.counts.staff || 0;
        counts.teacher -= adj.counts.teacher || 0;
        counts.minister -= adj.counts.minister || 0;
        counts.student -= adj.counts.student || 0;
        counts.extra -= adj.counts.extra || 0;
      }
    });
    // DB 명단 개인별 지정 (현재 명단에 있는 사람만 반영 — 삭제된 대상의 잔여 지정은 무시)
    dbPersons.forEach(p => {
      const a = personAssignments[p.key];
      if (!a || a.skip || !a.mealId) return;
      const refIdx = mealIndexById.get(a.mealId);
      if (refIdx === undefined) return;
      const excluded = a.kind === "후발" ? idx < refIdx : idx > refIdx;
      if (excluded) counts[p.role] -= 1;
    });
    return { meal, counts, total: sumCounts(counts) };
  }), [meals, base, adjustments, mealIndexById, dbPersons, personAssignments]);

  const orphanAdjustments = adjustments.filter(a => !mealIndexById.has(a.mealId));
  const baseTotal = sumCounts(base);

  // 수련원 통보용 텍스트 복사
  async function copySummary() {
    const byDate = new Map<string, { name: string; total: number }[]>();
    mealRows.forEach(({ meal, total }) => {
      const list = byDate.get(meal.date) || [];
      list.push({ name: meal.name, total });
      byDate.set(meal.date, list);
    });
    const lines: string[] = [`${retreat.name} 식수 인원 (총 ${baseTotal}명 기준)`, ""];
    byDate.forEach((items, date) => {
      lines.push(fmtDate(date));
      items.forEach(it => lines.push(`${it.name} - ${it.total}`));
      lines.push("");
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n").trim());
      toast("통보용 텍스트를 복사했습니다.", "success");
    } catch {
      toast("복사에 실패했습니다. 브라우저 권한을 확인해주세요.", "error");
    }
  }

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;

  return (
    <div className="space-y-5">
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      {/* 저장 바 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          끼니별 식사 인원을 계산합니다 — 후발대는 <strong>첫 식사</strong>, 선복귀는 <strong>마지막 식사</strong>를 기준으로 앞뒤 끼니에서 자동 차감됩니다.
        </p>
        <button onClick={handleSave} disabled={saving || !dirty} className="btn-primary text-xs px-4 py-2 shrink-0">
          {saving ? "저장 중…" : dirty ? "저장" : "저장됨"}
        </button>
      </div>

      {/* ① 기준 인원 */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700">① 기준 인원 <span className="text-xs font-normal text-slate-400">(전원 참석 시)</span></h3>
          <button onClick={suggestBase} disabled={suggesting} className="btn-secondary text-xs px-3 py-1.5">
            {suggesting ? "불러오는 중…" : "DB에서 자동 제안"}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
          {ROLE_LABELS.map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs text-slate-500 mb-1 block">
                {key === "extra" ? (
                  <input className="input text-xs py-0.5 px-1.5 w-24" value={extraLabel} aria-label="기타 인원 설명"
                    onChange={e => { setExtraLabel(e.target.value); setDirty(true); }} />
                ) : label}
              </label>
              <input type="number" className="input" value={base[key] || ""}
                aria-label={`${label} 인원`}
                onChange={e => { setBase(p => ({ ...p, [key]: parseInt(e.target.value) || 0 })); setDirty(true); }} />
            </div>
          ))}
          <div className="text-center pb-2">
            <p className="text-xs text-slate-400">총원</p>
            <p className="text-xl font-bold text-blue-600">{baseTotal}명</p>
          </div>
        </div>
      </div>

      {/* ② 끼니 목록 */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700">② 끼니 목록</h3>
          <button onClick={generateMeals} className="btn-secondary text-xs px-3 py-1.5">수련회 기간에서 자동 생성</button>
        </div>
        {meals.length === 0 ? (
          <p className="text-sm text-slate-400">끼니가 없습니다. 자동 생성하거나 아래에서 직접 추가하세요.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {meals.map(m => (
              <span key={m.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 group">
                {fmtDate(m.date)} {m.name}
                <button onClick={() => removeMeal(m.id)} aria-label={`${fmtDate(m.date)} ${m.name} 삭제`}
                  className="text-slate-300 hover:text-red-400">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input text-xs py-1.5 w-40" value={newMeal.date}
            aria-label="추가할 끼니 날짜"
            onChange={e => setNewMeal(p => ({ ...p, date: e.target.value }))} />
          <select className="input text-xs py-1.5 w-24" value={newMeal.name} aria-label="추가할 끼니"
            onChange={e => setNewMeal(p => ({ ...p, name: e.target.value }))}>
            {["아침", "점심", "저녁"].map(n => <option key={n}>{n}</option>)}
          </select>
          <button onClick={addMeal} className="btn-secondary text-xs px-3 py-1.5">＋ 끼니 추가</button>
        </div>
      </div>

      {/* ③ 후발/선복귀 조정 */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700">③ 후발 · 선복귀 조정</h3>
          <button onClick={() => void loadDbList().then(() => toast("명단을 새로고침했습니다.", "success"))}
            className="btn-secondary text-xs px-3 py-1.5">🔄 DB 명단 새로고침</button>
        </div>

        {/* ③-a DB 명단 — 교사 참석·부분 참석 탭의 데이터를 자동으로 끌어옴 */}
        <div className="mb-5">
          <h4 className="text-sm font-semibold text-slate-600 mb-1">
            DB 명단 <span className="font-normal text-slate-400">(교사 부분참 · 스탭 후발대 · 학생 부분참 — {dbPersons.length}명)</span>
          </h4>
          <p className="text-xs text-slate-400 mb-2">
            각 사람의 <strong>{`후발=첫 식사 / 선복귀=마지막 식사`}</strong> 끼니를 지정하면 표에서 1명씩 자동 차감됩니다.
            식사에 영향 없으면 &ldquo;제외&rdquo;를 체크하세요. 여기 반영한 사람은 아래 수동 그룹에 중복으로 넣지 마세요.
          </p>
          {dbListError && (
            <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">⚠ 명단 로드 오류: {dbListError}</div>
          )}
          {dbPersons.length === 0 ? (
            <p className="text-sm text-slate-400">대상자가 없습니다. (교사 참석 탭의 부분참/후발대, 부분 참석 탭의 학생이 여기 나타납니다)</p>
          ) : (
            <>
              {(() => {
                const unassigned = dbPersons.filter(p => { const a = personAssignments[p.key]; return !a?.skip && !a?.mealId; }).length;
                return unassigned > 0 && (
                  <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                    ⚠ 끼니 미지정 {unassigned}명은 아직 계산에 반영되지 않았습니다.
                  </div>
                );
              })()}
              <div className="space-y-1">
                {dbPersons.map((p, i) => {
                  const a = getAssignment(p);
                  const applied = !a.skip && !!a.mealId && mealIndexById.has(a.mealId);
                  const prevRole = i > 0 ? dbPersons[i - 1].role : null;
                  const showDivider = p.role !== prevRole;
                  return (
                    <div key={p.key}>
                    {showDivider && (
                      <div className="pt-2 pb-1 text-[11px] font-semibold text-slate-400 first:pt-0">
                        {p.role === "student" ? "— 학생 —" : "— 교사·스탭 —"}
                      </div>
                    )}
                    <div
                      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-xs ${
                        a.skip ? "border-slate-100 bg-slate-50 opacity-60" : applied ? "border-emerald-100 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"
                      }`}>
                      <span className={`tag text-[10px] ${p.bu === "1부" ? "tag-green" : p.bu === "2부" ? "tag-purple" : "tag-blue"}`}>{p.bu}</span>
                      <span className="text-[10px] text-slate-400">
                        {p.role === "student" ? "학생" : p.role === "teacher" ? "교사" : "스탭"}
                      </span>
                      <span className="font-medium text-slate-700">{p.name}</span>
                      <span className="text-slate-400">{p.affiliation}</span>
                      {p.detail && <span className="text-slate-400">· {p.detail}</span>}
                      <div className="ml-auto flex items-center gap-1.5">
                        <select className="input text-xs py-0.5 w-[76px]" value={a.kind} aria-label={`${p.name} 유형`}
                          onChange={e => updateAssignment(p, { kind: e.target.value as "후발" | "선복귀" })}>
                          <option value="후발">후발</option>
                          <option value="선복귀">선복귀</option>
                        </select>
                        <select className="input text-xs py-0.5 w-[150px]" value={a.mealId ?? ""} aria-label={`${p.name} 기준 끼니`}
                          disabled={a.skip}
                          onChange={e => updateAssignment(p, { mealId: e.target.value || undefined })}>
                          <option value="">{a.kind === "후발" ? "첫 식사 선택…" : "마지막 식사 선택…"}</option>
                          {meals.map(m => <option key={m.id} value={m.id}>{fmtDate(m.date)} {m.name}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-slate-400 whitespace-nowrap">
                          <input type="checkbox" checked={!!a.skip}
                            onChange={e => updateAssignment(p, { skip: e.target.checked })} />
                          제외
                        </label>
                      </div>
                    </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ③-b 수동 그룹 — DB에 없는 인원(외부 인력 등)용 */}
        <div className="flex items-center justify-between mb-2 border-t border-slate-100 pt-4">
          <h4 className="text-sm font-semibold text-slate-600">수동 그룹 <span className="font-normal text-slate-400">(DB에 없는 인원용)</span></h4>
          <div className="flex gap-1.5">
            <button onClick={() => addAdjustment("후발")} className="btn-secondary text-xs px-3 py-1.5">＋ 후발 그룹</button>
            <button onClick={() => addAdjustment("선복귀")} className="btn-secondary text-xs px-3 py-1.5">＋ 선복귀 그룹</button>
          </div>
        </div>
        {orphanAdjustments.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
            ⚠ 기준 끼니가 삭제된 조정 항목 {orphanAdjustments.length}건은 계산에서 제외되고 있습니다. 끼니를 다시 지정해주세요.
          </div>
        )}
        {adjustments.length === 0 ? (
          <p className="text-sm text-slate-400">
            수동 그룹이 없습니다. 예: &ldquo;금 저녁 후발&rdquo; 그룹을 추가하고 첫 식사를 토 아침으로 지정하면 금요일 끼니에서 자동 차감됩니다.
            같은 그룹이라도 마지막 식사가 다르면(예: 학생은 저녁 먹고 감) 항목을 나눠 입력하세요.
          </p>
        ) : (
          <div className="space-y-2">
            {adjustments.map(adj => {
              const isOrphan = !mealIndexById.has(adj.mealId);
              const total = sumCounts(adj.counts);
              return (
                <div key={adj.id} className={`rounded-lg border p-3 ${isOrphan ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-slate-50/50"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${adj.type === "후발" ? "bg-sky-100 text-sky-700" : "bg-rose-100 text-rose-700"}`}>
                      {adj.type}
                    </span>
                    <input className="input text-xs py-1 flex-1 min-w-[120px]" placeholder='이름 (예: "금 저녁 후발")'
                      value={adj.label} aria-label="조정 그룹 이름"
                      onChange={e => updateAdjustment(adj.id, { label: e.target.value })} />
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      {adj.type === "후발" ? "첫 식사:" : "마지막 식사:"}
                      <select className="input text-xs py-1 w-36" value={adj.mealId} aria-label="기준 끼니"
                        onChange={e => updateAdjustment(adj.id, { mealId: e.target.value })}>
                        {isOrphan && <option value={adj.mealId}>(삭제된 끼니)</option>}
                        {meals.map(m => <option key={m.id} value={m.id}>{fmtDate(m.date)} {m.name}</option>)}
                      </select>
                    </label>
                    <span className="text-xs font-semibold text-slate-600 ml-auto">{total}명</span>
                    <button onClick={() => removeAdjustment(adj.id)} aria-label="조정 항목 삭제"
                      className="text-slate-300 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {ROLE_LABELS.map(({ key, label }) => (
                      <label key={key} className="text-[11px] text-slate-400">
                        {key === "extra" ? extraLabel || "기타" : label}
                        <input type="number" className="input text-xs py-1 mt-0.5" value={adj.counts[key] || ""}
                          onChange={e => updateAdjustment(adj.id, { counts: { ...adj.counts, [key]: parseInt(e.target.value) || 0 } })} />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ④ 끼니별 식수 인원표 */}
      <div className="card overflow-x-auto">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">④ 끼니별 식수 인원 <span className="text-xs font-normal text-slate-400">(수련원 통보용)</span></h3>
          <button onClick={copySummary} disabled={mealRows.length === 0} className="btn-secondary text-xs px-3 py-1.5">📋 텍스트 복사</button>
        </div>
        {mealRows.length === 0 ? (
          <p className="p-8 text-center text-slate-400 text-sm">끼니 목록을 만들면 여기에 인원표가 표시됩니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-2 text-left">날짜</th>
                <th className="px-4 py-2 text-left">끼니</th>
                <th className="px-4 py-2 text-right">스탭</th>
                <th className="px-4 py-2 text-right">교사</th>
                <th className="px-4 py-2 text-right">교역자</th>
                <th className="px-4 py-2 text-right">학생</th>
                <th className="px-4 py-2 text-right">{extraLabel || "기타"}</th>
                <th className="px-4 py-2 text-right">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mealRows.map(({ meal, counts, total }, i) => {
                const firstOfDate = i === 0 || mealRows[i - 1].meal.date !== meal.date;
                const hasNegative = counts.staff < 0 || counts.teacher < 0 || counts.minister < 0 || counts.student < 0 || counts.extra < 0;
                return (
                  <tr key={meal.id} className={firstOfDate ? "border-t-2 border-slate-200" : ""}>
                    <td className="px-4 py-2 font-medium text-slate-700">{firstOfDate ? fmtDate(meal.date) : ""}</td>
                    <td className="px-4 py-2 text-slate-600">{meal.name}</td>
                    <td className="px-4 py-2 text-right text-slate-500 text-xs">{counts.staff}</td>
                    <td className="px-4 py-2 text-right text-slate-500 text-xs">{counts.teacher}</td>
                    <td className="px-4 py-2 text-right text-slate-500 text-xs">{counts.minister}</td>
                    <td className="px-4 py-2 text-right text-slate-500 text-xs">{counts.student}</td>
                    <td className="px-4 py-2 text-right text-slate-500 text-xs">{counts.extra}</td>
                    <td className={`px-4 py-2 text-right font-bold ${hasNegative ? "text-red-500" : "text-blue-600"}`}>
                      {total}{hasNegative && " ⚠"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
