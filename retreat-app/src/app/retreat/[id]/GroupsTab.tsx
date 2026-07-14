"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { Retreat, Group, Student, Participant, TeacherAttendance } from "@/lib/types";
import { clearGroups, saveGroups, subscribeToGroups, getStudentsByYear, subscribeToParticipants, subscribeToTeachers, subscribeToCellColors, subscribeToIguardGroupStaff, getGroupsBackups, restoreGroupsBackup } from "@/lib/db";
import BackupRestoreButton from "./BackupRestoreButton";
import * as XLSX from "xlsx";
import { useUI } from "@/context/UIContext";
import { saveWorkbook, printAsPDF, exportAsJPG, escapeHtml } from "@/lib/exportUtils";
import AutoAssignPanel from "./AutoAssignPanel";
import { AutoAssignScope, mergeAutoAssignedGroups } from "./autoAssignUtils";
import { LATE_REGISTRANT_COLORS } from "@/lib/constants";
import { groupDisplayName, sortGroupsByNumber } from "@/lib/groupNumber";
import { studentPrintRowClass, teacherPrintStatus, teacherPrintStatusSuffix } from "@/lib/groupPrint";
import { resolveStudentKey } from "@/lib/studentMatcher";
import { GroupCard, UnassignedBySection, type StudentInfo } from "./GroupComponents";

const parseNames = (csv: string) => (csv || "").split(",").map(s => s.trim()).filter(Boolean);

interface Props {
  retreat: Retreat;
}


export default function GroupsTab({ retreat }: Props) {
  const { toast, uiConfirm } = useUI();
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [allTeachers, setAllTeachers] = useState<TeacherAttendance[]>([]);
  const [iguardGroupStaff, setIguardGroupStaff] = useState<Record<string, string[]>>({}); // 이가드가 배정한 조스탭(groupId→teacherId[])
  const [teacherStatusMap, setTeacherStatusMap] = useState<Record<string, string>>({});
  const [cellColors, setCellColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [remoteUpdated, setRemoteUpdated] = useState(false);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [dragItemType, setDragItemType] = useState<"student" | "teacher">("student");
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", bu: "1부", teachers: "", leader: "" });

  const isDirtyRef = useRef(false);
  const isDragging = useRef(false);
  const initialLoaded = useRef(false);
  const studentsBaseRef = useRef<Record<string, Student>>({});
  const participantsRef = useRef<Record<string, Participant>>({});
  const latestRemoteGroupsRef = useRef<Group[]>([]);
  const groupsRef = useRef<Group[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false); // 내 저장 중 메아리(echo)를 충돌로 오인하지 않기 위한 플래그

  useEffect(() => { groupsRef.current = groups; }, [groups]);
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (isDirtyRef.current && !isSavingRef.current) {
      isSavingRef.current = true;
      void saveGroups(retreat.id, groupsRef.current).finally(() => {
        isDirtyRef.current = false;
        isSavingRef.current = false;
      });
    }
  }, [retreat.id, retreat.year]);

  async function flushAutoSave(updateUi = true) {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!isDirtyRef.current || isSavingRef.current) return;
    if (updateUi) {
      setSaving(true);
      setSaveError(null);
    }
    isSavingRef.current = true;
    try {
      await saveGroups(retreat.id, groupsRef.current);
      markClean(updateUi);
    } catch (e) {
      if (updateUi) setSaveError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      if (updateUi) setSaving(false);
      isSavingRef.current = false;
    }
  }

  function scheduleAutoSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void flushAutoSave(); }, 1500);
  }

  function markDirty() { isDirtyRef.current = true; setIsDirty(true); scheduleAutoSave(); }
  function markClean(updateUi = true) {
    isDirtyRef.current = false;
    if (updateUi) {
      setIsDirty(false);
      setRemoteUpdated(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    initialLoaded.current = false;
    const unsubs: (() => void)[] = [];

    setLoadError(null);
    // Load students (one-time, they don't change during session)
    getStudentsByYear(retreat.year).then(stds => {
      studentsBaseRef.current = stds;
      // Re-process any already-loaded participants with student data
      const parts = participantsRef.current;
      // Derive bu from buNum for all students (so late registrants show correct bu)
      const studentMap: Record<string, StudentInfo> = {};
      Object.entries(stds).forEach(([id, s]) => {
        studentMap[id] = { ...s, bu: s.buNum === 1 ? "1부" : s.buNum === 2 ? "2부" : undefined };
      });
      Object.entries(parts).forEach(([k, p]) => {
        if (p.studentId && studentMap[p.studentId]) {
          studentMap[p.studentId] = { ...studentMap[p.studentId], bu: p.bu, participantKey: k };
        }
      });
      setStudents(studentMap);
    }).catch(e => {
      setLoadError(e instanceof Error ? e.message : "학생 데이터를 불러오지 못했습니다.");
      setLoading(false);
    });

    // Real-time: participants
    unsubs.push(subscribeToParticipants(retreat.id, (parts) => {
      setParticipants(parts);
      participantsRef.current = parts;
      const stds = studentsBaseRef.current;
      // Derive bu from buNum for all students (late registrants will show correct bu)
      const studentMap: Record<string, StudentInfo> = {};
      Object.entries(stds).forEach(([id, s]) => {
        studentMap[id] = { ...s, bu: s.buNum === 1 ? "1부" : s.buNum === 2 ? "2부" : undefined };
      });
      Object.entries(parts).forEach(([k, p]) => {
        if (p.studentId && studentMap[p.studentId]) {
          studentMap[p.studentId] = { ...studentMap[p.studentId], bu: p.bu, participantKey: k };
        }
      });
      setStudents(studentMap);

      // De-duplicate by studentId
      const idsSet = new Set<string>();
      Object.values(parts).forEach(p => { if (p.studentId) idsSet.add(p.studentId); });
      const ids = Array.from(idsSet);
      setParticipantIds(ids);

      // Recalculate unassigned based on current groups
      setGroups(prev => {
        const assigned = new Set(prev.flatMap(g => g.studentIds || []));
        setUnassigned(ids.filter(id => !assigned.has(id)));
        return prev;
      });
    }, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: cell colors
    unsubs.push(subscribeToCellColors(retreat.id, setCellColors, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: teachers
    unsubs.push(subscribeToTeachers(retreat.id, (teachers) => {
      setAllTeachers(teachers);
      const sm: Record<string, string> = {};
      teachers.forEach(t => { sm[t.name] = t.status; });
      setTeacherStatusMap(sm);
    }, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: groups
    unsubs.push(subscribeToGroups(retreat.id, (newGroups) => {
      if (!initialLoaded.current) {
        setGroups(newGroups);
        setParticipantIds(prev => {
          const assigned = new Set(newGroups.flatMap(g => g.studentIds || []));
          setUnassigned(prev.filter(id => !assigned.has(id)));
          return prev;
        });
        setLoading(false);
        initialLoaded.current = true;
      } else if (!isDirtyRef.current && !isDragging.current) {
        setGroups(newGroups);
        setParticipantIds(prev => {
          const assigned = new Set(newGroups.flatMap(g => g.studentIds || []));
          setUnassigned(prev.filter(id => !assigned.has(id)));
          return prev;
        });
      } else if (!isSavingRef.current) {
        // 내 저장 중의 메아리는 충돌이 아니므로 무시
        latestRemoteGroupsRef.current = newGroups;
        setRemoteUpdated(true);
      }
    }, e => { setLoadError(prev => prev ?? `구독 실패 — ${e.message}`); setLoading(false); }));

    unsubs.push(subscribeToIguardGroupStaff(retreat.id, setIguardGroupStaff, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    return () => { unsubs.forEach(fn => fn()); initialLoaded.current = false; };
  }, [retreat.id, retreat.year]);

  function applyRemoteGroups() {
    const newGroups = latestRemoteGroupsRef.current;
    setGroups(newGroups);
    setParticipantIds(prev => {
      const assigned = new Set(newGroups.flatMap(g => g.studentIds || []));
      setUnassigned(prev.filter(id => !assigned.has(id)));
      return prev;
    });
    markClean();
  }

  // 후기 신청자: 색칠(blue/orange)되었지만 폼 미신청인 학생
  const lateRegistrantIds = useMemo(() => {
    const pSet = new Set(participantIds);
    return Object.entries(cellColors)
      .filter(([sid, color]) => LATE_REGISTRANT_COLORS.has(color) && !pSet.has(sid) && !!students[sid])
      .map(([sid]) => sid);
  }, [cellColors, participantIds, students]);

  // 전체 미배정: 기존 미배정 + 후기 신청자 중 조에 미배정된 인원
  // 신청취소(red) 학생은 풀에서 제외 — 취소자 제거 후 리로드 시 재등장 방지
  const allUnassigned = useMemo(() => {
    const assignedSet = new Set(groups.flatMap(g => g.studentIds || []));
    const lateUnassigned = lateRegistrantIds.filter(id => !assignedSet.has(id));
    return [...unassigned, ...lateUnassigned].filter(id => cellColors[id] !== "red");
  }, [unassigned, lateRegistrantIds, groups, cellColors]);

  const unassignedTeachers = useMemo(() => {
    const assigned = new Set(groups.flatMap(g => [
      ...(g.teachers || []),
      ...parseNames(g.staff || ""),
      ...parseNames(g.leader || ""),
    ]));
    // 이가드에서 이미 조스탭으로 배정된 스탭 id — 미배정 풀에서 제외
    // (현재 존재하는 조에 걸린 배정만 인정 — 삭제/재편성된 조의 고아 배정은 미배정으로 취급)
    const validGroupIds = new Set(groups.map(g => g.id));
    const iguardAssignedIds = new Set(
      Object.entries(iguardGroupStaff)
        .filter(([gid]) => validGroupIds.has(gid))
        .flatMap(([, ids]) => ids || [])
    );
    return allTeachers.filter(t => {
      if (assigned.has(t.name)) return false;
      if (t.bu === "스탭") {
        // 조스탭 배정은 이가드 사이트가 담당 — 여기 스탭 목록은 이가드의 배정 가능 풀과 동일 규칙 적용
        const role = t.role?.trim();
        if (role && role !== "조스탭") return false; // 조스탭 예외 인력(행정/이가드/삼별초 등) 제외
        if (t.status === "불참") return false;        // 불참 스탭 제외
        if (iguardAssignedIds.has(t.id)) return false; // 이가드에서 이미 배정됨
      }
      return true;
    });
  }, [groups, allTeachers, iguardGroupStaff]);

  function handleDragStart(type: "student" | "teacher", id: string, fromGroupId: string | null) {
    isDragging.current = true;
    setDragItemType(type);
    setDragItem(id);
    setDragFrom(fromGroupId || "unassigned");
  }

  function handleDrop(targetGroupId: string | null) {
    isDragging.current = false;
    if (!dragItem) return;
    markDirty();

    if (dragItemType === "teacher") {
      const teacherName = dragItem;
      setGroups(prev => {
        const updated = prev.map(g => ({ ...g, teachers: [...(g.teachers || [])] }));
        if (dragFrom && dragFrom !== "unassigned") {
          const src = updated.find(g => g.id === dragFrom);
          if (src) src.teachers = src.teachers.filter(t => t !== teacherName);
        }
        if (targetGroupId) {
          const tgt = updated.find(g => g.id === targetGroupId);
          if (tgt && !tgt.teachers.includes(teacherName)) tgt.teachers.push(teacherName);
        }
        return updated;
      });
    } else {
      const studentId = dragItem;
      setGroups(prev => {
        const updated = prev.map(g => ({ ...g, studentIds: [...(g.studentIds || [])] }));
        if (dragFrom && dragFrom !== "unassigned") {
          const src = updated.find(g => g.id === dragFrom);
          if (src) src.studentIds = src.studentIds.filter(id => id !== studentId);
        } else {
          setUnassigned(u => u.filter(id => id !== studentId));
        }
        if (targetGroupId) {
          const tgt = updated.find(g => g.id === targetGroupId);
          if (tgt && !tgt.studentIds.includes(studentId)) tgt.studentIds.push(studentId);
        } else {
          // 후기 신청자는 allUnassigned memo가 처리하므로 state에 추가하지 않음
          if (!lateRegistrantIds.includes(studentId)) {
            setUnassigned(u => u.includes(studentId) ? u : [...u, studentId]);
          }
        }
        return updated;
      });
    }

    setDragItem(null);
    setDragFrom(null);
  }

  function handleAutoApply(newGroups: Group[], scope: AutoAssignScope) {
    const mergedGroups = mergeAutoAssignedGroups(groups, newGroups, scope);
    setGroups(mergedGroups);
    const assigned = new Set(mergedGroups.flatMap(g => g.studentIds || []));
    // 폼 참가자만 unassigned state에 반영 (후기 신청자는 allUnassigned memo가 처리)
    setUnassigned(participantIds.filter(id => !assigned.has(id)));
    markDirty();
  }


  function exportGroupsXLSX() {
    const studentByName = Object.fromEntries(Object.values(students).map(s => [s.name, s]));
    const rows: Record<string, string | number>[] = [];
    const orderedGroups = [
      ...sortGroupsByNumber(groups.filter(g => g.bu === "1부")),
      ...sortGroupsByNumber(groups.filter(g => g.bu === "2부")),
    ];
    orderedGroups.forEach(g => {
      const jo = groupDisplayName(g, groups);
      (g.teachers || []).forEach(t => {
        rows.push({ "부": g.bu, "조": jo, "역할": "교사", "이름": t, "학년": "", "반": "", "GBS": g.gbs || "" });
      });
      const leaderNames = new Set(parseNames(g.leader || ""));
      const staffNames  = new Set(parseNames(g.staff  || ""));
      leaderNames.forEach(n => {
        const s = studentByName[n];
        rows.push({ "부": g.bu, "조": jo, "역할": "조장", "이름": n, "학년": s ? `${s.grade}학년` : "", "반": s ? `${s.class}반` : "", "GBS": g.gbs || "" });
      });
      staffNames.forEach(n => {
        const s = studentByName[n];
        rows.push({ "부": g.bu, "조": jo, "역할": "스탭", "이름": n, "학년": s ? `${s.grade}학년` : "", "반": s ? `${s.class}반` : "", "GBS": g.gbs || "" });
      });
      (g.studentIds || []).forEach(sid => {
        const s = students[sid];
        if (!s) return;
        if (leaderNames.has(s.name) || staffNames.has(s.name)) return;
        rows.push({ "부": g.bu, "조": jo, "역할": "학생", "이름": s.name, "학년": `${s.grade}학년`, "반": `${s.class}반`, "GBS": g.gbs || "" });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 6 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "조편성");
    saveWorkbook(wb, `${retreat.name}_조편성`);
  }

  function buildGroupsHtml(onlyBu?: string) {
    const exportGroups = onlyBu ? groups.filter(g => g.bu === onlyBu) : groups;
    const buList = [...new Set(exportGroups.map(g => g.bu))].sort();
    const studentByName = Object.fromEntries(Object.values(students).map(s => [s.name, s]));
    const participantGenderByStudentKey = new Map<string, string>();
    Object.values(participants).forEach(participant => {
      const studentKey = resolveStudentKey(participant, students);
      if (studentKey && participant.gender && !participantGenderByStudentKey.has(studentKey)) {
        participantGenderByStudentKey.set(studentKey, participant.gender);
      }
    });

    // ── 한 부서/페이지: 조를 좁은 세로 열로 만들어 가로로 나란히 배치 ──
    interface PdfPage { bu: string; pageGroups: Group[]; isLast: boolean }
    const pages: PdfPage[] = [];
    buList.forEach(bu => {
      const bg = sortGroupsByNumber(exportGroups.filter(g => g.bu === bu));
      if (!bg.length) return;
      pages.push({ bu, pageGroups: bg, isLast: false });
    });
    if (pages.length) pages[pages.length - 1].isLast = true;

    // ── CSS ───────────────────────────────────────────────────
    const style = `<style>
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { padding: 0; font-size: 10px; background: #fff; }
      .dept-page { width: 100%; display: flex; flex-direction: column; overflow: hidden; background: #fff; }
      .doc-head { height: 30px; flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1.5px solid #0f172a; margin-bottom: 3px; }
      h1 { font-size: 14px; line-height: 1.15; font-weight: 800; margin: 0 0 1px; color: #0f172a; }
      .doc-sub { font-size: 8px; color: #64748b; margin: 0; }
      .doc-bu { font-size: 11px; font-weight: 800; color: #fff; background: #0f172a; border-radius: 3px; padding: 3px 8px; }

      /* 한 페이지 = 한 부서. 각 조를 좁은 세로 열로 만들어 좌→우로 이어 붙인다. */
      .pg {
        display: grid;
        grid-template-columns: repeat(var(--groups), minmax(0, 1fr));
        align-items: start;
        gap: 2px;
        min-height: 0;
      }
      .pb { page-break-after: always; break-after: page; }

      .gc { min-width: 0; border: 1px solid #94a3b8; border-radius: 2px; break-inside: avoid; overflow: hidden; }
      .gc-head { min-height: 24px; background: #0f172a; color: #fff; padding: 2px 3px; display: flex; align-items: center; justify-content: space-between; gap: 2px; }
      .gc-name { font-size: 12px; line-height: 1; font-weight: 800; letter-spacing: -0.4px; white-space: nowrap; }
      .gc-bu   { display: none; }
      .gc-gbs  { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 6.5px; color: #bfdbfe; }

      /* 테이블 */
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
      thead tr { background: #e2e8f0; }
      thead th { height: 16px; padding: 1px 2px; font-size: 7px; line-height: 1; font-weight: 700; color: #475569; text-align: left; border: none; border-bottom: 1px solid #94a3b8; }
      tbody td { height: 20px; padding: 1px 2px; font-size: 8.5px; line-height: 1; border: none; border-bottom: 1px solid #e2e8f0; overflow: hidden; text-overflow: ellipsis; }
      tr:last-child td { border-bottom: none; }

      .t-cls { width: 28px; color: #64748b; font-size: 7px; text-align: center; white-space: nowrap; }
      .t-name { font-weight: 700; color: #1e293b; white-space: nowrap; }
      .t-chk  { width: 14px; text-align: center; }
      .chk    { display: inline-block; width: 8px; height: 8px; border: 1px solid #64748b; border-radius: 1px; }
      .badge  { font-size: 5.5px; font-weight: 700; background: rgba(0,0,0,0.08); border-radius: 2px; padding: 0 1px; margin-left: 1px; color: #475569; vertical-align: middle; }

      /* 반 구분선 — 반이 바뀌는 첫 행에 두꺼운 위쪽 테두리 */
      tr.cls-div td { border-top: 2px solid #64748b !important; }

      /* 행 색상 */
      .r-teacher td { background: #e0f2fe; }
      .r-teacher .t-name { color: #0369a1; font-weight: 700; }
      .r-leader td  { background: #fef9c3; }
      .r-leader .t-name  { color: #92400e; font-weight: 700; }
      .r-staff td   { background: #dcfce7; }
      .r-staff .t-name   { color: #166534; font-weight: 700; }
      .r-male td    { background: #dbeafe; }
      .r-male .t-name    { color: #1d4ed8; }
      .r-female td  { background: #fce7f3; }
      .r-female .t-name  { color: #be185d; }
      .r-red td     { background: #fecaca; }
      .r-red .t-name     { color: #dc2626; text-decoration: line-through; }

      .gc-foot { height: 15px; padding: 2px 3px; text-align: right; font-size: 6.5px; line-height: 1; color: #475569; background: #f1f5f9; border-top: 1px solid #94a3b8; white-space: nowrap; }
      @media print {
        @page { margin: 5mm; size: 420mm 115mm; }
        body { padding: 0; }
        .dept-page { width: auto; height: 104mm; }
        /* 인쇄 시 테두리 강제 출력 */
        .gc { border: 1.5px solid #64748b !important; }
        tbody td { border-bottom: 1px solid #d1d5db !important; }
        tr.cls-div td { border-top: 2px solid #475569 !important; }
        thead th { border-bottom: 2px solid #64748b !important; }
        .gc-foot { border-top: 1.5px solid #64748b !important; }
        .chk { border: 1.5px solid #475569 !important; }
      }
    </style>`;

    let html = style;
    const printedAt = new Date().toLocaleDateString("ko-KR");

    pages.forEach(({ bu, pageGroups, isLast }) => {
      html += `<section class="dept-page${isLast ? "" : " pb"}">
        <header class="doc-head">
          <div><h1>${escapeHtml(retreat.name)} ${escapeHtml(bu)} 조편성</h1>
          <p class="doc-sub">총 ${pageGroups.length}조 &nbsp;·&nbsp; 출력일: ${printedAt}</p></div>
          <div class="doc-bu">${escapeHtml(bu)}</div>
        </header>
        <div class="pg" style="--groups:${pageGroups.length}">`;

      pageGroups.forEach(g => {
        const leaderNames = new Set(parseNames(g.leader || ""));
        const staffNames  = new Set(parseNames(g.staff  || ""));
        const teachers    = g.teachers || [];
        const filteredIds = (g.studentIds || []).filter(sid => {
          const s = students[sid];
          return !s || (!leaderNames.has(s.name) && !staffNames.has(s.name));
        });

        // 학년 역순(3→2→1), 같은 학년은 반 오름차순, 같은 반은 이름 가나다
        const sortedIds = [...filteredIds].sort((a, b) => {
          const sa = students[a], sb = students[b];
          if (!sa && !sb) return 0; if (!sa) return 1; if (!sb) return -1;
          return (sb.grade - sa.grade) || (sa.class - sb.class) || sa.name.localeCompare(sb.name, "ko");
        });

        const teacherCount    = teachers.length;
        const cancelledCount  = sortedIds.filter(sid => cellColors[sid] === "red").length;
        const studentCount    = leaderNames.size + staffNames.size + (sortedIds.length - cancelledCount);

        html += `<div class="gc">
          <div class="gc-head">
            <div><span class="gc-name">${escapeHtml(groupDisplayName(g, groups))}</span><span class="gc-bu">${escapeHtml(g.bu)}</span></div>
            ${g.gbs ? `<div class="gc-gbs">📍 ${escapeHtml(g.gbs)}</div>` : ""}
          </div>
          <table>
            <thead><tr>
              <th class="t-cls">반</th>
              <th>이름</th>
              <th class="t-chk">✓</th>
            </tr></thead>
            <tbody>`;

        // ① 교사 행 (번호 없음, 체크 없음)
        teachers.forEach(name => {
          const status = teacherPrintStatus(allTeachers, name, g.bu);
          const displayName = `${name}${teacherPrintStatusSuffix(status)}`;
          html += `<tr class="r-teacher">
            <td class="t-cls">교사</td>
            <td class="t-name">${escapeHtml(displayName)}</td>
            <td class="t-chk"></td>
          </tr>`;
        });

        // ② 조장 행
        [...leaderNames].forEach(name => {
          const s = studentByName[name];
          html += `<tr class="r-leader">
            <td class="t-cls">${s ? `${s.grade}-${s.class}` : "조장"}</td>
            <td class="t-name">${escapeHtml(name)}<span class="badge">조장</span></td>
            <td class="t-chk"><span class="chk"></span></td>
          </tr>`;
        });

        // ③ 스탭 행
        [...staffNames].forEach(name => {
          const s = studentByName[name];
          html += `<tr class="r-staff">
            <td class="t-cls">${s ? `${s.grade}-${s.class}` : "스탭"}</td>
            <td class="t-name">${escapeHtml(name)}<span class="badge">스탭</span></td>
            <td class="t-chk"><span class="chk"></span></td>
          </tr>`;
        });

        // ④ 학생 행 — 반 구분선 포함
        let prevClassKey = "";
        const hasRoleRows = teachers.length > 0 || leaderNames.size > 0 || staffNames.size > 0;

        sortedIds.forEach((sid, idx) => {
          const s = students[sid];
          if (!s) return;
          const classKey = `${s.grade}-${s.class}`;
          // 처음 학생 행이고 위에 역할행이 있으면 구분선 / 또는 반이 바뀔 때
          const isDiv = (idx === 0 && hasRoleRows) || (idx > 0 && classKey !== prevClassKey);
          prevClassKey = classKey;

          const color = cellColors[sid];
          const rowCls = studentPrintRowClass(participantGenderByStudentKey.get(sid), s.class, color);
          const badge  = color === "orange" ? '<span class="badge">부분참</span>'
                       : color === "red"    ? '<span class="badge">취소</span>' : "";

          html += `<tr class="${[rowCls, isDiv ? "cls-div" : ""].filter(Boolean).join(" ")}">
            <td class="t-cls">${s.grade}-${s.class}</td>
            <td class="t-name">${escapeHtml(s.name)}${badge}</td>
            <td class="t-chk">${color !== "red" ? '<span class="chk"></span>' : ""}</td>
          </tr>`;
        });

        html += `</tbody></table>
          <div class="gc-foot">${teacherCount > 0 ? `교사 ${teacherCount}명 &nbsp;·&nbsp; ` : ""}학생 ${studentCount}명</div>
        </div>`;
      });

      html += `</div></section>`; // .pg, .dept-page
    });

    return html;
  }

  function exportGroupsPDF() {
    if (!printAsPDF(buildGroupsHtml(), `${retreat.name}_조편성`, true)) {
      toast("팝업이 차단되어 PDF를 열 수 없습니다. 브라우저 팝업 허용을 확인해주세요.", "error");
    }
  }

  async function exportGroupsJPG() {
    const buList = [...new Set(groups.map(group => group.bu))].sort();
    for (const bu of buList) {
      if (!await exportAsJPG(buildGroupsHtml(bu), `${retreat.name}_조편성_${bu}`, true)) {
        toast(`${bu} JPG 저장에 실패했습니다.`, "error");
        return;
      }
    }
  }

  function addGroup() {
    const id = `g_${Date.now()}`;
    const g: Group = {
      id,
      name: newGroup.name || `${groups.length + 1}조`,
      bu: newGroup.bu,
      teachers: newGroup.teachers ? newGroup.teachers.split(",").map(t => t.trim()) : [],
      leader: newGroup.leader,
      studentIds: [],
    };
    setGroups(prev => [...prev, g]);
    setNewGroup({ name: "", bu: "1부", teachers: "", leader: "" });
    setShowAddGroup(false);
    markDirty();
  }

  async function removeGroup(id: string) {
    const g = groups.find(g => g.id === id);
    if (!g) return;
    if (g.studentIds?.length > 0 && !await uiConfirm("이 조에 배정된 학생들이 미배정으로 돌아갑니다.")) return;
    setUnassigned(u => [...u, ...(g.studentIds || [])]);
    setGroups(prev => prev.filter(g => g.id !== id));
    markDirty();
  }

  async function removeAllGroups() {
    const currentGroups = groupsRef.current;
    if (currentGroups.length === 0 || isSavingRef.current) return;
    const assignedCount = new Set(currentGroups.flatMap(group => group.studentIds || [])).size;
    const confirmed = await uiConfirm(
      `현재 ${currentGroups.length}개 조와 배정 학생 ${assignedCount}명의 조편성을 모두 삭제하시겠습니까?\n\n` +
      "삭제 직전 조편성은 강제 백업되며 복구 버튼에서 되돌릴 수 있습니다. " +
      "방배정과 이가드 조스탭 배정은 삭제되지 않아 기존 조 연결이 끊길 수 있습니다."
    );
    if (!confirmed) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaving(true);
    setSaveError(null);
    isSavingRef.current = true;
    try {
      // 화면에만 남은 편집이 있으면 먼저 저장해, 강제 백업에 현재 보이는 상태가 담기게 한다.
      if (isDirtyRef.current) {
        await saveGroups(retreat.id, groupsRef.current);
        markClean();
      }
      await clearGroups(retreat.id);
      groupsRef.current = [];
      latestRemoteGroupsRef.current = [];
      setGroups([]);
      setUnassigned(participantIds);
      markClean();
      toast(`${currentGroups.length}개 조를 모두 삭제했습니다.`, "success");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "전체 조 삭제 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  }

  function updateGroupField(id: string, field: keyof Group, value: unknown) {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));
    markDirty();
  }

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;
  if (loadError) return (
    <div className="card p-6 text-center">
      <p className="text-red-500 font-medium mb-2">⚠ 데이터를 불러오지 못했습니다</p>
      <p className="text-sm text-slate-500 mb-4">{loadError}</p>
      <button onClick={() => window.location.reload()} className="btn-secondary">새로고침</button>
    </div>
  );

  const bu1Groups = sortGroupsByNumber(groups.filter(g => g.bu === "1부"));
  const bu2Groups = sortGroupsByNumber(groups.filter(g => g.bu === "2부"));

  return (
    <div>
      {saveError && (
        <div className="mb-3 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
          <span>⚠ 저장 실패: {saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-600 ml-3 font-bold">×</button>
        </div>
      )}
      {remoteUpdated && (
        <div className={`mb-3 flex items-center justify-between border rounded-lg px-4 py-2 text-sm ${
          isDirty
            ? "bg-red-50 border-red-300 text-red-700"
            : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          <span>
            {isDirty
              ? "⚠ 충돌 주의: 다른 사용자가 저장했습니다. 지금 편집 중인 내용과 충돌할 수 있습니다."
              : "ℹ 다른 사용자가 변경사항을 저장했습니다."}
          </span>
          <button onClick={applyRemoteGroups}
            className="font-medium underline ml-3 whitespace-nowrap">
            {isDirty ? "내 변경 취소 후 갱신" : "갱신"}
          </button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex gap-2 text-sm text-slate-500 items-center">
          <span>총 {groups.length}조</span>
          <span>·</span>
          <span>미배정 {allUnassigned.length}명</span>
          <span className="text-[10px] text-green-500 flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>실시간
          </span>
          <span className={`text-xs font-medium px-2 sm:hidden ${saving ? "text-blue-500" : isDirty ? "text-amber-500" : "text-green-500"}`}>
            {saving ? "저장 중..." : isDirty ? "편집 중..." : "✓ 저장됨"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <button
            onClick={async () => {
              const cancelled = new Set(Object.entries(cellColors).filter(([,c]) => c === "red").map(([k]) => k));
              if (!cancelled.size) return toast("신청취소 처리된 학생이 없습니다.", "warning");
              const n = groups.reduce((s, g) => s + (g.studentIds||[]).filter(id => cancelled.has(id)).length, 0);
              if (!n) return toast("조편성에 신청취소자가 없습니다.", "warning");
              if (!await uiConfirm(`신청취소 학생 ${n}명을 모든 조에서 제거하시겠습니까?`)) return;
              setGroups(prev => {
                const updated = prev.map(g => ({ ...g, studentIds: (g.studentIds||[]).filter(id => !cancelled.has(id)) }));
                const assigned = new Set(updated.flatMap(g => g.studentIds||[]));
                setUnassigned(participantIds.filter(id => !assigned.has(id) && !cancelled.has(id)));
                return updated;
              });
              markDirty();
            }}
            disabled={groups.length === 0}
            className="btn-secondary btn-sm text-red-600"
          >취소자 제거</button>
          <button onClick={exportGroupsXLSX} disabled={groups.length === 0} className="btn-secondary btn-sm">📥 XLSX</button>
          <button onClick={exportGroupsPDF} disabled={groups.length === 0} className="btn-secondary btn-sm">🖨️ PDF</button>
          <button onClick={exportGroupsJPG} disabled={groups.length === 0} className="btn-secondary btn-sm">🖼️ JPG</button>
          <BackupRestoreButton label="조편성" loadBackups={() => getGroupsBackups(retreat.id)} restore={key => restoreGroupsBackup(retreat.id, key)} />
          <button
            onClick={removeAllGroups}
            disabled={groups.length === 0 || saving}
            className="btn-secondary btn-sm text-red-600"
          >조 전체 삭제</button>
          <button onClick={() => setShowAddGroup(true)} className="btn-secondary btn-sm">＋ 조 추가</button>
          <span className={`text-xs font-medium px-2 hidden sm:inline ${saving ? "text-blue-500" : isDirty ? "text-amber-500" : "text-green-500"}`}>
            {saving ? "저장 중..." : isDirty ? "편집 중..." : "✓ 저장됨"}
          </span>
        </div>
      </div>

      {showAddGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold mb-4">조 추가</h3>
            <div className="space-y-3">
              <input className="input" placeholder="조 이름 (예: 1조)" value={newGroup.name}
                onChange={e => setNewGroup(p => ({...p, name: e.target.value}))} />
              <select className="input" value={newGroup.bu}
                onChange={e => setNewGroup(p => ({...p, bu: e.target.value}))}>
                <option>1부</option>
                <option>2부</option>
              </select>
              <input className="input" placeholder="교사 (쉼표로 구분)" value={newGroup.teachers}
                onChange={e => setNewGroup(p => ({...p, teachers: e.target.value}))} />
              <input className="input" placeholder="조장" value={newGroup.leader}
                onChange={e => setNewGroup(p => ({...p, leader: e.target.value}))} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={addGroup} className="btn-primary flex-1 justify-center">추가</button>
              <button onClick={() => setShowAddGroup(false)} className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Auto Assign Panel */}
        <div className="lg:col-span-1">
          <AutoAssignPanel
            retreatId={retreat.id}
            participants={participants}
            teachers={allTeachers}
            students={students}
            currentGroups={groups}
            onApply={handleAutoApply}
          />
        </div>

        {/* Unassigned */}
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <div
              className="card p-3 min-h-32 max-h-[calc(100vh-6rem)] overflow-y-auto"
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(null)}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-slate-700 text-sm">미배정</span>
                <span className="tag tag-yellow">{allUnassigned.length}명</span>
                {lateRegistrantIds.length > 0 && (
                  <span className="tag tag-blue text-[10px]">현장 {allUnassigned.filter(id => lateRegistrantIds.includes(id)).length}명</span>
                )}
                {unassignedTeachers.length > 0 && (
                  <span className="tag tag-purple">교사 {unassignedTeachers.length}명</span>
                )}
              </div>

              {allUnassigned.length === 0 && unassignedTeachers.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">모두 배정 완료!</p>
              ) : (
                <UnassignedBySection
                  unassigned={allUnassigned}
                  students={students}
                  cellColors={cellColors}
                  unassignedTeachers={unassignedTeachers}
                  onDragStartStudent={(id) => handleDragStart("student", id, null)}
                  onDragStartTeacher={(name) => handleDragStart("teacher", name, null)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Groups */}
        <div className="lg:col-span-2">
          {[
            { label: "1부", list: bu1Groups },
            { label: "2부", list: bu2Groups },
          ].map(({ label, list: gList }) => (
            <div key={label} className="mb-4">
              <h3 className="text-sm font-semibold text-slate-500 mb-2 flex items-center gap-2">
                <span className={`tag ${label === "1부" ? "tag-green" : "tag-purple"}`}>{label}</span>
                {gList.length}개 조
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {gList.map(g => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    displayName={groupDisplayName(g, groups)}
                    students={students}
                    teacherStatusMap={teacherStatusMap}
                    allTeachers={allTeachers}
                    iguardStaffNames={(iguardGroupStaff[g.id] || []).map(tid => allTeachers.find(t => t.id === tid)?.name).filter((n): n is string => !!n)}
                    cellColors={cellColors}
                    onDrop={() => handleDrop(g.id)}
                    onDragStart={(type, id) => handleDragStart(type, id, g.id)}
                    onRemoveStudent={(sid) => {
                      setGroups(prev => prev.map(gr =>
                        gr.id === g.id ? { ...gr, studentIds: gr.studentIds.filter(id => id !== sid) } : gr
                      ));
                      setUnassigned(u => [...u, sid]);
                      markDirty();
                    }}
                    onRemoveTeacher={(name) => {
                      setGroups(prev => prev.map(gr =>
                        gr.id === g.id ? { ...gr, teachers: (gr.teachers || []).filter(t => t !== name) } : gr
                      ));
                      markDirty();
                    }}
                    onUpdate={(field, val) => updateGroupField(g.id, field, val)}
                    onRemoveGroup={() => removeGroup(g.id)}
                    onAddStudent={(sid) => {
                      setGroups(prev => prev.map(gr =>
                        gr.id === g.id && !(gr.studentIds || []).includes(sid)
                          ? { ...gr, studentIds: [...(gr.studentIds || []), sid] }
                          : gr
                      ));
                      setUnassigned(u => u.filter(id => id !== sid));
                      markDirty();
                    }}
                  />
                ))}
                {gList.length === 0 && (
                  <p className="text-xs text-slate-400 col-span-2 py-2">
                    {label} 조가 없습니다. ＋ 조 추가 버튼을 눌러주세요.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// GroupCard, UnassignedBySection, StudentChip, TeacherChip는
// GroupComponents.tsx로 분리되었습니다.
