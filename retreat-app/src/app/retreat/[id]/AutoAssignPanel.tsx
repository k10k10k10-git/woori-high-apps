"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Group, Participant, TeacherAttendance } from "@/lib/types";
import {
  ClassUnit, ConflictPair, RuleFlags, LeaderEntry,
  buildClassUnits, findLeaderUnit, runAutoAssign,
} from "./autoAssignUtils";
import AutoAssignConfigPanel from "./AutoAssignConfigPanel";
import AutoAssignPreviewModal from "./AutoAssignPreviewModal";

// Re-export for any external consumers
export type { LeaderEntry } from "./autoAssignUtils";

// ── 타입 ─────────────────────────────────────────────────────────────

interface Props {
  participants: Record<string, Participant>;
  teachers: TeacherAttendance[];
  students: Record<string, { name: string; grade: number; class: number }>;
  onApply: (groups: Group[]) => void;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────

export default function AutoAssignPanel({ participants, teachers, students, onApply }: Props) {
  const [groupCount1bu, setGroupCount1bu] = useState(10);
  const [groupCount2bu, setGroupCount2bu] = useState(10);
  const [rules, setRules] = useState<RuleFlags>({
    assignTeachers:   true,
    requireFullTimer: true,
    pinLeaders:       true,
    applyConflicts:   true,
    mixGender:        true,
    sameGender:       false,
    balanceGrade:     true,
    balanceSize:      true,
    minTwoClasses:    false,
    maxGroupSize:     0,
  });
  const [studentConflicts, setStudentConflicts] = useState<ConflictPair[]>([]);
  const [teacherConflicts, setTeacherConflicts] = useState<ConflictPair[]>([]);
  const [teacherStudentConflicts, setTeacherStudentConflicts] = useState<ConflictPair[]>([]);
  const [classConflicts, setClassConflicts] = useState<ConflictPair[]>([]);
  // 드롭다운 입력 상태
  const emptyPicker = () => ({ bu: "", grade: "", cls: "", name: "" });
  const emptyTpicker = () => ({ bu: "", name: "" });
  const [newSC, setNewSC] = useState({ a: emptyPicker(), b: emptyPicker() });
  const [newTC, setNewTC] = useState({ a: emptyTpicker(), b: emptyTpicker() });
  const [newTSC, setNewTSC] = useState({ teacher: emptyTpicker(), student: emptyPicker() });
  // 반 고려 관계 입력: 부서·학년·반 3단 선택 (unitKey는 추가 시점에 조합)
  const emptyClsPick = () => ({ bu: "", grade: "", cls: "" });
  const [newCC, setNewCC] = useState<{ a: { bu: string; grade: string; cls: string }; b: { bu: string; grade: string; cls: string } }>({ a: emptyClsPick(), b: emptyClsPick() });
  // 조장 설정 (이름+학년+반, 동명이인 구분용)
  const emptyEntry = (): LeaderEntry => ({ name: "", grade: "", cls: "" });
  const [leaderEntries1, setLeaderEntries1] = useState<LeaderEntry[]>(Array(20).fill(null).map(emptyEntry));
  const [leaderEntries2, setLeaderEntries2] = useState<LeaderEntry[]>(Array(20).fill(null).map(emptyEntry));
  const [preview, setPreview] = useState<{ groups: Group[]; units1: ClassUnit[]; units2: ClassUnit[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // 버그#1: 모달 열릴 때 스크롤 위치 보존
  const closePreview = useCallback(() => {
    const scrollY = parseInt(document.body.style.top || "0") * -1;
    document.body.style.overflow = "";
    document.body.style.top = "";
    window.scrollTo(0, scrollY || 0);
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!preview) return;
    const y = window.scrollY;
    document.body.style.top = `-${y}px`;
    document.body.style.overflow = "hidden";
    // 버그#4: ESC 닫기
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePreview(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [preview, closePreview]);

  // 반 구성 미리보기 (students DB 기준으로 반 단위 구성)
  const classUnits1 = useMemo(() => buildClassUnits(participants, "1부", students), [participants, students]);
  const classUnits2 = useMemo(() => buildClassUnits(participants, "2부", students), [participants, students]);

  const bu1Count = classUnits1.reduce((acc, u) => acc + u.studentIds.length, 0);
  const bu2Count = classUnits2.reduce((acc, u) => acc + u.studentIds.length, 0);

  // 조 수 상한: 최소 2반 규칙이 켜지면 조당 서로 다른 반이 2개 이상 필요 → 반 수의 절반까지만 가능.
  const maxGroups1 = rules.minTwoClasses ? Math.max(1, Math.floor(classUnits1.length / 2)) : classUnits1.length;
  const maxGroups2 = rules.minTwoClasses ? Math.max(1, Math.floor(classUnits2.length / 2)) : classUnits2.length;

  // maxGroupSize/인원수/최소2반 변경 시 조 수 자동 계산·클램프 (렌더 중 조정 — effect 대신)
  const [prevAutoCalc, setPrevAutoCalc] = useState({ maxGroupSize: rules.maxGroupSize, bu1Count, bu2Count, minTwoClasses: rules.minTwoClasses, cls1: classUnits1.length, cls2: classUnits2.length });
  if (
    rules.maxGroupSize !== prevAutoCalc.maxGroupSize ||
    bu1Count !== prevAutoCalc.bu1Count ||
    bu2Count !== prevAutoCalc.bu2Count ||
    rules.minTwoClasses !== prevAutoCalc.minTwoClasses ||
    classUnits1.length !== prevAutoCalc.cls1 ||
    classUnits2.length !== prevAutoCalc.cls2
  ) {
    setPrevAutoCalc({ maxGroupSize: rules.maxGroupSize, bu1Count, bu2Count, minTwoClasses: rules.minTwoClasses, cls1: classUnits1.length, cls2: classUnits2.length });
    if (rules.maxGroupSize > 0) {
      // 조당 최대 인원으로 조 수를 역산하되, 최소2반 상한을 넘지 않게 클램프
      if (bu1Count > 0) setGroupCount1bu(Math.min(maxGroups1, Math.max(1, Math.ceil(bu1Count / rules.maxGroupSize))));
      if (bu2Count > 0) setGroupCount2bu(Math.min(maxGroups2, Math.max(1, Math.ceil(bu2Count / rules.maxGroupSize))));
    } else if (rules.minTwoClasses) {
      // 최소2반만 켠 경우: 현재 조 수가 상한을 넘으면 상한으로 내림
      if (groupCount1bu > maxGroups1) setGroupCount1bu(maxGroups1);
      if (groupCount2bu > maxGroups2) setGroupCount2bu(maxGroups2);
    }
  }

  function run() {
    setRunning(true);
    setTimeout(() => {
      // 조장 항목 → unitKey 변환
      const pinnedKeys1 = Array.from({ length: groupCount1bu }, (_, i) =>
        findLeaderUnit(leaderEntries1[i] ?? emptyEntry(), "1부", participants, students)?.unitKey ?? null
      );
      const pinnedKeys2 = Array.from({ length: groupCount2bu }, (_, i) =>
        findLeaderUnit(leaderEntries2[i] ?? emptyEntry(), "2부", participants, students)?.unitKey ?? null
      );
      const leaderNames1 = leaderEntries1.map(e => e.name);
      const leaderNames2 = leaderEntries2.map(e => e.name);
      const groups = runAutoAssign(
        groupCount1bu, groupCount2bu, rules,
        studentConflicts, teacherConflicts, teacherStudentConflicts, classConflicts, participants, teachers, students,
        pinnedKeys1, pinnedKeys2, leaderNames1, leaderNames2,
      );
      setPreview({ groups, units1: classUnits1, units2: classUnits2 });
      setRunning(false);
    }, 50);
  }

  if (collapsed) {
    return (
      <div className="card p-3 cursor-pointer hover:bg-slate-50" onClick={() => setCollapsed(false)}>
        <div className="text-sm font-semibold text-slate-600 flex items-center gap-2">
          <span>🎲</span> 자동 배정
          <span className="text-slate-300 text-xs ml-auto">▶</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <AutoAssignConfigPanel
        groupCount1bu={groupCount1bu}
        groupCount2bu={groupCount2bu}
        setGroupCount1bu={setGroupCount1bu}
        setGroupCount2bu={setGroupCount2bu}
        rules={rules}
        setRules={setRules}
        studentConflicts={studentConflicts}
        setStudentConflicts={setStudentConflicts}
        teacherConflicts={teacherConflicts}
        setTeacherConflicts={setTeacherConflicts}
        teacherStudentConflicts={teacherStudentConflicts}
        setTeacherStudentConflicts={setTeacherStudentConflicts}
        classConflicts={classConflicts}
        setClassConflicts={setClassConflicts}
        newSC={newSC}
        setNewSC={setNewSC}
        newTC={newTC}
        setNewTC={setNewTC}
        newTSC={newTSC}
        setNewTSC={setNewTSC}
        newCC={newCC}
        setNewCC={setNewCC}
        leaderEntries1={leaderEntries1}
        setLeaderEntries1={setLeaderEntries1}
        leaderEntries2={leaderEntries2}
        setLeaderEntries2={setLeaderEntries2}
        classUnits1={classUnits1}
        classUnits2={classUnits2}
        maxGroups1={maxGroups1}
        maxGroups2={maxGroups2}
        bu1Count={bu1Count}
        bu2Count={bu2Count}
        teachers={teachers}
        running={running}
        onRun={run}
        onCollapse={() => setCollapsed(true)}
      />

      {preview && (
        <AutoAssignPreviewModal
          groups={preview.groups}
          units1={preview.units1}
          units2={preview.units2}
          teachers={teachers}
          onApply={onApply}
          onRerun={run}
          onClose={closePreview}
        />
      )}
    </>
  );
}
