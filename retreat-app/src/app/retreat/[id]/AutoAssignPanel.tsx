"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Group, Participant, TeacherAttendance } from "@/lib/types";
import { DEFAULT_AUTO_ASSIGN_RULES, emptyLeaderEntry } from "@/lib/autoAssignConfig";
import { getAutoAssignConfig, saveAutoAssignConfig } from "@/lib/db";
import {
  ClassUnit, ConflictPair, RuleFlags, LeaderEntry,
  buildAffinityBundles, buildClassUnits, calculateEvenGroupCountsForMaxSize, ensureEvenCombinedGroupCounts, runAutoAssign, validateClassRelations,
} from "./autoAssignUtils";
import AutoAssignConfigPanel from "./AutoAssignConfigPanel";
import AutoAssignPreviewModal from "./AutoAssignPreviewModal";

// Re-export for any external consumers
export type { LeaderEntry } from "./autoAssignUtils";

// ── 타입 ─────────────────────────────────────────────────────────────

interface Props {
  retreatId: string;
  participants: Record<string, Participant>;
  teachers: TeacherAttendance[];
  students: Record<string, { name: string; grade: number; class: number }>;
  onApply: (groups: Group[]) => void;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────

export default function AutoAssignPanel({ retreatId, participants, teachers, students, onApply }: Props) {
  const [groupCount1bu, setGroupCount1bu] = useState(10);
  const [groupCount2bu, setGroupCount2bu] = useState(10);
  const [rules, setRules] = useState<RuleFlags>({ ...DEFAULT_AUTO_ASSIGN_RULES });
  const [studentConflicts, setStudentConflicts] = useState<ConflictPair[]>([]);
  const [teacherConflicts, setTeacherConflicts] = useState<ConflictPair[]>([]);
  const [teacherStudentConflicts, setTeacherStudentConflicts] = useState<ConflictPair[]>([]);
  const [classConflicts, setClassConflicts] = useState<ConflictPair[]>([]);
  const [classAffinities, setClassAffinities] = useState<ConflictPair[]>([]); // 반 붙임(결합) — 같은 조 보장
  // 드롭다운 입력 상태
  const emptyPicker = () => ({ bu: "", grade: "", cls: "", name: "", studentId: "" });
  const emptyTpicker = () => ({ bu: "", name: "" });
  const [newSC, setNewSC] = useState({ a: emptyPicker(), b: emptyPicker() });
  const [newTC, setNewTC] = useState({ a: emptyTpicker(), b: emptyTpicker() });
  const [newTSC, setNewTSC] = useState({ teacher: emptyTpicker(), student: emptyPicker() });
  // 반 고려 관계 입력: 부서·학년·반 3단 선택 (unitKey는 추가 시점에 조합)
  const emptyClsPick = () => ({ bu: "", grade: "", cls: "" });
  const [newCC, setNewCC] = useState<{ a: { bu: string; grade: string; cls: string }; b: { bu: string; grade: string; cls: string } }>({ a: emptyClsPick(), b: emptyClsPick() });
  const [newCA, setNewCA] = useState<{ a: { bu: string; grade: string; cls: string }; b: { bu: string; grade: string; cls: string } }>({ a: emptyClsPick(), b: emptyClsPick() });
  // 조장 설정 (이름+학년+반, 동명이인 구분용)
  const [leaderEntries1, setLeaderEntries1] = useState<LeaderEntry[]>(Array.from({ length: 20 }, emptyLeaderEntry));
  const [leaderEntries2, setLeaderEntries2] = useState<LeaderEntry[]>(Array.from({ length: 20 }, emptyLeaderEntry));
  const [preview, setPreview] = useState<{ groups: Group[]; units1: ClassUnit[]; units2: ClassUnit[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    setConfigNotice(null);
    setConfigError(null);
    // 다른 수련회로 이동했을 때 직전 수련회의 설정이 잠깐이라도 섞이지 않게 먼저 초기화한다.
    setGroupCount1bu(10);
    setGroupCount2bu(10);
    setRules({ ...DEFAULT_AUTO_ASSIGN_RULES });
    setStudentConflicts([]);
    setTeacherConflicts([]);
    setTeacherStudentConflicts([]);
    setClassConflicts([]);
    setClassAffinities([]);
    setLeaderEntries1(Array.from({ length: 20 }, emptyLeaderEntry));
    setLeaderEntries2(Array.from({ length: 20 }, emptyLeaderEntry));
    setNewSC({ a: emptyPicker(), b: emptyPicker() });
    setNewTC({ a: emptyTpicker(), b: emptyTpicker() });
    setNewTSC({ teacher: emptyTpicker(), student: emptyPicker() });
    setNewCC({ a: emptyClsPick(), b: emptyClsPick() });
    setNewCA({ a: emptyClsPick(), b: emptyClsPick() });
    getAutoAssignConfig(retreatId).then(config => {
      if (cancelled || !config) return;
      setGroupCount1bu(config.groupCount1bu);
      setGroupCount2bu(config.groupCount2bu);
      setRules(config.rules);
      setStudentConflicts(config.studentConflicts);
      setTeacherConflicts(config.teacherConflicts);
      setTeacherStudentConflicts(config.teacherStudentConflicts);
      setClassConflicts(config.classConflicts);
      setClassAffinities(config.classAffinities);
      setLeaderEntries1(config.leaderEntries1);
      setLeaderEntries2(config.leaderEntries2);
      setConfigNotice("저장된 설정을 불러왔습니다.");
    }).catch(error => {
      if (!cancelled) setConfigError(error instanceof Error ? error.message : "설정을 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setConfigLoading(false);
    });
    return () => { cancelled = true; };
  }, [retreatId]);

  async function saveConfig() {
    setConfigSaving(true);
    setConfigNotice(null);
    setConfigError(null);
    try {
      await saveAutoAssignConfig(retreatId, {
        groupCount1bu,
        groupCount2bu,
        rules,
        studentConflicts,
        teacherConflicts,
        teacherStudentConflicts,
        classConflicts,
        classAffinities,
        leaderEntries1,
        leaderEntries2,
      });
      setConfigNotice("현재 조편성 설정을 저장했습니다.");
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : "설정을 저장하지 못했습니다.");
    } finally {
      setConfigSaving(false);
    }
  }

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

  // 반 결합·분리 모순 검증 — 에러가 있으면 실행 차단 (고려 관계 반영이 켜진 경우만)
  const relationErrors = useMemo(
    () => rules.applyConflicts
      ? validateClassRelations([...classUnits1, ...classUnits2], classConflicts, classAffinities, rules)
      : [],
    [classUnits1, classUnits2, classConflicts, classAffinities, rules],
  );

  const bu1Count = classUnits1.reduce((acc, u) => acc + u.studentIds.length, 0);
  const bu2Count = classUnits2.reduce((acc, u) => acc + u.studentIds.length, 0);

  // 조 수 상한: 모든 조에 최소 한 번들을 배정할 수 있어야 하며,
  // 최소 2반 규칙이 켜지면 추가로 반 수의 절반까지만 가능하다.
  const effectiveAffinities = rules.applyConflicts ? classAffinities : [];
  const bundleCount1 = useMemo(
    () => buildAffinityBundles(classUnits1, effectiveAffinities).length,
    [classUnits1, effectiveAffinities],
  );
  const bundleCount2 = useMemo(
    () => buildAffinityBundles(classUnits2, effectiveAffinities).length,
    [classUnits2, effectiveAffinities],
  );
  const classRuleMax1 = rules.minTwoClasses ? Math.max(1, Math.floor(classUnits1.length / 2)) : classUnits1.length;
  const classRuleMax2 = rules.minTwoClasses ? Math.max(1, Math.floor(classUnits2.length / 2)) : classUnits2.length;
  const maxGroups1 = Math.min(bundleCount1, classRuleMax1);
  const maxGroups2 = Math.min(bundleCount2, classRuleMax2);

  // maxGroupSize/인원수/최소2반 변경 시 조 수 자동 계산·클램프 (렌더 중 조정 — effect 대신)
  const [prevAutoCalc, setPrevAutoCalc] = useState({ maxGroupSize: rules.maxGroupSize, bu1Count, bu2Count, minTwoClasses: rules.minTwoClasses, cls1: classUnits1.length, cls2: classUnits2.length, maxGroups1, maxGroups2 });
  if (
    rules.maxGroupSize !== prevAutoCalc.maxGroupSize ||
    bu1Count !== prevAutoCalc.bu1Count ||
    bu2Count !== prevAutoCalc.bu2Count ||
    rules.minTwoClasses !== prevAutoCalc.minTwoClasses ||
    classUnits1.length !== prevAutoCalc.cls1 ||
    classUnits2.length !== prevAutoCalc.cls2 ||
    maxGroups1 !== prevAutoCalc.maxGroups1 ||
    maxGroups2 !== prevAutoCalc.maxGroups2
  ) {
    setPrevAutoCalc({ maxGroupSize: rules.maxGroupSize, bu1Count, bu2Count, minTwoClasses: rules.minTwoClasses, cls1: classUnits1.length, cls2: classUnits2.length, maxGroups1, maxGroups2 });
    if (rules.maxGroupSize > 0) {
      // 조당 최대 인원으로 조 수를 역산하고, 화면에 표시하기 전에 합계를 짝수로 보정한다.
      const autoCounts = calculateEvenGroupCountsForMaxSize({
        maxGroupSize: rules.maxGroupSize,
        maxGroups1,
        maxGroups2,
        studentCount1bu: bu1Count,
        studentCount2bu: bu2Count,
      });
      setGroupCount1bu(autoCounts.groupCount1bu);
      setGroupCount2bu(autoCounts.groupCount2bu);
    } else {
      // 최소2반 또는 반 붙임으로 실제 배정 가능한 번들 수가 줄면 현재 조 수도 상한으로 내린다.
      if (groupCount1bu > maxGroups1) setGroupCount1bu(maxGroups1);
      if (groupCount2bu > maxGroups2) setGroupCount2bu(maxGroups2);
    }
  }

  function run() {
    const evenCounts = ensureEvenCombinedGroupCounts({
      groupCount1bu,
      groupCount2bu,
      maxGroups1,
      maxGroups2,
      studentCount1bu: bu1Count,
      studentCount2bu: bu2Count,
    });
    if (evenCounts.groupCount1bu !== groupCount1bu) setGroupCount1bu(evenCounts.groupCount1bu);
    if (evenCounts.groupCount2bu !== groupCount2bu) setGroupCount2bu(evenCounts.groupCount2bu);
    setRunning(true);
    setTimeout(() => {
      const groups = runAutoAssign(
        evenCounts.groupCount1bu, evenCounts.groupCount2bu, rules,
        studentConflicts, teacherConflicts, teacherStudentConflicts, classConflicts, classAffinities, participants, teachers, students,
        leaderEntries1, leaderEntries2,
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
        classAffinities={classAffinities}
        setClassAffinities={setClassAffinities}
        relationErrors={relationErrors}
        newSC={newSC}
        setNewSC={setNewSC}
        newTC={newTC}
        setNewTC={setNewTC}
        newTSC={newTSC}
        setNewTSC={setNewTSC}
        newCC={newCC}
        setNewCC={setNewCC}
        newCA={newCA}
        setNewCA={setNewCA}
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
        configLoading={configLoading}
        configSaving={configSaving}
        configNotice={configNotice}
        configError={configError}
        onSaveConfig={saveConfig}
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
