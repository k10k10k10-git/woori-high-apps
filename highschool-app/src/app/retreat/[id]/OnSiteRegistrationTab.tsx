"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { Retreat, Participant, OnSiteEntry, Group, TeacherAttendance, PartialAttendance } from "@/lib/types";
import {
  subscribeToParticipants, subscribeToCellColors,
  subscribeToOnSiteReg, unregisterOnSite, addWalkIn, toggleOnSiteCheckIn,
  subscribeToGroups, subscribeToClassesByYear, subscribeToConnection,
  subscribeToTeachers, subscribeToPartialAttendances,
} from "@/lib/db";
import { useUI } from "@/context/UIContext";
import { groupDisplayName } from "@/lib/groupNumber";
import { parseClassKey } from "@/lib/classKey";
import { buildOnSiteRoster, willUnregisterOnSite, OnSiteRosterPerson } from "@/lib/onSiteRoster";

type BuTab = "1부" | "2부";

// 실제 반 명단(classes/{year})에서 읽어온 학생
interface ClassStudent {
  rawId: string;      // Firebase raw key (e.g. "abc123")
  buNum: number;
  grade: number;
  classNum: number;
  name: string;
  gender?: string;
}

interface ClassGroup {
  grade: number;
  classNum: number;
  members: Array<OnSiteRosterPerson & {
    registered: boolean;
    isOnSite: boolean;
  }>;
}

function compactStatusLabel(label: string) {
  const partial = label.match(/^부분참\((.+)\)$/);
  return partial?.[1] ?? label;
}

export default function OnSiteRegistrationTab({ retreat }: { retreat: Retreat }) {
  const { toast, uiConfirm } = useUI();
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [teachers, setTeachers] = useState<TeacherAttendance[]>([]);
  const [partialAttendances, setPartialAttendances] = useState<PartialAttendance[]>([]);
  const [cellColors, setCellColors] = useState<Record<string, string>>({});
  const [classStudents, setClassStudents] = useState<ClassStudent[]>([]);
  const [onSiteReg, setOnSiteReg] = useState<Record<string, OnSiteEntry>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [bu, setBu] = useState<BuTab>("1부");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", grade: "1", classNum: "1", gender: "남" });
  const [adding, setAdding] = useState(false);
  const [connected, setConnected] = useState(true);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    const unsubClasses = subscribeToClassesByYear(retreat.year, (classesRaw) => {
      const students: ClassStudent[] = [];
      Object.entries(classesRaw).forEach(([classKey, cd]) => {
        const parsed = parseClassKey(classKey);
        if (!parsed) return;
        const { buNum: b, grade: g, classNum: c } = parsed;
        Object.entries(cd.students || {}).forEach(([rawId, s]) => {
          students.push({ rawId, buNum: b, grade: g, classNum: c, name: s.name });
        });
      });
      setClassStudents(students);
      setLoading(false);
    }, (error) => { setLoadError(error.message); setLoading(false); });
    const unsubParticipants = subscribeToParticipants(retreat.id, setParticipants,
      e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`));
    const unsubCellColors = subscribeToCellColors(retreat.id, setCellColors,
      e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`));
    const unsubOnSite = subscribeToOnSiteReg(retreat.id, setOnSiteReg,
      e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`));
    const unsubGroups = subscribeToGroups(retreat.id, setGroups,
      e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`));
    const unsubTeachers = subscribeToTeachers(retreat.id, setTeachers,
      e => setLoadError(prev => prev ?? `교사 명단 구독 실패 — ${e.message}`));
    const unsubPartial = subscribeToPartialAttendances(retreat.id, setPartialAttendances,
      e => setLoadError(prev => prev ?? `부분참 명단 구독 실패 — ${e.message}`));
    const unsubConn = subscribeToConnection(setConnected);
    return () => {
      unsubClasses(); unsubParticipants(); unsubCellColors(); unsubOnSite(); unsubGroups();
      unsubTeachers(); unsubPartial(); unsubConn();
    };
  }, [retreat.id, retreat.year]);

  // studentId → 조 이름 맵 (실시간 반영, 전역 번호 표시)
  const groupMap = useMemo(() => {
    const map = new Map<string, string>(); // studentId ("buNum_rawId") → 조이름
    groups.forEach(g => {
      const jo = groupDisplayName(g, groups);
      (g.studentIds || []).forEach(sid => map.set(sid, jo));
    });
    return map;
  }, [groups]);

  const buNum = bu === "1부" ? 1 : 2;

  // 전체 신청 학생 + 교사(스탭 제외). 입금/후발/불참/취소 상태와 무관하게 모두 현장등록 대상에 둔다.
  const rosterPeople = useMemo(() => buildOnSiteRoster({
    participants,
    teachers,
    partialAttendances,
    cellColors,
    classStudents,
    buNum: buNum as 1 | 2,
  }), [participants, teachers, partialAttendances, cellColors, classStudents, buNum]);

  // 검색 결과
  const searchResults = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return rosterPeople.filter(p => p.name.includes(q));
  }, [rosterPeople, search]);

  // 현장 추가 등록된 사람 (선택 부)
  const walkIns = useMemo(() => {
    return Object.entries(onSiteReg)
      .filter(([, e]) => e.isOnSite && e.bu === bu)
      .map(([key, e]) => ({ key, ...e }))
      .sort((a, b) => a.grade - b.grade || a.class - b.class);
  }, [onSiteReg, bu]);

  // 교사/반별 그룹 — 전체 신청 학생과 교사를 상태와 관계없이 표시
  const byClass = useMemo<ClassGroup[]>(() => {
    const map = new Map<string, ClassGroup>();
    rosterPeople.forEach(person => {
      const isTeacher = person.source === "teacher";
      const grade = isTeacher ? -1 : person.grade;
      const classNum = isTeacher ? -1 : person.classNum;
      const key = isTeacher ? "teachers" : `${grade}-${classNum}`;
      if (!map.has(key)) map.set(key, { grade, classNum, members: [] });
      const entry = onSiteReg[person.onSiteKey];
      map.get(key)!.members.push({
        ...person,
        registered: !!entry && !entry.isOnSite,
        isOnSite: false,
      });
    });

    // 현장 추가
    walkIns.forEach(w => {
      const k = `${w.grade}-${w.class}`;
      if (!map.has(k)) map.set(k, { grade: w.grade, classNum: w.class, members: [] });
      map.get(k)!.members.push({
        source: "student",
        sourceKey: w.key,
        onSiteKey: w.key,
        name: w.name,
        gender: w.gender ?? "",
        grade: w.grade,
        classNum: w.class,
        hasMatch: true,
        registered: true,
        isOnSite: true,
      });
    });

    return Array.from(map.values()).sort((a, b) => a.grade - b.grade || a.classNum - b.classNum);
  }, [rosterPeople, onSiteReg, walkIns]);

  const grades = useMemo(() => [...new Set(byClass.map(c => c.grade))].sort((a, b) => {
    if (a === -1) return -1;
    if (b === -1) return 1;
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  }), [byClass]);

  // 통계: total = 전체 참가자, registered = 현장 등록 탭에서 수동 체크인 수
  const stats = useMemo(() => {
    const total = rosterPeople.length;
    const registered = rosterPeople.filter(person => {
      const entry = onSiteReg[person.onSiteKey];
      return !!entry && !entry.isOnSite;
    }).length;
    return { total, registered, walkIns: walkIns.length };
  }, [rosterPeople, onSiteReg, walkIns]);

  // 트랜잭션 기반 토글 — 여러 스태프가 동시에 같은 학생을 눌러도
  // "현재 서버 상태 기준"으로 안전하게 등록/해제됨 (lost-update 방지)
  async function runToggle(onSiteKey: string, build: () => OnSiteEntry) {
    if (pendingKeys.has(onSiteKey)) return; // 처리 중 중복 클릭 방지
    setPendingKeys(prev => new Set(prev).add(onSiteKey));
    try {
      await toggleOnSiteCheckIn(retreat.id, onSiteKey, build);
    } catch {
      toast(`등록 처리 중 오류가 발생했습니다. 다시 시도해주세요.`, "error");
    } finally {
      setPendingKeys(prev => { const n = new Set(prev); n.delete(onSiteKey); return n; });
    }
  }

  async function toggleRegistration(rp: OnSiteRosterPerson) {
    // 등록은 즉시, 해제는 확인 후 — "확인하려다 해제" 오조작 방지
    if (willUnregisterOnSite(onSiteReg[rp.onSiteKey])
      && !await uiConfirm(`"${rp.name}" 등록을 해제하시겠습니까?`)) return;
    await runToggle(rp.onSiteKey, () => ({
      isOnSite: false,
      name: rp.name,
      grade: rp.grade,
      class: rp.classNum,
      bu,
      gender: rp.gender,
      registeredAt: new Date().toISOString(),
      participantKey: rp.sourceKey,
    }));
    setSearch("");
    searchRef.current?.focus();
  }

  async function toggleFromRightPanel(onSiteKey: string, member: ClassGroup["members"][0]) {
    if (member.isOnSite) return; // 현장추가는 토글 불가
    if (willUnregisterOnSite(onSiteReg[onSiteKey])
      && !await uiConfirm(`"${member.name}" 등록을 해제하시겠습니까?`)) return;
    await runToggle(onSiteKey, () => ({
      isOnSite: false,
      name: member.name,
      grade: member.grade,
      class: member.classNum,
      bu,
      gender: member.gender,
      registeredAt: new Date().toISOString(),
      participantKey: member.sourceKey,
    }));
  }

  async function handleAddWalkIn() {
    if (!addForm.name.trim()) return;
    setAdding(true);
    try {
      await addWalkIn(retreat.id, {
        name: addForm.name.trim(),
        grade: parseInt(addForm.grade) || 0,
        class: parseInt(addForm.classNum) || 0,
        bu,
        gender: addForm.gender,
        registeredAt: new Date().toISOString(),
      });
      setAddForm({ name: "", grade: "1", classNum: "1", gender: "남" });
      setShowAddModal(false);
    } catch (e) {
      toast(`추가 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveWalkIn(onSiteKey: string) {
    const target = onSiteReg[onSiteKey];
    const name = target?.name ? `"${target.name}" ` : "";
    if (!await uiConfirm(`${name}현장추가 인원을 삭제하시겠습니까?`)) return;
    try {
      await unregisterOnSite(retreat.id, onSiteKey);
    } catch (e) {
      toast(e instanceof Error ? e.message : "현장추가 인원을 삭제하지 못했습니다.", "error");
    }
  }

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;

  const isGreen = bu === "1부";
  if (loadError) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
      ⚠ 로드 오류: {loadError}
    </div>
  );
  const accentBg   = isGreen ? "bg-green-600"   : "bg-purple-600";
  const accentText = isGreen ? "text-green-700"  : "text-purple-700";
  const chipReg    = isGreen
    ? "bg-green-200 text-green-900 border-green-300"
    : "bg-purple-200 text-purple-900 border-purple-300";
  const cardHead   = isGreen
    ? "bg-green-50 border-green-100 text-green-800"
    : "bg-purple-50 border-purple-100 text-purple-800";
  const pct = stats.total > 0 ? Math.round(stats.registered / stats.total * 100) : 0;

  return (
    <div>
      {/* ─── 연결 끊김 경고 ─── */}
      {!connected && (
        <div className="mb-4 bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2 animate-pulse">
          <span className="text-lg">📡</span>
          <span><strong>네트워크 연결이 끊겼습니다.</strong> 등록 버튼을 눌러도 서버에 저장되지 않을 수 있어요. 와이파이 연결을 확인한 뒤 다시 시도해주세요.</span>
        </div>
      )}

      {/* ─── 상단: 1부/2부 + 실시간 카운터 ─── */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex gap-2">
          {(["1부", "2부"] as BuTab[]).map(b => (
            <button key={b} onClick={() => setBu(b)}
              className={`px-6 py-2 rounded-lg font-semibold text-sm transition-colors ${
                bu === b
                  ? b === "1부" ? "bg-green-600 text-white shadow-sm" : "bg-purple-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}>
              {b}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 ml-2">
          <span className={`text-2xl font-bold ${accentText}`}>{stats.registered}</span>
          <span className="text-slate-400 text-sm">/ {stats.total}명</span>
          <div className="w-28 bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${accentBg}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-semibold text-slate-600">{pct}%</span>
          {stats.walkIns > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
              현장추가 {stats.walkIns}명
            </span>
          )}
        </div>

        <div className="ml-auto text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-blue-600">
          💡 전체 신청 학생과 교사를 표시합니다 · 스탭 제외
        </div>
      </div>

      {rosterPeople.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700 mb-4">
          ⚠ 이 부서의 신청 학생과 교사 명단이 없습니다.
        </div>
      )}

      {/* ─── 메인 레이아웃 ─── */}
      <div className="flex gap-5 items-start">

        {/* 왼쪽: 검색 + 현장추가 */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-3">
          <input
            ref={searchRef}
            className="input"
            placeholder="이름 검색 후 클릭 → 등록"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />

          <div className="card overflow-hidden" style={{ minHeight: 280, maxHeight: 500, overflowY: "auto" }}>
            {search.trim() === "" ? (
              <div className="p-6 text-center text-slate-400 text-sm">
                <div className="text-3xl mb-2">🔍</div>
                <p>이름을 입력하면</p>
                <p>신청자 중에서 검색됩니다</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">
                <div className="text-2xl mb-1">😶</div>
                <p>&apos;{search}&apos; 검색 결과 없음</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {searchResults.map(rp => {
                  const isReg = !!(onSiteReg[rp.onSiteKey] && !onSiteReg[rp.onSiteKey].isOnSite);
                  const isPending = pendingKeys.has(rp.onSiteKey);
                  return (
                    <button key={rp.onSiteKey} onClick={() => toggleRegistration(rp)} disabled={isPending}
                      className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-wait ${
                        isReg ? (isGreen ? "bg-green-50" : "bg-purple-50") : ""
                      }`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        isReg
                          ? isGreen ? "bg-green-500 text-white" : "bg-purple-500 text-white"
                          : "bg-slate-100 text-slate-400"
                      }`}>
                        {isPending ? "…" : isReg ? "✓" : ""}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold text-sm ${isReg ? (isGreen ? "text-green-800" : "text-purple-800") : "text-slate-800"}`}>
                          {rp.name}
                          {rp.status && (
                            <span className={`ml-1.5 inline-flex rounded-full px-1.5 py-0.5 align-middle text-[10px] font-bold ${
                              rp.status.tone === "cancelled" || rp.status.tone === "absent"
                                ? "bg-red-100 text-red-700"
                                : "bg-orange-100 text-orange-700"
                            }`}>
                              {rp.status.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center flex-wrap gap-x-1">
                          {rp.source === "teacher" ? "교사" : (
                            <>{rp.grade > 0 ? `${rp.grade}학년 ` : ""}{rp.classNum > 0 ? `${rp.classNum}반` : ""}</>
                          )}
                          {rp.gender ? ` · ${rp.gender}` : ""}
                          {rp.source === "student" && groupMap.get(rp.onSiteKey) && (
                            <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-semibold"
                              style={{ background: "var(--color-primary-glow)", color: "var(--color-primary)", border: "1px solid var(--color-primary-ring)" }}>
                              {groupMap.get(rp.onSiteKey)}
                            </span>
                          )}
                          {rp.source === "student" && !rp.hasMatch && <span className="text-yellow-500">미매칭</span>}
                        </div>
                      </div>
                      <span className={`text-xs font-medium flex-shrink-0 ${isReg ? (isGreen ? "text-green-600" : "text-purple-600") : "text-slate-300"}`}>
                        {isReg ? "등록완료" : "미등록"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button onClick={() => setShowAddModal(true)} className="btn-secondary w-full justify-center text-sm">
            ＋ 현장 추가 등록
          </button>

          {/* 범례 */}
          <div className="card p-3 text-xs space-y-1.5 text-slate-500">
            <div className="font-semibold text-slate-400 mb-1">색상 범례</div>
            <div className="flex items-center gap-2">
              <span className={`inline-block w-3 h-3 rounded-sm ${isGreen ? "bg-green-200" : "bg-purple-200"}`} />
              등록완료 (체크인)
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-200" />
              현장 추가 등록
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm bg-white border border-slate-200" />
              미등록
            </div>
          </div>
        </div>

        {/* 오른쪽: 교사 + 반별 현황표 (실제 반 기준) */}
        <div className="flex-1 min-w-0 space-y-5">
          {grades.map(grade => {
            const gradeCls = byClass.filter(c => c.grade === grade);
            const gradeReg = gradeCls.reduce((s, c) => s + c.members.filter(m => m.registered).length, 0);
            const gradeTotal = gradeCls.reduce((s, c) => s + c.members.length, 0);
            return (
              <div key={grade}>
                <h3 className="text-sm font-bold text-slate-500 mb-2 flex items-center gap-2">
                  {grade === -1 ? "교사" : grade > 0 ? `${grade}학년` : "미매칭"}
                  <span className="font-normal text-slate-400">{gradeReg} / {gradeTotal}명 등록</span>
                </h3>
                <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                  {gradeCls.map(cls => {
                    const regCount = cls.members.filter(m => m.registered).length;
                    const total = cls.members.length;
                    const allDone = regCount === total && total > 0;
                    return (
                      <div key={`${cls.grade}-${cls.classNum}`} className="card overflow-hidden">
                        <div className={`px-3 py-1.5 border-b flex items-center justify-between ${cardHead}`}>
                          <span className="text-sm font-bold">
                            {cls.grade === -1 ? "교사 명단" : cls.classNum > 0 ? `${cls.classNum}반` : "기타"}
                          </span>
                          <span className={`text-xs font-semibold ${allDone ? (isGreen ? "text-green-600" : "text-purple-600") : "text-slate-400"}`}>
                            {regCount}/{total}{allDone && " ✓"}
                          </span>
                        </div>
                        {/* 진행 바 */}
                        <div className="h-1 bg-slate-100">
                          <div className={`h-full transition-all ${accentBg}`}
                            style={{ width: `${total > 0 ? Math.round(regCount / total * 100) : 0}%` }} />
                        </div>
                        {/* 기존의 작은 이름 칩 밀도를 유지하고 상태만 짧은 꼬리표로 붙인다. */}
                        <div className="p-2 flex flex-wrap gap-1.5">
                          {cls.members.map(m => {
                            const groupName = m.source === "student" ? groupMap.get(m.onSiteKey) : undefined;
                            const isPending = pendingKeys.has(m.onSiteKey);
                            return (
                              <div key={m.onSiteKey} className="relative group">
                                <button
                                  onClick={() => toggleFromRightPanel(m.onSiteKey, m)}
                                  disabled={isPending}
                                  title={
                                    m.isOnSite ? `${m.name} (현장추가)${groupName ? ` · ${groupName}` : ""}`
                                    : m.registered ? `${m.name} — 클릭하여 등록 취소${m.status ? ` · ${m.status.label}` : ""}${groupName ? ` · ${groupName}` : ""}`
                                    : `${m.name} — 클릭하여 등록${m.status ? ` · ${m.status.label}` : ""}${groupName ? ` · ${groupName}` : ""}`
                                  }
                                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors inline-flex items-center gap-1 ${
                                    isPending ? "opacity-40 cursor-wait" :
                                    m.isOnSite
                                      ? "bg-amber-100 text-amber-800 border-amber-200 cursor-default"
                                      : m.registered
                                        ? `${chipReg} cursor-pointer`
                                        : "bg-white text-slate-500 border-slate-200 cursor-pointer hover:bg-slate-50"
                                  }`}>
                                  {isPending ? "…" : m.name}
                                  {groupName && (
                                    <span className="text-[10px] font-semibold opacity-70">{groupName}</span>
                                  )}
                                  {m.status && (
                                    <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] leading-4 font-bold ${
                                      m.status.tone === "cancelled" || m.status.tone === "absent"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-orange-100 text-orange-700"
                                    }`}>
                                      {compactStatusLabel(m.status.label)}
                                    </span>
                                  )}
                                </button>
                                {m.isOnSite && (
                                  <button
                                    onClick={() => handleRemoveWalkIn(m.onSiteKey)}
                                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-slate-400 text-white text-[9px] leading-none hidden group-hover:flex items-center justify-center hover:bg-red-400 transition-colors"
                                    title="삭제">
                                    ×
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {byClass.length === 0 && (
            <div className="card p-8 text-center text-slate-400">
              <div className="text-3xl mb-2">📋</div>
              <p>이 부서의 신청 학생과 교사 명단이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── 현장 추가 등록 모달 ─── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-1">현장 추가 등록</h3>
            <p className="text-xs text-slate-400 mb-4">{bu} · 신청 명단에 없는 학생을 즉석 추가합니다.</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">이름 *</label>
                <input className="input" placeholder="이름 입력"
                  value={addForm.name}
                  onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleAddWalkIn()}
                  autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-slate-600 block mb-1">학년</label>
                  <select className="input" value={addForm.grade}
                    onChange={e => setAddForm(p => ({ ...p, grade: e.target.value }))}>
                    <option value="0">미상</option>
                    {[1, 2, 3].map(n => <option key={n} value={n}>{n}학년</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600 block mb-1">반</label>
                  <select className="input" value={addForm.classNum}
                    onChange={e => setAddForm(p => ({ ...p, classNum: e.target.value }))}>
                    <option value="0">미상</option>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}반</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">성별</label>
                <div className="flex gap-2">
                  {(["남", "여"] as const).map(g => (
                    <button key={g} onClick={() => setAddForm(p => ({ ...p, gender: g }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        addForm.gender === g
                          ? g === "남" ? "bg-blue-500 text-white border-blue-500" : "bg-pink-500 text-white border-pink-500"
                          : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                      }`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleAddWalkIn} disabled={adding || !addForm.name.trim()}
                className="btn-primary flex-1 justify-center">
                {adding ? "추가 중..." : "추가 + 등록"}
              </button>
              <button onClick={() => setShowAddModal(false)} className="btn-secondary flex-1 justify-center">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
