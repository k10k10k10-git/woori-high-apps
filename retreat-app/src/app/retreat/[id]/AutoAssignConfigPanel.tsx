"use client";
import { useState } from "react";
import { TeacherAttendance } from "@/lib/types";
import { ClassUnit, ConflictPair, RuleFlags, LeaderEntry, parseClassKey } from "./autoAssignUtils";

// ── 타입 ─────────────────────────────────────────────────────────────

interface StudentPicker { bu: string; grade: string; cls: string; name: string; }
interface TeacherPicker { bu: string; name: string; }

interface StudentCandidate { name: string; bu: string; grade: number; cls: number; }
interface TeacherCandidate { name: string; bu: string; }

// ── 이름 우선 선택 컴포넌트 ─────────────────────────────────────────────
// 부서·학년·반을 먼저 고르지 않고, 이름을 입력하면 하단에 후보(부·학년·반)가 떠서 고르는 방식.
// 저장은 이름만(기존 로직과 동일) — 후보의 부/학년/반은 동명이인 확인·표시용.

function StudentNamePicker({ value, candidates, placeholder, onPick }: {
  value: StudentPicker;
  candidates: StudentCandidate[];
  placeholder: string;
  onPick: (p: StudentPicker) => void;
}) {
  const [query, setQuery] = useState("");
  if (value.name) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-white border border-green-300 rounded-lg px-2 py-1 text-xs">
        <span className="font-semibold text-slate-700 truncate">{value.name}</span>
        <span className="text-slate-400 shrink-0">{value.bu} {value.grade}학년 {value.cls}반</span>
        <button type="button" aria-label="선택 취소" onClick={() => { onPick({ bu: "", grade: "", cls: "", name: "" }); setQuery(""); }}
          className="ml-auto text-slate-300 hover:text-red-400 text-base leading-none shrink-0">×</button>
      </div>
    );
  }
  const q = query.trim();
  const matches = q ? candidates.filter(c => c.name.includes(q)).slice(0, 8) : [];
  return (
    <div className="relative flex-1 min-w-0">
      <input className="input w-full text-xs py-0.5" placeholder={placeholder}
        value={query} onChange={e => setQuery(e.target.value)} />
      {matches.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-0.5 rounded-lg border border-slate-200 bg-white shadow-lg max-h-40 overflow-y-auto">
          {matches.map((c, i) => (
            <button type="button" key={`${c.bu}_${c.grade}_${c.cls}_${c.name}_${i}`}
              onClick={() => { onPick({ bu: c.bu, grade: String(c.grade), cls: String(c.cls), name: c.name }); setQuery(""); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 text-xs">
              <span className="font-semibold text-slate-700">{c.name}</span>
              <span className="text-slate-400 ml-auto">{c.bu} {c.grade}학년 {c.cls}반</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TeacherNamePicker({ value, candidates, placeholder, onPick }: {
  value: TeacherPicker;
  candidates: TeacherCandidate[];
  placeholder: string;
  onPick: (p: TeacherPicker) => void;
}) {
  const [query, setQuery] = useState("");
  if (value.name) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-white border border-green-300 rounded-lg px-2 py-1 text-xs">
        <span className="font-semibold text-slate-700 truncate">{value.name}</span>
        <span className="text-slate-400 shrink-0">{value.bu}</span>
        <button type="button" aria-label="선택 취소" onClick={() => { onPick({ bu: "", name: "" }); setQuery(""); }}
          className="ml-auto text-slate-300 hover:text-red-400 text-base leading-none shrink-0">×</button>
      </div>
    );
  }
  const q = query.trim();
  const matches = q ? candidates.filter(c => c.name.includes(q)).slice(0, 8) : [];
  return (
    <div className="relative flex-1 min-w-0">
      <input className="input w-full text-xs py-0.5" placeholder={placeholder}
        value={query} onChange={e => setQuery(e.target.value)} />
      {matches.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-0.5 rounded-lg border border-slate-200 bg-white shadow-lg max-h-40 overflow-y-auto">
          {matches.map((c, i) => (
            <button type="button" key={`${c.bu}_${c.name}_${i}`}
              onClick={() => { onPick({ bu: c.bu, name: c.name }); setQuery(""); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 text-xs">
              <span className="font-semibold text-slate-700">{c.name}</span>
              <span className="text-slate-400 ml-auto">{c.bu}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  // 드롭다운 입력 상태
  newSC: { a: StudentPicker; b: StudentPicker };
  setNewSC: React.Dispatch<React.SetStateAction<{ a: StudentPicker; b: StudentPicker }>>;
  newTC: { a: TeacherPicker; b: TeacherPicker };
  setNewTC: React.Dispatch<React.SetStateAction<{ a: TeacherPicker; b: TeacherPicker }>>;
  newTSC: { teacher: TeacherPicker; student: StudentPicker };
  setNewTSC: React.Dispatch<React.SetStateAction<{ teacher: TeacherPicker; student: StudentPicker }>>;
  newCC: { a: string; b: string };
  setNewCC: React.Dispatch<React.SetStateAction<{ a: string; b: string }>>;
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
  onRun: () => void;
  onCollapse: () => void;
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────

function emptyPicker(): StudentPicker { return { bu: "", grade: "", cls: "", name: "" }; }
function emptyTpicker(): TeacherPicker { return { bu: "", name: "" }; }
function emptyEntry(): LeaderEntry { return { name: "", grade: "", cls: "" }; }

// ── 컴포넌트 ─────────────────────────────────────────────────────────

export default function AutoAssignConfigPanel({
  groupCount1bu, groupCount2bu, setGroupCount1bu, setGroupCount2bu,
  rules, setRules,
  studentConflicts, setStudentConflicts,
  teacherConflicts, setTeacherConflicts,
  teacherStudentConflicts, setTeacherStudentConflicts,
  classConflicts, setClassConflicts,
  newSC, setNewSC, newTC, setNewTC, newTSC, setNewTSC, newCC, setNewCC,
  leaderEntries1, setLeaderEntries1, leaderEntries2, setLeaderEntries2,
  classUnits1, classUnits2, maxGroups1, maxGroups2, bu1Count, bu2Count,
  teachers, running, onRun, onCollapse,
}: AutoAssignConfigPanelProps) {

  // 이름 우선 선택용 후보 목록 (부·학년·반 표시)
  const studentCandidates: StudentCandidate[] = [...classUnits1, ...classUnits2]
    .flatMap(u => u.names.map(name => ({ name, bu: u.bu, grade: u.grade, cls: u.classNum })));
  const teacherCandidates: TeacherCandidate[] = [
    ...new Map(
      teachers.filter(t => parseClassKey(t.classKey) !== null).map(t => [`${t.bu}_${t.name}`, { name: t.name, bu: t.bu }])
    ).values(),
  ];
  // 반 고려용 전체 반 목록 (unitKey + 표시 라벨)
  const allClassUnits = [...classUnits1, ...classUnits2];
  const classLabel = (key: string) => {
    const u = allClassUnits.find(cu => cu.key === key);
    return u ? `${u.bu} ${u.grade}학년 ${u.classNum}반` : key;
  };

  // 반 담당 전참 교사 수 체크 (스탭/부장/회계 제외)
  const fullTimer1 = teachers.filter(t => t.bu === "1부" && t.status === "전참" && parseClassKey(t.classKey) !== null).length;
  const fullTimer2 = teachers.filter(t => t.bu === "2부" && t.status === "전참" && parseClassKey(t.classKey) !== null).length;
  const warn1 = bu1Count > 0 && groupCount1bu > fullTimer1;
  const warn2 = bu2Count > 0 && groupCount2bu > fullTimer2;

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
    if (!newCC.a || !newCC.b || newCC.a === newCC.b) return;
    // 이미 있는 쌍(순서 무관) 중복 방지
    if (classConflicts.some(c => (c.a === newCC.a && c.b === newCC.b) || (c.a === newCC.b && c.b === newCC.a))) {
      setNewCC({ a: "", b: "" });
      return;
    }
    setClassConflicts(p => [...p, { a: newCC.a, b: newCC.b }]);
    setNewCC({ a: "", b: "" });
  }

  return (
    <div className="card p-4 space-y-4 text-sm sticky top-4 max-h-[calc(100vh-5rem)] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-700 flex items-center gap-1.5">🎲 자동 조편성</h3>
        <button onClick={onCollapse} className="text-slate-300 hover:text-slate-500 text-xs">◀ 접기</button>
      </div>

      {/* 기본 적용 알고리즘 */}
      <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
        <p className="font-semibold mb-2 text-slate-700">기본 적용 알고리즘</p>
        <div className="space-y-1">
          {[
            "같은 반 학생은 반드시 같은 조로 배정",
            "홀수반 = 남학생 반, 짝수반 = 여학생 반으로 자동 구분",
            "스탭·부장·회계 교사는 조 배정 제외 (반 담당 교사만 배정)",
            "반 담당 교사를 해당 반이 속한 조에 자동 배치",
            "전참 교사가 있는 조에 우선 배정",
            "조장 지정 시 해당 반 전체를 그 조에 고정",
            "고려 관계(학생·교사·교사학생·반) 설정 시 반드시 다른 조로 분리",
            "모든 조의 인원 수를 최대한 균등하게 배분",
            "특정 학년이 한 조에 몰리지 않도록 분산 배정",
            "16회 반복 실행 후 최적 결과 자동 선택",
          ].map(label => (
            <div key={label} className="flex items-start gap-1.5">
              <span className="text-slate-400 shrink-0 mt-px">·</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 선택 적용 알고리즘 */}
      <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
        <p className="font-semibold mb-2">선택 적용 알고리즘</p>
        <div className="space-y-1.5">
          {([
            { label: "남녀반 혼성 조 (남·여 반이 각 조에 최소 1개씩 포함)", key: "mixGender" as keyof RuleFlags },
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
            {bu1Count > 0 && <span className="ml-1">(1부: {Math.ceil(bu1Count / rules.maxGroupSize)}조</span>}
            {bu2Count > 0 && <span>{bu1Count > 0 ? ", " : "("}2부: {Math.ceil(bu2Count / rules.maxGroupSize)}조)</span>}
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
              {row.val > row.classes && (
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
      </div>

      {/* 조장 반 설정 */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">⭐ 조장 설정</p>
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

                // 선택된 학년의 반 목록
                const availableClasses = gradeNum !== null
                  ? row.units.filter(u => u.grade === gradeNum).map(u => u.classNum).sort((a, b) => a - b)
                  : [];

                // 선택된 학년+반의 학생 목록
                const selectedUnit = (gradeNum !== null && clsNum !== null)
                  ? row.units.find(u => u.grade === gradeNum && u.classNum === clsNum)
                  : null;
                const availableNames = selectedUnit?.names ?? [];

                const isDuplicate = entry.name.trim() && gradeNum !== null && clsNum !== null
                  ? row.entries.slice(0, i).some(e => {
                      const eg = e?.grade ? parseInt(e.grade) : null;
                      const ec = e?.cls   ? parseInt(e.cls)   : null;
                      return eg === gradeNum && ec === clsNum;
                    })
                  : false;

                const isComplete = entry.name.trim() && gradeNum !== null && clsNum !== null;

                return (
                  <div key={i} className="flex items-center gap-0.5">
                    <span className="text-[10px] text-slate-400 w-5 shrink-0 text-right">{i + 1}조</span>
                    {/* 학년 */}
                    <select
                      style={{ width: 52, minWidth: 0, padding: "2px 2px", fontSize: 11 }}
                      className="border border-slate-200 rounded-lg bg-white text-slate-700 text-center shrink-0"
                      value={entry.grade}
                      onChange={e => {
                        const next = row.entries.map((en, j) =>
                          j === i ? { grade: e.target.value, cls: "", name: "" } : en
                        );
                        row.setEntries(next);
                      }}
                    >
                      <option value="">학년</option>
                      <option value="1">1학년</option>
                      <option value="2">2학년</option>
                      <option value="3">3학년</option>
                    </select>
                    {/* 반 */}
                    <select
                      style={{ width: 40, minWidth: 0, padding: "2px 0px", fontSize: 11 }}
                      className="border border-slate-200 rounded-lg bg-white text-slate-700 text-center shrink-0 disabled:opacity-40"
                      value={entry.cls}
                      disabled={availableClasses.length === 0}
                      onChange={e => {
                        const next = row.entries.map((en, j) =>
                          j === i ? { ...en, cls: e.target.value, name: "" } : en
                        );
                        row.setEntries(next);
                      }}
                    >
                      <option value="">반</option>
                      {availableClasses.map(c => (
                        <option key={c} value={String(c)}>{c}반</option>
                      ))}
                    </select>
                    {/* 이름 */}
                    <select
                      className={`input flex-1 min-w-0 text-xs py-0.5 ${isDuplicate ? "border-orange-400" : isComplete ? "border-green-400" : ""}`}
                      value={entry.name}
                      disabled={availableNames.length === 0}
                      onChange={e => {
                        const next = row.entries.map((en, j) =>
                          j === i ? { ...en, name: e.target.value } : en
                        );
                        row.setEntries(next);
                      }}
                    >
                      <option value="">이름</option>
                      {availableNames.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
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
        <div className="flex gap-1 items-center">
          <select className="input flex-1 min-w-0 text-xs py-0.5" value={newCC.a}
            onChange={e => setNewCC(p => ({ ...p, a: e.target.value }))}>
            <option value="">반A</option>
            {allClassUnits.map(u => <option key={u.key} value={u.key}>{u.bu} {u.grade}학년 {u.classNum}반</option>)}
          </select>
          <span className="text-slate-400 text-xs shrink-0">↔</span>
          <select className="input flex-1 min-w-0 text-xs py-0.5" value={newCC.b}
            onChange={e => setNewCC(p => ({ ...p, b: e.target.value }))}>
            <option value="">반B</option>
            {allClassUnits.map(u => <option key={u.key} value={u.key}>{u.bu} {u.grade}학년 {u.classNum}반</option>)}
          </select>
          <button onClick={addCC} disabled={!newCC.a || !newCC.b || newCC.a === newCC.b}
            className="btn-secondary btn-sm text-xs px-2 shrink-0 disabled:opacity-40">추가</button>
        </div>
      </div>

      <button onClick={onRun} disabled={running || (bu1Count === 0 && bu2Count === 0)}
        className="btn-primary w-full justify-center text-sm">
        {running ? "⏳ 계산 중..." : "🎲 자동 배정 실행"}
      </button>
    </div>
  );
}
