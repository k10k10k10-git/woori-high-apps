"use client";
import { TeacherAttendance } from "@/lib/types";
import {
  AutoAssignScope, ClassUnit, ConflictPair, RuleFlags, LeaderEntry,
  ensureEvenCombinedGroupCounts, ensureEvenScopedGroupCount, parseClassKey,
} from "./autoAssignUtils";
import {
  ClassPicker,
  StudentCandidate,
  StudentNamePicker,
  StudentPicker,
  TeacherCandidate,
  TeacherNamePicker,
  TeacherPicker,
} from "./AutoAssignNamePickers";

export interface AutoAssignConfigPanelProps {
  // 조 수
  groupCount1bu: number;
  groupCount2bu: number;
  setGroupCount1bu: (v: number) => void;
  setGroupCount2bu: (v: number) => void;
  // 규칙
  rules: RuleFlags;
  setRules: React.Dispatch<React.SetStateAction<RuleFlags>>;
  // 고려 관계
  studentConflicts: ConflictPair[];
  setStudentConflicts: React.Dispatch<React.SetStateAction<ConflictPair[]>>;
  teacherConflicts: ConflictPair[];
  setTeacherConflicts: React.Dispatch<React.SetStateAction<ConflictPair[]>>;
  teacherStudentConflicts: ConflictPair[];
  setTeacherStudentConflicts: React.Dispatch<React.SetStateAction<ConflictPair[]>>;
  classConflicts: ConflictPair[];
  setClassConflicts: React.Dispatch<React.SetStateAction<ConflictPair[]>>;
  classAffinities: ConflictPair[];
  setClassAffinities: React.Dispatch<React.SetStateAction<ConflictPair[]>>;
  relationErrors: string[]; // 반 결합·분리 모순 — 있으면 실행 차단
  // 드롭다운 입력 상태
  newSC: { a: StudentPicker; b: StudentPicker };
  setNewSC: React.Dispatch<React.SetStateAction<{ a: StudentPicker; b: StudentPicker }>>;
  newTC: { a: TeacherPicker; b: TeacherPicker };
  setNewTC: React.Dispatch<React.SetStateAction<{ a: TeacherPicker; b: TeacherPicker }>>;
  newTSC: { teacher: TeacherPicker; student: StudentPicker };
  setNewTSC: React.Dispatch<React.SetStateAction<{ teacher: TeacherPicker; student: StudentPicker }>>;
  newCC: { a: ClassPicker; b: ClassPicker };
  setNewCC: React.Dispatch<React.SetStateAction<{ a: ClassPicker; b: ClassPicker }>>;
  newCA: { a: ClassPicker; b: ClassPicker };
  setNewCA: React.Dispatch<React.SetStateAction<{ a: ClassPicker; b: ClassPicker }>>;
  // 조장
  leaderEntries1: LeaderEntry[];
  setLeaderEntries1: (v: LeaderEntry[]) => void;
  leaderEntries2: LeaderEntry[];
  setLeaderEntries2: (v: LeaderEntry[]) => void;
  // 반 구성 정보
  classUnits1: ClassUnit[];
  classUnits2: ClassUnit[];
  maxGroups1: number; // 조 수 상한 (최소2반 규칙 반영)
  maxGroups2: number;
  bu1Count: number;
  bu2Count: number;
  // 교사
  teachers: TeacherAttendance[];
  // 실행
  running: boolean;
  configLoading: boolean;
  configSaving: boolean;
  configNotice: string | null;
  configError: string | null;
  scope: AutoAssignScope;
  setScope: (scope: AutoAssignScope) => void;
  currentGroupCount1bu: number;
  currentGroupCount2bu: number;
  onSaveConfig: () => void;
  onRun: () => void;
  onCollapse: () => void;
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────

function emptyPicker(): StudentPicker { return { bu: "", grade: "", cls: "", name: "", studentId: "" }; }
function emptyTpicker(): TeacherPicker { return { bu: "", name: "" }; }
function emptyEntry(): LeaderEntry { return { name: "", grade: "", cls: "", studentId: "", mode: "withClass" }; }

// ── 컴포넌트 ─────────────────────────────────────────────────────────

export default function AutoAssignConfigPanel({
  groupCount1bu, groupCount2bu, setGroupCount1bu, setGroupCount2bu,
  rules, setRules,
  studentConflicts, setStudentConflicts,
  teacherConflicts, setTeacherConflicts,
  teacherStudentConflicts, setTeacherStudentConflicts,
  classConflicts, setClassConflicts,
  classAffinities, setClassAffinities, relationErrors,
  newSC, setNewSC, newTC, setNewTC, newTSC, setNewTSC, newCC, setNewCC, newCA, setNewCA,
  leaderEntries1, setLeaderEntries1, leaderEntries2, setLeaderEntries2,
  classUnits1, classUnits2, maxGroups1, maxGroups2, bu1Count, bu2Count,
  teachers, running, configLoading, configSaving, configNotice, configError,
  scope, setScope, currentGroupCount1bu, currentGroupCount2bu,
  onSaveConfig, onRun, onCollapse,
}: AutoAssignConfigPanelProps) {

  // 이름 우선 선택용 후보 목록 (부·학년·반 표시)
  const studentCandidates: StudentCandidate[] = [...classUnits1, ...classUnits2]
    .flatMap(u => u.names.map((name, i) => ({ name, bu: u.bu, grade: u.grade, cls: u.classNum, studentId: u.studentIds[i] })));
  const teacherCandidates: TeacherCandidate[] = [
    ...new Map(
      teachers.filter(t => parseClassKey(t.classKey) !== null).map(t => [`${t.bu}_${t.name}`, { name: t.name, bu: t.bu }])
    ).values(),
  ];
  // 반 고려용 — 부서→학년→반 캐스케이드 헬퍼 + unitKey 라벨
  const allClassUnits = [...classUnits1, ...classUnits2];
  const getUnitsForBu = (bu: string) => bu === "1부" ? classUnits1 : bu === "2부" ? classUnits2 : [];
  const getGrades = (bu: string) => bu ? [...new Set(getUnitsForBu(bu).map(u => u.grade))].sort((a, b) => a - b) : [];
  const getClasses = (bu: string, grade: string) =>
    bu && grade ? [...new Set(getUnitsForBu(bu).filter(u => u.grade === Number(grade)).map(u => u.classNum))].sort((a, b) => a - b) : [];
  const ccKey = (p: ClassPicker) => (p.bu && p.grade && p.cls) ? `${p.bu}_${p.grade}_${p.cls}` : "";
  const classLabel = (key: string) => {
    const u = allClassUnits.find(cu => cu.key === key);
    return u ? `${u.bu} ${u.grade}학년 ${u.classNum}반` : key;
  };
  const hasLeaderClassDuplicates = ([
    { bu: "1부", entries: leaderEntries1.slice(0, groupCount1bu) },
    { bu: "2부", entries: leaderEntries2.slice(0, groupCount2bu) },
  ] as const).filter(row => scope === "all" || row.bu === scope).some(row => {
    const seen = new Set<string>();
    return row.entries.some(entry => {
      if (!entry.name.trim() || entry.mode === "sent" || !entry.grade || !entry.cls) return false;
      const key = `${row.bu}_${entry.grade}_${entry.cls}`;
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
  });

  // 반 담당 전참 교사 수 체크 (스탭/부장/회계 제외)
  const fullTimer1 = teachers.filter(t => t.bu === "1부" && t.status === "전참" && parseClassKey(t.classKey) !== null).length;
  const fullTimer2 = teachers.filter(t => t.bu === "2부" && t.status === "전참" && parseClassKey(t.classKey) !== null).length;
  const warn1 = rules.requireFullTimer && bu1Count > 0 && groupCount1bu > fullTimer1;
  const warn2 = rules.requireFullTimer && bu2Count > 0 && groupCount2bu > fullTimer2;
  const evenGroupCounts = !rules.ensureEvenGroupCount
    ? {
        groupCount1bu: scope === "2부" ? currentGroupCount1bu : groupCount1bu,
        groupCount2bu: scope === "1부" ? currentGroupCount2bu : groupCount2bu,
      }
    : scope === "all"
    ? ensureEvenCombinedGroupCounts({
        groupCount1bu,
        groupCount2bu,
        maxGroups1,
        maxGroups2,
        studentCount1bu: bu1Count,
        studentCount2bu: bu2Count,
      })
    : scope === "1부"
      ? {
          groupCount1bu: ensureEvenScopedGroupCount({
            requestedCount: groupCount1bu,
            maxGroups: maxGroups1,
            studentCount: bu1Count,
            preservedOtherGroupCount: currentGroupCount2bu,
          }),
          groupCount2bu: currentGroupCount2bu,
        }
      : {
          groupCount1bu: currentGroupCount1bu,
          groupCount2bu: ensureEvenScopedGroupCount({
            requestedCount: groupCount2bu,
            maxGroups: maxGroups2,
            studentCount: bu2Count,
            preservedOtherGroupCount: currentGroupCount1bu,
          }),
        };
  const activeGroupCount1 = scope === "2부" ? currentGroupCount1bu : bu1Count > 0 ? groupCount1bu : 0;
  const activeGroupCount2 = scope === "1부" ? currentGroupCount2bu : bu2Count > 0 ? groupCount2bu : 0;
  const combinedGroupCount = activeGroupCount1 + activeGroupCount2;
  const groupCountAdjustment = evenGroupCounts.groupCount1bu !== activeGroupCount1
    ? `1부 ${activeGroupCount1}→${evenGroupCounts.groupCount1bu}조`
    : evenGroupCounts.groupCount2bu !== activeGroupCount2
      ? `2부 ${activeGroupCount2}→${evenGroupCounts.groupCount2bu}조`
      : null;
  const targetHasStudents = scope === "1부" ? bu1Count > 0 : scope === "2부" ? bu2Count > 0 : bu1Count > 0 || bu2Count > 0;

  function addSC() {
    if (!newSC.a.name || !newSC.b.name || newSC.a.name === newSC.b.name) return;
    setStudentConflicts(p => [...p, { a: newSC.a.name, b: newSC.b.name }]);
    setNewSC({ a: emptyPicker(), b: emptyPicker() });
  }
  function addTC() {
    if (!newTC.a.name || !newTC.b.name || newTC.a.name === newTC.b.name) return;
    setTeacherConflicts(p => [...p, { a: newTC.a.name, b: newTC.b.name }]);
    setNewTC({ a: emptyTpicker(), b: emptyTpicker() });
  }
  function addTSC() {
    if (!newTSC.teacher.name || !newTSC.student.name) return;
    setTeacherStudentConflicts(p => [...p, { a: newTSC.teacher.name, b: newTSC.student.name }]);
    setNewTSC({ teacher: emptyTpicker(), student: emptyPicker() });
  }
  function addCC() {
    const a = ccKey(newCC.a), b = ccKey(newCC.b);
    if (!a || !b || a === b) return;
    const reset = () => setNewCC({ a: { bu: "", grade: "", cls: "" }, b: { bu: "", grade: "", cls: "" } });
    // 이미 있는 쌍(순서 무관) 중복 방지
    if (classConflicts.some(c => (c.a === a && c.b === b) || (c.a === b && c.b === a))) {
      reset();
      return;
    }
    setClassConflicts(p => [...p, { a, b }]);
    reset();
  }
  function addCA() {
    const a = ccKey(newCA.a), b = ccKey(newCA.b);
    if (!a || !b || a === b) return;
    const reset = () => setNewCA({ a: { bu: "", grade: "", cls: "" }, b: { bu: "", grade: "", cls: "" } });
    if (classAffinities.some(c => (c.a === a && c.b === b) || (c.a === b && c.b === a))) {
      reset();
      return;
    }
    // 분리 목록과의 모순은 여기서 막지 않는다 — validateClassRelations가 사유와 함께 실행을 차단
    setClassAffinities(p => [...p, { a, b }]);
    reset();
  }

  return (
    <div className="card p-4 space-y-4 text-sm sticky top-4 max-h-[calc(100vh-5rem)] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-700 flex items-center gap-1.5">🎲 자동 조편성</h3>
        <button onClick={onCollapse} className="text-slate-300 hover:text-slate-500 text-xs">◀ 접기</button>
      </div>

      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2.5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onSaveConfig} disabled={configLoading || configSaving}
            className="btn-secondary btn-sm text-xs disabled:opacity-50">
            {configLoading ? "⏳ 설정 불러오는 중" : configSaving ? "⏳ 설정 저장 중" : "💾 설정 저장"}
          </button>
          <span className="text-[10px] text-emerald-700">조장·규칙·고려 관계를 이 수련회에 저장</span>
        </div>
        {configNotice && <p className="mt-1.5 text-[10px] text-emerald-700">✓ {configNotice}</p>}
        {configError && <p className="mt-1.5 text-[10px] text-red-600">⚠ {configError}</p>}
      </div>

      <fieldset className="rounded-lg border border-sky-200 bg-sky-50 p-2.5">
        <legend className="px-1 text-xs font-semibold text-sky-800">조편성 범위</legend>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="자동 조편성 범위">
          {([
            { value: "all" as const, label: "전체" },
            { value: "1부" as const, label: "1부만" },
            { value: "2부" as const, label: "2부만" },
          ]).map(option => (
            <button key={option.value} type="button" aria-pressed={scope === option.value}
              onClick={() => setScope(option.value)}
              className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                scope === option.value
                  ? "border-sky-500 bg-white text-sky-700 shadow-sm"
                  : "border-transparent text-sky-500 hover:bg-white/70"
              }`}>
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-sky-700">
          {scope === "all"
            ? "1부와 2부를 모두 새로 편성합니다."
            : `${scope}만 새로 편성하고 ${scope === "1부" ? "2부" : "1부"}의 현재 조편성은 그대로 유지합니다.`}
        </p>
      </fieldset>

      {/* 기본 적용 알고리즘 */}
      <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">기본 적용 알고리즘</p>
        <p className="mt-0.5 mb-2 text-[10px] text-slate-400">필요한 규칙만 체크해서 자동배정에 적용하세요.</p>

        <div className="space-y-1.5">
          {([
            { label: "반 담당 교사를 해당 반이 속한 조에 자동 배치", key: "assignTeachers" as const },
            { label: "전참 교사가 있는 조에 우선 배정", key: "requireFullTimer" as const },
            {
              label: rules.keepSameClass
                ? "조장 지정 시 해당 반 전체를 그 조에 고정"
                : "조장 지정 시 조장 본인을 그 조에 고정",
              key: "pinLeaders" as const,
            },
            { label: "고려 관계·반 붙임 관계를 조편성에 반영", key: "applyConflicts" as const },
            { label: "모든 조의 인원 수를 최대한 균등하게 배분", key: "balanceSize" as const },
            { label: "특정 학년이 한 조에 몰리지 않도록 분산 배정", key: "balanceGrade" as const },
          ]).map(({ label, key }) => {
            const checked = rules[key];
            const disabled = key === "requireFullTimer" && !rules.assignTeachers;
            return (
              <label key={key} className={`flex items-start gap-2 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  className="rounded shrink-0 mt-0.5"
                  onChange={e => setRules(current => {
                    if (key === "assignTeachers" && !e.target.checked) {
                      return { ...current, assignTeachers: false, requireFullTimer: false };
                    }
                    return { ...current, [key]: e.target.checked };
                  })}
                />
                <span className={!checked ? "line-through opacity-50" : ""}>{label}</span>
              </label>
            );
          })}
        </div>

        <div className="mt-2.5 border-t border-slate-200 pt-2">
          <p className="mb-1.5 text-[10px] font-semibold text-slate-400">배정 구조 선택</p>
          <div className="space-y-1.5">
            {([
              { label: "같은 반 학생은 반드시 같은 조로 배정", key: "keepSameClass" as const },
              { label: "홀수반=남학생 반, 짝수반=여학생 반으로 구분", key: "inferGenderByClass" as const },
              { label: "스탭·부장·회계 교사는 조 배정 제외", key: "excludeNonClassTeachers" as const },
              { label: "모든 조에 최소 1개 반 배정 (빈 조 방지)", key: "ensureNonEmptyGroups" as const },
              { label: "1·2부 합산 조 수를 짝수로 자동 보정", key: "ensureEvenGroupCount" as const },
              { label: "여러 결과를 비교하고 반 이동까지 보정해 최적 결과 선택", key: "optimizeResults" as const },
            ]).map(({ label, key }) => {
              const checked = rules[key];
              return (
                <label key={key} className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={checked} className="mt-0.5 shrink-0 rounded"
                    onChange={e => setRules(current => ({ ...current, [key]: e.target.checked }))} />
                  <span className={!checked ? "line-through opacity-50" : ""}>{label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* 선택 적용 알고리즘 */}
      <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
        <p className="font-semibold mb-2">선택 적용 알고리즘</p>
        <div className="space-y-1.5">
          {([
            { label: "남녀반 혼성 조 (파송 조장은 본인 외 동성 학생도 포함)", key: "mixGender" as keyof RuleFlags },
            { label: "동성으로만 조 구성 (남학생 반·여학생 반 분리)",       key: "sameGender" as keyof RuleFlags },
          ] as const).map(({ label, key }) => {
            const checked = !!rules[key];
            const isDisabled = (key === "mixGender" && rules.sameGender) || (key === "sameGender" && rules.mixGender);
            return (
              <label key={key} className={`flex items-center gap-2 ${isDisabled ? "opacity-50" : "cursor-pointer"}`}>
                <input type="checkbox" checked={checked} disabled={isDisabled} className="rounded shrink-0"
                  onChange={e => {
                    if (key === "sameGender" && e.target.checked) setRules(r => ({ ...r, sameGender: true, mixGender: false }));
                    else if (key === "mixGender" && e.target.checked) setRules(r => ({ ...r, mixGender: true, sameGender: false }));
                    else setRules(r => ({ ...r, [key]: e.target.checked }));
                  }} />
                <span className={!checked ? "line-through opacity-50" : ""}>{label}</span>
                <span className="ml-auto text-blue-400 text-[10px] shrink-0">택1</span>
              </label>
            );
          })}
          {/* 최소 2반 (독립 규칙) */}
          <label className="flex items-start gap-2 cursor-pointer pt-1 border-t border-blue-100 mt-1">
            <input type="checkbox" checked={rules.minTwoClasses} className="rounded shrink-0 mt-0.5"
              onChange={e => setRules(r => ({ ...r, minTwoClasses: e.target.checked }))} />
            <span className={rules.minTwoClasses ? "" : "line-through opacity-50"}>
              한 조에 2개 이상 다른 반 (조 수는 반 수의 절반까지만)
            </span>
          </label>
        </div>
        <p className="text-[10px] text-blue-400 mt-2 leading-relaxed">
          ※ 선택 규칙과 고려 관계는 <b>반드시 지켜지도록</b> 동일한 최우선순위로 배정됩니다. 동시에 만족할 수 없을 때만 위반이 최소화됩니다.
        </p>
      </div>

      {/* 조당 최대 인원 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">👥 조당 최대 인원</p>
        <div className="flex items-center gap-2">
          <input type="number" min={0} max={30} value={rules.maxGroupSize || ""}
            placeholder="제한 없음"
            onChange={e => {
              const v = parseInt(e.target.value) || 0;
              setRules(r => ({ ...r, maxGroupSize: Math.max(0, Math.min(30, v)) }));
            }}
            className="input w-20 text-center text-sm py-1" />
          <span className="text-xs text-slate-500">명</span>
          {rules.maxGroupSize > 0 && (
            <button onClick={() => setRules(r => ({ ...r, maxGroupSize: 0 }))}
              className="text-xs text-slate-400 hover:text-slate-600 ml-1">해제</button>
          )}
        </div>
        {rules.maxGroupSize > 0 && (
          <p className="text-xs text-blue-500 mt-1.5">
            → 조 수가 자동 계산됩니다
            {bu1Count > 0 && <span className="ml-1">(1부: {groupCount1bu}조</span>}
            {bu2Count > 0 && <span>{bu1Count > 0 ? ", " : "("}2부: {groupCount2bu}조)</span>}
          </p>
        )}
      </div>

      {/* 조 수 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">📊 조 수 설정{rules.maxGroupSize > 0 && <span className="text-blue-400 font-normal ml-1">(자동 계산됨)</span>}</p>
        <div className="space-y-2">
          {([
            { bu: "1부", total: bu1Count, classes: classUnits1.length, maxG: maxGroups1, val: groupCount1bu, set: setGroupCount1bu, cls: "tag-green", fullT: fullTimer1, warn: warn1 },
            { bu: "2부", total: bu2Count, classes: classUnits2.length, maxG: maxGroups2, val: groupCount2bu, set: setGroupCount2bu, cls: "tag-purple", fullT: fullTimer2, warn: warn2 },
          ] as const).map(row => (
            <div key={row.bu} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`tag ${row.cls} text-xs w-10 text-center shrink-0`}>{row.bu}</span>
                <span className="text-xs text-slate-400">{row.classes}개반 / {row.total}명</span>
                <input type="number" min={1} max={row.maxG} value={row.val}
                  onChange={e => row.set(Math.min(row.maxG, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="input w-14 text-center text-sm py-1 ml-auto"
                  disabled={rules.maxGroupSize > 0} />
                <span className="text-xs text-slate-500">조</span>
              </div>
              {rules.minTwoClasses && row.classes > 0 && (
                <p className="text-xs text-blue-500">ℹ 최소 2반 규칙: 최대 {row.maxG}조까지 ({row.classes}개반 ÷ 2)</p>
              )}
              {rules.keepSameClass && rules.ensureNonEmptyGroups && row.val > row.classes && (
                <p className="text-xs text-orange-500">⚠ 조 수({row.val})가 반 수({row.classes})보다 많습니다</p>
              )}
              {row.warn && (
                <p className="text-xs text-red-500">⚠ 전참 교사({row.fullT}명)가 조 수({row.val})보다 적어 일부 조에 전참 교사 미배정될 수 있습니다</p>
              )}
              <p className="text-xs text-slate-300 text-right">
                ≈ {Math.round(row.total / row.val)}명/조
                {rules.maxGroupSize > 0 && row.total > 0 && Math.round(row.total / row.val) > rules.maxGroupSize && (
                  <span className="ml-2 text-red-400">최대 {rules.maxGroupSize}명 초과</span>
                )}
                {row.total > 0 && <span className="ml-2 text-green-400">전참교사 {row.fullT}명</span>}
              </p>
            </div>
          ))}
        </div>
        <div className={`mt-2 rounded-lg px-2.5 py-2 text-xs ${groupCountAdjustment ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
          합계 {combinedGroupCount}조
          {!rules.ensureEvenGroupCount
            ? " · 짝수 자동 보정 꺼짐"
            : groupCountAdjustment
            ? ` → 실행 시 ${groupCountAdjustment}로 자동 보정 (총 ${evenGroupCounts.groupCount1bu + evenGroupCounts.groupCount2bu}조)`
            : " · 짝수 조건 충족"}
          {scope !== "all" && (
            <span className="block mt-1 opacity-80">
              {scope === "1부" ? `2부 현재 ${currentGroupCount2bu}조 유지` : `1부 현재 ${currentGroupCount1bu}조 유지`}
            </span>
          )}
        </div>
      </div>

      {/* 조장 반 설정 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">⭐ 조장 설정</p>
        <p className="text-[10px] text-slate-400 mb-2">
          {rules.keepSameClass
            ? <>기본은 본인반 동반입니다. 본인반 없이 다른 조를 섬기는 조장만 <strong className="text-emerald-600">파송</strong>을 체크하세요.</>
            : <>같은 반 유지가 꺼져 있어 조장 본인만 해당 조에 고정됩니다. 본인반 학생을 해당 조에서 제외하려면 <strong className="text-emerald-600">파송</strong>을 체크하세요.</>}
        </p>
        {([
          { bu: "1부" as const, count: groupCount1bu, entries: leaderEntries1, setEntries: setLeaderEntries1, show: bu1Count > 0, tagCls: "tag-green", units: classUnits1 },
          { bu: "2부" as const, count: groupCount2bu, entries: leaderEntries2, setEntries: setLeaderEntries2, show: bu2Count > 0, tagCls: "tag-purple", units: classUnits2 },
        ]).map(row => !row.show ? null : (
          <div key={row.bu} className="mb-3">
            <p className={`tag ${row.tagCls} text-[10px] mb-1.5`}>{row.bu}</p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {Array.from({ length: row.count }, (_, i) => {
                const entry: LeaderEntry = row.entries[i] || emptyEntry();
                const gradeNum = entry.grade ? parseInt(entry.grade) : null;
                const clsNum   = entry.cls   ? parseInt(entry.cls)   : null;

                // 이 부서 이름 후보 (이름 입력 → 후보 선택)
                const cands = row.units.flatMap(u => u.names.map((name, studentIndex) => ({
                  name, bu: row.bu, grade: u.grade, cls: u.classNum, studentId: u.studentIds[studentIndex],
                })));

                // 같은 반을 다른 조장 칸에서 이미 골랐으면 중복 표시
                const isDuplicate = entry.mode !== "sent" && entry.name.trim() && gradeNum !== null && clsNum !== null
                  ? row.entries.slice(0, i).some(e => {
                      if (e?.mode === "sent") return false;
                      const eg = e?.grade ? parseInt(e.grade) : null;
                      const ec = e?.cls   ? parseInt(e.cls)   : null;
                      return eg === gradeNum && ec === clsNum;
                    })
                  : false;

                return (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 w-5 shrink-0 text-right">{i + 1}조</span>
                    <StudentNamePicker
                      value={{ bu: row.bu, grade: entry.grade, cls: entry.cls, name: entry.name, studentId: entry.studentId }}
                      candidates={cands}
                      placeholder="이름 입력"
                      onPick={p => {
                        const next = row.entries.map((en, j) =>
                          j === i ? { ...en, name: p.name, grade: p.grade, cls: p.cls, studentId: p.studentId } : en
                        );
                        row.setEntries(next);
                      }}
                    />
                    {entry.name && (
                      <label className={`flex items-center gap-1 shrink-0 rounded-md border px-1.5 py-1 text-[10px] cursor-pointer ${entry.mode === "sent" ? "border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold" : "border-slate-200 bg-white text-slate-500"}`}>
                        <input type="checkbox" className="accent-emerald-600"
                          aria-label={`${entry.name} 파송`}
                          checked={entry.mode === "sent"}
                          onChange={e => {
                            const next = row.entries.map((en, j) =>
                              j === i ? { ...en, mode: e.target.checked ? "sent" as const : "withClass" as const } : en
                            );
                            row.setEntries(next);
                          }} />
                        파송
                      </label>
                    )}
                    {isDuplicate && <span className="text-[10px] text-orange-500 shrink-0">중복</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 학생 고려 관계 — 이름 입력 → 후보(부·학년·반) 선택 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1">🙅 학생 고려 관계</p>
        <p className="text-[10px] text-slate-400 mb-2">이름을 입력하면 아래에 후보가 떠요. 두 학생은 다른 조로 분리됩니다.</p>
        <div className="space-y-1 mb-2 max-h-28 overflow-y-auto">
          {studentConflicts.length === 0 && <p className="text-xs text-slate-300 italic">없음</p>}
          {studentConflicts.map((c, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-red-50 rounded px-2 py-1">
              <span className="text-red-700 font-medium">{c.a}</span>
              <span className="text-slate-400">↔</span>
              <span className="text-red-700 font-medium">{c.b}</span>
              <button onClick={() => setStudentConflicts(p => p.filter((_, j) => j !== i))}
                className="ml-auto text-slate-300 hover:text-red-400 text-base leading-none">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-1 mb-1">
          <StudentNamePicker value={newSC.a} candidates={studentCandidates} placeholder="이름A 입력"
            onPick={p => setNewSC(prev => ({ ...prev, a: p }))} />
        </div>
        <div className="flex gap-1 items-stretch">
          <StudentNamePicker value={newSC.b} candidates={studentCandidates} placeholder="이름B 입력"
            onPick={p => setNewSC(prev => ({ ...prev, b: p }))} />
          <button onClick={addSC} disabled={!newSC.a.name || !newSC.b.name}
            className="btn-secondary btn-sm text-xs px-2 shrink-0 disabled:opacity-40">추가</button>
        </div>
      </div>

      {/* 교사 고려 관계 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1">🙅 교사 고려 관계</p>
        <p className="text-[10px] text-slate-400 mb-2">이름을 입력하면 아래에 후보가 떠요. 두 교사는 다른 조로 분리됩니다.</p>
        <div className="space-y-1 mb-2 max-h-28 overflow-y-auto">
          {teacherConflicts.length === 0 && <p className="text-xs text-slate-300 italic">없음</p>}
          {teacherConflicts.map((c, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-orange-50 rounded px-2 py-1">
              <span className="text-orange-700 font-medium">{c.a}</span>
              <span className="text-slate-400">↔</span>
              <span className="text-orange-700 font-medium">{c.b}</span>
              <button onClick={() => setTeacherConflicts(p => p.filter((_, j) => j !== i))}
                className="ml-auto text-slate-300 hover:text-red-400 text-base leading-none">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-1 mb-1">
          <TeacherNamePicker value={newTC.a} candidates={teacherCandidates} placeholder="선생님A 입력"
            onPick={p => setNewTC(prev => ({ ...prev, a: p }))} />
        </div>
        <div className="flex gap-1 items-stretch">
          <TeacherNamePicker value={newTC.b} candidates={teacherCandidates} placeholder="선생님B 입력"
            onPick={p => setNewTC(prev => ({ ...prev, b: p }))} />
          <button onClick={addTC} disabled={!newTC.a.name || !newTC.b.name}
            className="btn-secondary btn-sm text-xs px-2 shrink-0 disabled:opacity-40">추가</button>
        </div>
      </div>

      {/* 교사-학생 고려 관계 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1">🙅 교사-학생 고려 관계</p>
        <p className="text-[10px] text-slate-400 mb-2">교사·학생 이름을 각각 입력해 후보를 고르면, 둘은 다른 조로 분리됩니다.</p>
        <div className="space-y-1 mb-2 max-h-28 overflow-y-auto">
          {teacherStudentConflicts.length === 0 && <p className="text-xs text-slate-300 italic">없음</p>}
          {teacherStudentConflicts.map((c, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-purple-50 rounded px-2 py-1">
              <span className="text-purple-700 font-medium">{c.a}</span>
              <span className="text-slate-400">↔</span>
              <span className="text-purple-700 font-medium">{c.b}</span>
              <button onClick={() => setTeacherStudentConflicts(p => p.filter((_, j) => j !== i))}
                className="ml-auto text-slate-300 hover:text-red-400 text-base leading-none">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-1 mb-1">
          <TeacherNamePicker value={newTSC.teacher} candidates={teacherCandidates} placeholder="선생님 입력"
            onPick={p => setNewTSC(prev => ({ ...prev, teacher: p }))} />
        </div>
        <div className="flex gap-1 items-stretch">
          <StudentNamePicker value={newTSC.student} candidates={studentCandidates} placeholder="학생 이름 입력"
            onPick={p => setNewTSC(prev => ({ ...prev, student: p }))} />
          <button onClick={addTSC} disabled={!newTSC.teacher.name || !newTSC.student.name}
            className="btn-secondary btn-sm text-xs px-2 shrink-0 disabled:opacity-40">추가</button>
        </div>
      </div>

      {/* 반 고려 관계 — 두 반을 같은 조에서 분리 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1">🙅 반 고려 관계</p>
        <p className="text-[10px] text-slate-400 mb-2">선택한 두 반은 같은 조에 배정되지 않습니다.</p>
        <div className="space-y-1 mb-2 max-h-28 overflow-y-auto">
          {classConflicts.length === 0 && <p className="text-xs text-slate-300 italic">없음</p>}
          {classConflicts.map((c, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-teal-50 rounded px-2 py-1">
              <span className="text-teal-700 font-medium">{classLabel(c.a)}</span>
              <span className="text-slate-400">↔</span>
              <span className="text-teal-700 font-medium">{classLabel(c.b)}</span>
              <button onClick={() => setClassConflicts(p => p.filter((_, j) => j !== i))}
                className="ml-auto text-slate-300 hover:text-red-400 text-base leading-none">×</button>
            </div>
          ))}
        </div>
        {/* 반A/반B — 부서·학년·반·(추가버튼) 4트랙 grid로 두 줄 폭을 고정 통일
            (각 줄을 독립 flex로 두면 B줄만 버튼 때문에 select가 좁아져 A줄과 어긋난다) */}
        <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: "1fr 1fr 1fr 40px" }}>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCC.a.bu}
            onChange={e => setNewCC(p => ({ ...p, a: { bu: e.target.value, grade: "", cls: "" } }))}>
            <option value="">부서</option>
            <option value="1부">1부</option>
            <option value="2부">2부</option>
          </select>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCC.a.grade}
            onChange={e => setNewCC(p => ({ ...p, a: { ...p.a, grade: e.target.value, cls: "" } }))}>
            <option value="">학년</option>
            {getGrades(newCC.a.bu).map(g => <option key={g} value={String(g)}>{g}학년</option>)}
          </select>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCC.a.cls}
            onChange={e => setNewCC(p => ({ ...p, a: { ...p.a, cls: e.target.value } }))}>
            <option value="">반A</option>
            {getClasses(newCC.a.bu, newCC.a.grade).map(c => <option key={c} value={String(c)}>{c}반</option>)}
          </select>
          {/* 4번째 트랙 폭 확보용 빈 칸 (B줄 버튼과 같은 폭) */}
          <div />
        </div>
        <div className="grid gap-1 items-stretch" style={{ gridTemplateColumns: "1fr 1fr 1fr 40px" }}>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCC.b.bu}
            onChange={e => setNewCC(p => ({ ...p, b: { bu: e.target.value, grade: "", cls: "" } }))}>
            <option value="">부서</option>
            <option value="1부">1부</option>
            <option value="2부">2부</option>
          </select>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCC.b.grade}
            onChange={e => setNewCC(p => ({ ...p, b: { ...p.b, grade: e.target.value, cls: "" } }))}>
            <option value="">학년</option>
            {getGrades(newCC.b.bu).map(g => <option key={g} value={String(g)}>{g}학년</option>)}
          </select>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCC.b.cls}
            onChange={e => setNewCC(p => ({ ...p, b: { ...p.b, cls: e.target.value } }))}>
            <option value="">반B</option>
            {getClasses(newCC.b.bu, newCC.b.grade).map(c => <option key={c} value={String(c)}>{c}반</option>)}
          </select>
          <button onClick={addCC} disabled={!ccKey(newCC.a) || !ccKey(newCC.b) || ccKey(newCC.a) === ccKey(newCC.b)}
            className="btn-secondary btn-sm text-xs px-1 disabled:opacity-40 w-full">추가</button>
        </div>
      </div>

      {/* 반 붙임 관계 — 두 반을 반드시 같은 조로 (붙임끼리 연쇄되면 한 묶음) */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1">🤝 반 붙임 관계</p>
        <p className="text-[10px] text-slate-400 mb-2">선택한 두 반은 반드시 같은 조에 배정됩니다. 붙임끼리 이어지면(A+B, B+C) 전부 한 조가 됩니다.</p>
        <div className="space-y-1 mb-2 max-h-28 overflow-y-auto">
          {classAffinities.length === 0 && <p className="text-xs text-slate-300 italic">없음</p>}
          {classAffinities.map((c, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-amber-50 rounded px-2 py-1">
              <span className="text-amber-700 font-medium">{classLabel(c.a)}</span>
              <span className="text-slate-400">+</span>
              <span className="text-amber-700 font-medium">{classLabel(c.b)}</span>
              <button onClick={() => setClassAffinities(p => p.filter((_, j) => j !== i))}
                aria-label="붙임 관계 삭제"
                className="ml-auto text-slate-300 hover:text-red-400 text-base leading-none">×</button>
            </div>
          ))}
        </div>
        <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: "1fr 1fr 1fr 40px" }}>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCA.a.bu}
            onChange={e => setNewCA(p => ({ ...p, a: { bu: e.target.value, grade: "", cls: "" } }))}>
            <option value="">부서</option>
            <option value="1부">1부</option>
            <option value="2부">2부</option>
          </select>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCA.a.grade}
            onChange={e => setNewCA(p => ({ ...p, a: { ...p.a, grade: e.target.value, cls: "" } }))}>
            <option value="">학년</option>
            {getGrades(newCA.a.bu).map(g => <option key={g} value={String(g)}>{g}학년</option>)}
          </select>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCA.a.cls}
            onChange={e => setNewCA(p => ({ ...p, a: { ...p.a, cls: e.target.value } }))}>
            <option value="">반A</option>
            {getClasses(newCA.a.bu, newCA.a.grade).map(c => <option key={c} value={String(c)}>{c}반</option>)}
          </select>
          <div />
        </div>
        <div className="grid gap-1 items-stretch" style={{ gridTemplateColumns: "1fr 1fr 1fr 40px" }}>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCA.b.bu}
            onChange={e => setNewCA(p => ({ ...p, b: { bu: e.target.value, grade: "", cls: "" } }))}>
            <option value="">부서</option>
            <option value="1부">1부</option>
            <option value="2부">2부</option>
          </select>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCA.b.grade}
            onChange={e => setNewCA(p => ({ ...p, b: { ...p.b, grade: e.target.value, cls: "" } }))}>
            <option value="">학년</option>
            {getGrades(newCA.b.bu).map(g => <option key={g} value={String(g)}>{g}학년</option>)}
          </select>
          <select style={{ minWidth: 0, padding: "2px 2px", fontSize: 11 }}
            className="border border-slate-200 rounded-lg bg-white text-slate-700 w-full"
            value={newCA.b.cls}
            onChange={e => setNewCA(p => ({ ...p, b: { ...p.b, cls: e.target.value } }))}>
            <option value="">반B</option>
            {getClasses(newCA.b.bu, newCA.b.grade).map(c => <option key={c} value={String(c)}>{c}반</option>)}
          </select>
          <button onClick={addCA} disabled={!ccKey(newCA.a) || !ccKey(newCA.b) || ccKey(newCA.a) === ccKey(newCA.b)}
            className="btn-secondary btn-sm text-xs px-1 disabled:opacity-40 w-full">추가</button>
        </div>
      </div>

      {/* 반 결합·분리 모순 — 실행 차단 사유 */}
      {relationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 space-y-1">
          <p className="font-semibold">⚠ 붙임·분리 설정에 모순이 있어 실행할 수 없습니다</p>
          {relationErrors.map((e, i) => <p key={i}>· {e}</p>)}
        </div>
      )}

      {hasLeaderClassDuplicates && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-700">
          <p className="font-semibold">⚠ 본인반 동반 조장이 같은 반에 두 명 있습니다</p>
          <p>둘 중 본인반 없이 섬기는 조장에 `파송`을 체크해주세요.</p>
        </div>
      )}

      <button onClick={onRun} disabled={running || !targetHasStudents || relationErrors.length > 0 || hasLeaderClassDuplicates}
        className="btn-primary w-full justify-center text-sm">
        {running
          ? "⏳ 계산 중..."
          : relationErrors.length > 0 || hasLeaderClassDuplicates
            ? "🚫 모순을 해결해주세요"
            : scope === "all"
              ? "🎲 전체 자동 배정 실행"
              : `🎲 ${scope}만 자동 배정 실행`}
      </button>
    </div>
  );
}
