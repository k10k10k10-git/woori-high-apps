"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { Retreat, Room, Group, Student, Participant, TeacherAttendance, PartialAttendance } from "@/lib/types";
import { clearRooms, clearRoomAssignments, saveRooms, subscribeToRooms, subscribeToGroups, getStudentsByYear, subscribeToParticipants, subscribeToCellColors, subscribeToTeachers, subscribeToPartialAttendances, getRoomsBackups, restoreRoomsBackup } from "@/lib/db";
import { groupDisplayName } from "@/lib/groupNumber";
import BackupRestoreButton from "./BackupRestoreButton";
import * as XLSX from "xlsx";
import { useUI } from "@/context/UIContext";
import { saveWorkbook, printAsPDF, exportAsJPG, escapeHtml } from "@/lib/exportUtils";
import { TEACHER_STATUS_CLS } from "@/lib/constants";
import { roomLabel, roomFloor, sortRooms } from "@/lib/roomLabel";
import { autoAssignRooms, makeExternalAdults, type RoomAutoAssignResult, type RoomAutoStudent } from "@/lib/roomAutoAssign";
import {
  findLateRegistrantIds, findDayAttendanceIds, findUnassignedStudentIds,
  findUnassignedTeachers, findRoomStudentCandidateIds, excludeAssignedStudents,
  toRoomAutoStudents, toRoomAutoAdults, toRoomClassOptions,
} from "@/lib/assignmentBoard";
import type { RoomAutoAssignSettings } from "@/lib/roomAutoAssignConfig";
import RoomAutoAssignPanel, { type RoomClassOption } from "./RoomAutoAssignPanel";
import RoomAutoAssignPreviewModal from "./RoomAutoAssignPreviewModal";

interface Props {
  retreat: Retreat;
}

interface StudentInfo extends Student {
  bu?: string;
  gender?: string;
}


const CELL_COLOR_CLS: Record<string, string> = {
  blue:   "bg-blue-100 border-blue-300",
  orange: "bg-orange-100 border-orange-300",
  red:    "bg-red-100 border-red-300",
};

export default function RoomsTab({ retreat }: Props) {
  const { toast, uiConfirm } = useUI();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [groups, setGroups] = useState<Group[]>([]); // 도면 인쇄의 조 표기용 (읽기 전용)
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [allTeachers, setAllTeachers] = useState<TeacherAttendance[]>([]);
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [remoteUpdated, setRemoteUpdated] = useState(false);
  const [dragItemType, setDragItemType] = useState<"student" | "teacher">("student");
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({ dong: "", roomNumber: "", capacity: "4", type: "남" });
  const [genderFilter, setGenderFilter] = useState<string>("전체");
  const [cellColors, setCellColors] = useState<Record<string, string>>({});
  const [partialAttendances, setPartialAttendances] = useState<PartialAttendance[]>([]);
  const [roomAutoPreview, setRoomAutoPreview] = useState<RoomAutoAssignResult | null>(null);
  const [roomAutoSettings, setRoomAutoSettings] = useState<RoomAutoAssignSettings | null>(null);
  const [roomAutoRunCount, setRoomAutoRunCount] = useState(0);

  const isDirtyRef = useRef(false);
  const isDragging = useRef(false);
  const initialLoaded = useRef(false);
  const studentsBaseRef = useRef<Record<string, Student>>({});
  const participantsRef = useRef<Record<string, Participant>>({});
  const latestRemoteRoomsRef = useRef<Room[]>([]);
  const roomsRef = useRef<Room[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false); // 내 저장 중 메아리(echo)를 충돌로 오인하지 않기 위한 플래그

  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (isDirtyRef.current && !isSavingRef.current) {
      isSavingRef.current = true;
      void saveRooms(retreat.id, roomsRef.current).finally(() => {
        isDirtyRef.current = false;
        isSavingRef.current = false;
      });
    }
  }, [retreat.id]);

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
      await saveRooms(retreat.id, roomsRef.current);
      markClean(updateUi);
    } catch (e) {
      if (updateUi) setSaveError(e instanceof Error ? e.message : String(e));
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
    // Load students (one-time)
    getStudentsByYear(retreat.year).then(stds => {
      studentsBaseRef.current = stds;
      // Re-process if participants already loaded
      const parts = participantsRef.current;
      // Derive bu from buNum for all students (late registrants will show correct bu)
      const studentMap: Record<string, StudentInfo> = {};
      Object.entries(stds).forEach(([id, s]) => {
        studentMap[id] = { ...s, bu: s.buNum === 1 ? "1부" : s.buNum === 2 ? "2부" : undefined };
      });
      Object.values(parts).forEach(p => {
        if (p.studentId && studentMap[p.studentId]) {
          studentMap[p.studentId] = { ...studentMap[p.studentId], bu: p.bu, gender: p.gender };
        }
      });
      setStudents(studentMap);
    }).catch(e => {
      setLoadError(e instanceof Error ? e.message : "학생 데이터를 불러오지 못했습니다.");
      setLoading(false);
    });

    // Real-time: participants
    unsubs.push(subscribeToParticipants(retreat.id, (parts) => {
      participantsRef.current = parts;
      const stds = studentsBaseRef.current;
      // Derive bu from buNum for all students (late registrants will show correct bu)
      const studentMap: Record<string, StudentInfo> = {};
      Object.entries(stds).forEach(([id, s]) => {
        studentMap[id] = { ...s, bu: s.buNum === 1 ? "1부" : s.buNum === 2 ? "2부" : undefined };
      });
      Object.values(parts).forEach(p => {
        if (p.studentId && studentMap[p.studentId]) {
          studentMap[p.studentId] = { ...studentMap[p.studentId], bu: p.bu, gender: p.gender };
        }
      });
      setStudents(studentMap);

      // De-duplicate by studentId
      const idsSet = new Set<string>();
      Object.values(parts).forEach(p => { if (p.studentId) idsSet.add(p.studentId); });
      const ids = Array.from(idsSet);
      setParticipantIds(ids);

      // Recalculate unassigned
      setRooms(prev => {
        setUnassigned(excludeAssignedStudents(ids, prev));
        return prev;
      });
    }, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: cell colors
    unsubs.push(subscribeToCellColors(retreat.id, setCellColors, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: teachers
    unsubs.push(subscribeToTeachers(retreat.id, (teachers) => {
      setAllTeachers(teachers);
    }, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: partial attendance — 당일참석자는 숙박하지 않으므로 자동배정·미배정 풀에서 제외
    unsubs.push(subscribeToPartialAttendances(retreat.id, setPartialAttendances,
      e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: groups — 도면 인쇄에서 방별 조 표기용
    unsubs.push(subscribeToGroups(retreat.id, setGroups,
      e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: rooms
    unsubs.push(subscribeToRooms(retreat.id, (newRooms) => {
      if (!initialLoaded.current) {
        setRooms(newRooms);
        setParticipantIds(prev => {
          setUnassigned(excludeAssignedStudents(prev, newRooms));
          return prev;
        });
        setLoading(false);
        initialLoaded.current = true;
      } else if (!isDirtyRef.current && !isDragging.current) {
        setRooms(newRooms);
        setParticipantIds(prev => {
          setUnassigned(excludeAssignedStudents(prev, newRooms));
          return prev;
        });
      } else if (!isSavingRef.current) {
        // 내 저장 중의 메아리는 충돌이 아니므로 무시
        latestRemoteRoomsRef.current = newRooms;
        setRemoteUpdated(true);
      }
    }, e => { setLoadError(prev => prev ?? `구독 실패 — ${e.message}`); setLoading(false); }));

    return () => { unsubs.forEach(fn => fn()); initialLoaded.current = false; };
  }, [retreat.id, retreat.year]);

  function applyRemoteRooms() {
    const newRooms = latestRemoteRoomsRef.current;
    setRooms(newRooms);
    setParticipantIds(prev => {
      setUnassigned(excludeAssignedStudents(prev, newRooms));
      return prev;
    });
    markClean();
  }

  // 아래 파생 계산의 본문은 lib/assignmentBoard.ts에 있다 (특성화 테스트: assignmentBoard.test.ts).
  const lateRegistrantIds = useMemo(
    () => findLateRegistrantIds(cellColors, participantIds, students),
    [cellColors, participantIds, students]);

  const dayAttendanceIds = useMemo(
    () => findDayAttendanceIds(partialAttendances), [partialAttendances]);

  const allUnassigned = useMemo(
    () => findUnassignedStudentIds({ unassigned, lateRegistrantIds, rooms, cellColors, dayAttendanceIds }),
    [unassigned, lateRegistrantIds, rooms, cellColors, dayAttendanceIds]);

  const unassignedTeachers = useMemo(
    () => findUnassignedTeachers(rooms, allTeachers), [rooms, allTeachers]);

  const roomStudentCandidateIds = useMemo(
    () => findRoomStudentCandidateIds({ participantIds, lateRegistrantIds, cellColors, dayAttendanceIds }),
    [participantIds, lateRegistrantIds, cellColors, dayAttendanceIds]);

  const roomAutoStudents = useMemo<RoomAutoStudent[]>(
    () => toRoomAutoStudents(roomStudentCandidateIds, students), [roomStudentCandidateIds, students]);

  const roomAutoAdults = useMemo(() => toRoomAutoAdults(allTeachers), [allTeachers]);

  const roomAutoClasses = useMemo<RoomClassOption[]>(
    () => toRoomClassOptions(roomAutoStudents, roomAutoAdults), [roomAutoStudents, roomAutoAdults]);
  const detectedAudioCount = roomAutoAdults.filter(adult => adult.category === "audio").length;
  const detectedMedicalCount = roomAutoAdults.filter(adult => adult.category === "medical").length;
  const detectedStaffCount = roomAutoAdults.filter(adult => adult.category === "staff").length;

  function calculateAutomaticRooms(settings: RoomAutoAssignSettings, seedOffset: number) {
    const adults = [
      ...roomAutoAdults,
      ...makeExternalAdults("audio", settings.audioCount, settings.audioGender, detectedAudioCount),
      ...makeExternalAdults("medical", settings.medicalCount, settings.medicalGender, detectedMedicalCount),
    ];
    return autoAssignRooms({
      rooms,
      students: roomAutoStudents,
      adults,
      classPins: settings.classPins,
      simulations: 30,
      seedOffset,
      includeStaff: settings.includeStaff,
    });
  }

  function previewAutomaticRooms(settings: RoomAutoAssignSettings) {
    setRoomAutoSettings(settings);
    setRoomAutoRunCount(1);
    setRoomAutoPreview(calculateAutomaticRooms(settings, 0));
  }

  function rerunAutomaticRooms() {
    if (!roomAutoSettings) return;
    const nextRunCount = roomAutoRunCount + 1;
    setRoomAutoPreview(calculateAutomaticRooms(roomAutoSettings, nextRunCount - 1));
    setRoomAutoRunCount(nextRunCount);
  }

  function closeAutomaticPreview() {
    setRoomAutoPreview(null);
    setRoomAutoSettings(null);
    setRoomAutoRunCount(0);
  }

  function applyAutomaticRooms() {
    if (!roomAutoPreview || roomAutoPreview.hardViolations.length > 0) return;
    const nextRooms = roomAutoPreview.rooms;
    roomsRef.current = nextRooms;
    setRooms(nextRooms);
    setUnassigned(excludeAssignedStudents(roomStudentCandidateIds, nextRooms));
    closeAutomaticPreview();
    markDirty();
    toast(`30회 시뮬레이션 최적안으로 ${roomAutoPreview.assignedStudentCount + roomAutoPreview.assignedAdultCount}명을 배정했습니다.`, "success");
  }

  async function updateRoomCapacity(roomId: string, nextCapacity: number): Promise<boolean> {
    const capacity = Math.max(1, Math.min(999, Math.trunc(nextCapacity)));
    const room = roomsRef.current.find(item => item.id === roomId);
    if (!room) return false;
    if (room.capacity === capacity) return true;

    const activeStudentCount = (room.studentIds || []).filter(id => cellColors[id] !== "red").length;
    const occupancy = activeStudentCount + (room.teachers?.length ?? 0);
    if (capacity < occupancy) {
      const confirmed = await uiConfirm(
        `${roomLabel(room)}에는 현재 ${occupancy}명이 배정되어 있습니다. 정원을 ${capacity}명으로 줄여 초과 상태로 둘까요?`,
      );
      if (!confirmed) return false;
    }

    const nextRooms = roomsRef.current.map(item => item.id === roomId ? { ...item, capacity } : item);
    roomsRef.current = nextRooms;
    setRooms(nextRooms);
    markDirty();
    return true;
  }

  function handleDragStart(type: "student" | "teacher", id: string, fromRoomId: string | null) {
    isDragging.current = true;
    setDragItemType(type);
    setDragItem(id);
    setDragFrom(fromRoomId || "unassigned");
  }

  async function handleDrop(targetRoomId: string | null) {
    isDragging.current = false;
    if (!dragItem) return;

    if (dragItemType === "teacher") {
      const teacherName = dragItem;
      markDirty();
      setRooms(prev => {
        const updated = prev.map(r => ({ ...r, teachers: [...(r.teachers || [])] }));
        if (dragFrom && dragFrom !== "unassigned") {
          const src = updated.find(r => r.id === dragFrom);
          if (src) src.teachers = src.teachers.filter(t => t !== teacherName);
        }
        if (targetRoomId) {
          const tgt = updated.find(r => r.id === targetRoomId);
          if (tgt && !tgt.teachers!.includes(teacherName)) tgt.teachers!.push(teacherName);
        }
        return updated;
      });
      setDragItem(null);
      setDragFrom(null);
      return;
    }

    const studentId = dragItem;
    const student = students[studentId];
    const targetRoom = rooms.find(r => r.id === targetRoomId);

    if (targetRoom && student?.gender && targetRoom.type && student.gender !== targetRoom.type) {
      if (!await uiConfirm(`${student.name}은(는) ${student.gender}인데 ${targetRoom.type} 방에 배정합니까?`)) {
        setDragItem(null);
        setDragFrom(null);
        return;
      }
    }
    if (targetRoom && (targetRoom.studentIds || []).length >= (targetRoom.capacity ?? 99)) {
      if (!await uiConfirm(`${roomLabel(targetRoom)}호가 정원(${targetRoom.capacity}명)을 초과합니다. 계속할까요?`)) {
        setDragItem(null);
        setDragFrom(null);
        return;
      }
    }

    markDirty();
    setRooms(prev => {
      const updated = prev.map(r => ({ ...r, studentIds: [...(r.studentIds || [])] }));
      if (dragFrom && dragFrom !== "unassigned") {
        const src = updated.find(r => r.id === dragFrom);
        if (src) src.studentIds = src.studentIds.filter(id => id !== studentId);
      } else {
        setUnassigned(u => u.filter(id => id !== studentId));
      }
      if (targetRoomId) {
        const tgt = updated.find(r => r.id === targetRoomId);
        if (tgt && !tgt.studentIds.includes(studentId)) tgt.studentIds.push(studentId);
      } else {
        // 후기 신청자는 allUnassigned memo가 처리하므로 state에 추가하지 않음
        if (!lateRegistrantIds.includes(studentId)) {
          setUnassigned(u => u.includes(studentId) ? u : [...u, studentId]);
        }
      }
      return updated;
    });
    setDragItem(null);
    setDragFrom(null);
  }

  async function assignStudentBySearch(targetRoomId: string, studentId: string) {
    const targetRoom = rooms.find(r => r.id === targetRoomId);
    const student = students[studentId];
    if (!targetRoom || !student || (targetRoom.studentIds || []).includes(studentId)) return;

    if (student.gender && targetRoom.type && student.gender !== targetRoom.type) {
      if (!await uiConfirm(`${student.name}은(는) ${student.gender}인데 ${targetRoom.type} 방에 배정합니까?`)) return;
    }
    const activeCount = (targetRoom.studentIds || []).filter(id => cellColors[id] !== "red").length;
    if (activeCount >= (targetRoom.capacity ?? 99)) {
      if (!await uiConfirm(`${roomLabel(targetRoom)}호가 정원(${targetRoom.capacity}명)을 초과합니다. 계속할까요?`)) return;
    }

    setRooms(prev => prev.map(room => {
      const withoutStudent = (room.studentIds || []).filter(id => id !== studentId);
      return room.id === targetRoomId
        ? { ...room, studentIds: [...withoutStudent, studentId] }
        : { ...room, studentIds: withoutStudent };
    }));
    setUnassigned(prev => prev.filter(id => id !== studentId));
    markDirty();
  }

  function assignTeacherBySearch(targetRoomId: string, teacherName: string) {
    const targetRoom = rooms.find(r => r.id === targetRoomId);
    if (!targetRoom || (targetRoom.teachers || []).includes(teacherName)) return;

    setRooms(prev => prev.map(room => {
      const withoutTeacher = (room.teachers || []).filter(name => name !== teacherName);
      return room.id === targetRoomId
        ? { ...room, teachers: [...withoutTeacher, teacherName] }
        : { ...room, teachers: withoutTeacher };
    }));
    markDirty();
  }


  function exportRoomsXLSX() {
    const rows: Record<string, string | number>[] = [];
    sortRooms(rooms).forEach(r => {
      (r.teachers || []).forEach(t => {
        rows.push({ "동": r.dong || "", "방번호": r.roomNumber, "유형": r.type, "정원": r.capacity, "역할": "교사", "이름": t, "부": "", "학년": "", "반": "" });
      });
      (r.studentIds || []).forEach(sid => {
        const s = students[sid];
        rows.push({ "동": r.dong || "", "방번호": r.roomNumber, "유형": r.type, "정원": r.capacity, "역할": "학생", "이름": s?.name || sid, "부": s?.buNum === 1 ? "1부" : s?.buNum === 2 ? "2부" : "", "학년": s ? `${s.grade}학년` : "", "반": s ? `${s.class}반` : "" });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 6 }, { wch: 8 }, { wch: 6 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "방배정");
    saveWorkbook(wb, `${retreat.name}_방배정`);
  }

  /** 학생 → 소속 조 역인덱스 — 도면·방 카드 인쇄의 조 표기 공용 */
  function buildGroupIndex(): Map<string, Group> {
    const idx = new Map<string, Group>();
    groups.forEach(g => (g.studentIds || []).forEach(sid => idx.set(sid, g)));
    return idx;
  }

  /** 방의 조·부서·학년·반 정보 라벨 (취소 제외, 중복 제거) — 도면·방 카드 공용 */
  function roomInfoLine(r: Room, groupIndex: Map<string, Group>): string {
    const groupLabels = new Set<string>();
    const classLabels = new Set<string>();
    (r.studentIds || []).forEach(sid => {
      if (cellColors[sid] === "red") return;
      const g = groupIndex.get(sid);
      if (g) groupLabels.add(groupDisplayName(g, groups));
      const s = students[sid];
      if (s?.buNum) classLabels.add(`${s.buNum}부 ${s.grade}-${s.class}`);
    });
    return [...groupLabels, ...classLabels].join(" · ");
  }

  /** 도면형 방배정 인쇄 — 건물(동)별 한 페이지, 층별 가로 띠에 방 박스를 나란히 (숙소 도면 느낌). */
  function buildRoomsHtml() {
    const chip = (text: string, bg: string, border: string, color: string, strike = false) =>
      `<span style="display:inline-block;background:${bg};border:1px solid ${border};border-radius:4px;padding:0 5px;font-size:10px;line-height:16px;color:${color};margin:1px 2px 1px 0;${strike ? "text-decoration:line-through;" : ""}">${escapeHtml(text)}</span>`;

    const groupIndex = buildGroupIndex();

    const roomBox = (r: Room) => {
      const isMale = r.type === "남";
      const headBg = isMale ? "#1e3a8a" : "#9d174d"; // 도면의 진한 박스 느낌 — 남 남색 / 여 자주
      const assigned = (r.studentIds || []).filter(sid => cellColors[sid] !== "red").length;
      const infoLine = roomInfoLine(r, groupIndex);

      const teacherChips = (r.teachers || []).map(t => chip(t, "#dcfce7", "#86efac", "#166534")).join("");
      const studentChips = (r.studentIds || []).map(sid => {
        const s = students[sid];
        const color = cellColors[sid];
        const name = s ? s.name : sid;
        if (color === "red") return chip(`${name} (취소)`, "#fee2e2", "#fca5a5", "#991b1b", true);
        if (color === "orange") return chip(`${name} (부분참)`, "#ffedd5", "#fdba74", "#9a3412");
        return chip(name, isMale ? "#eff6ff" : "#fdf2f8", isMale ? "#bfdbfe" : "#fbcfe8", isMale ? "#1e40af" : "#9d174d");
      }).join("");
      return `<div style="border:1.5px solid #334155;border-radius:4px;width:132px;page-break-inside:avoid;overflow:hidden;background:#fff">
        <div style="background:${headBg};color:#fff;padding:2px 6px;font-size:11px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700">${escapeHtml(r.roomNumber)}</span>
          <span style="font-size:9px;opacity:.85">${escapeHtml(r.type)} ${assigned}/${r.capacity}</span>
        </div>
        ${infoLine ? `<div style="background:#f1f5f9;border-bottom:1px solid #e2e8f0;padding:3px 6px;font-size:9px;line-height:1;color:#475569;font-weight:600;display:flex;align-items:center">${escapeHtml(infoLine)}</div>` : ""}
        <div style="padding:3px;min-height:22px">${teacherChips}${studentChips || '<span style="color:#cbd5e1;font-size:9px">비어있음</span>'}</div>
      </div>`;
    };

    let html = `<h1 style="margin:0 0 4px">${escapeHtml(retreat.name)} 방배정</h1>
      <p style="font-size:11px;color:#888;margin:0 0 14px">총 ${rooms.length}개 방 · 출력일: ${new Date().toLocaleDateString("ko-KR")}</p>`;

    const dongs = [...new Set(rooms.map(r => (r.dong ?? "").trim()))]
      .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));

    dongs.forEach((dong, di) => {
      const dongRooms = rooms.filter(r => (r.dong ?? "").trim() === dong);
      // 층별 묶음 — 높은 층이 위 (도면 관례), 층 구분 없는 방은 맨 아래
      const byFloor = new Map<string, Room[]>();
      dongRooms.forEach(r => {
        const f = roomFloor(r.roomNumber);
        byFloor.set(f, [...(byFloor.get(f) ?? []), r]);
      });
      const floors = [...byFloor.keys()].sort((a, b) => {
        if (a === "") return 1; if (b === "") return -1;
        return parseInt(b) - parseInt(a);
      });

      html += `<section style="${di > 0 ? "page-break-before:always;" : ""}margin-bottom:18px">
        <h2 style="font-size:14px;margin:0 0 8px;border-bottom:2.5px solid #334155;padding-bottom:3px">${escapeHtml(dong || "숙소동")}</h2>`;

      floors.forEach(floor => {
        const floorRooms = sortRooms(byFloor.get(floor)!);
        html += `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:8px;page-break-inside:avoid">
          ${floor ? `<div style="flex:none;width:34px;border:1px solid #94a3b8;border-radius:4px;text-align:center;font-size:10px;font-weight:700;color:#334155;padding:4px 0;align-self:stretch;display:flex;align-items:center;justify-content:center">${escapeHtml(floor)}</div>` : ""}
          <div style="display:flex;flex-wrap:wrap;gap:5px;flex:1">${floorRooms.map(roomBox).join("")}</div>
        </div>`;
      });

      html += `</section>`;
    });

    html += `<style>@media print { div, section { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }</style>`;
    return html;
  }

  /** 방문 부착용 A4 카드 — 방 1개 = 1장. 호수 크게, 조·반 정보, 명단 큰 글씨. 취소자·빈 방 제외. */
  function buildRoomCardsHtml(): string | null {
    const groupIndex = buildGroupIndex();
    const cards = sortRooms(rooms).filter(r =>
      (r.studentIds || []).some(sid => cellColors[sid] !== "red") || (r.teachers || []).length > 0);
    if (cards.length === 0) return null;

    return cards.map((r, i) => {
      const isMale = r.type === "남";
      const headBg = isMale ? "#1e3a8a" : "#9d174d"; // 도면 인쇄와 동일 색 체계
      const accent = isMale ? "#1e40af" : "#9d174d";
      const softBg = isMale ? "#eff6ff" : "#fdf2f8";
      const softBorder = isMale ? "#bfdbfe" : "#fbcfe8";
      const assigned = (r.studentIds || []).filter(sid => cellColors[sid] !== "red").length;
      const infoLine = roomInfoLine(r, groupIndex);
      const dong = (r.dong ?? "").trim();

      const teacherCards = (r.teachers || []).map(t =>
        `<div style="background:#dcfce7;border:1.5px solid #86efac;border-radius:10px;padding:12px 14px;text-align:center">
          <span style="font-size:26px;font-weight:700;color:#166534">${escapeHtml(t)}</span>
          <div style="font-size:13px;color:#15803d;margin-top:2px">교사</div>
        </div>`).join("");
      const studentCards = (r.studentIds || []).flatMap(sid => {
        if (cellColors[sid] === "red") return []; // 취소자는 문 앞 명단에서 제외
        const s = students[sid];
        const name = s ? s.name : sid;
        const sub = s ? `${s.grade}-${s.class}` : "";
        const partial = cellColors[sid] === "orange"
          ? `<span style="font-size:14px;color:#9a3412;font-weight:600"> (부분참)</span>` : "";
        return [`<div style="background:${softBg};border:1.5px solid ${softBorder};border-radius:10px;padding:12px 14px;text-align:center">
          <span style="font-size:26px;font-weight:700;color:${accent}">${escapeHtml(name)}</span>${partial}
          ${sub ? `<div style="font-size:13px;color:#64748b;margin-top:2px">${escapeHtml(sub)}</div>` : ""}
        </div>`];
      }).join("");

      return `<section style="${i < cards.length - 1 ? "page-break-after:always;" : ""}display:flex;flex-direction:column;min-height:250mm">
        <div style="background:${headBg};color:#fff;border-radius:14px;padding:18px 26px;display:flex;justify-content:space-between;align-items:center">
          <div>
            ${dong ? `<div style="font-size:16px;opacity:.85;margin-bottom:2px">${escapeHtml(dong)}</div>` : ""}
            <div style="font-size:64px;font-weight:800;line-height:1">${escapeHtml(r.roomNumber)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:22px;font-weight:700">${escapeHtml(r.type)}자 방</div>
            <div style="font-size:15px;opacity:.85;margin-top:2px">${assigned}명 / 정원 ${r.capacity}명</div>
          </div>
        </div>
        ${infoLine ? `<div style="margin:14px 0 0;background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 16px;font-size:20px;font-weight:700;color:#334155;text-align:center">${escapeHtml(infoLine)}</div>` : ""}
        <div style="margin-top:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${teacherCards}${studentCards}</div>
        <div style="margin-top:auto;padding-top:14px;text-align:center;font-size:12px;color:#94a3b8">${escapeHtml(retreat.name)}</div>
      </section>`;
    }).join("");
  }

  function exportRoomCardsPDF() {
    const html = buildRoomCardsHtml();
    if (!html) return toast("배정된 방이 없습니다. 배정 후 이용해주세요.", "warning");
    if (!printAsPDF(html, `${retreat.name}_방카드`)) {
      toast("팝업이 차단되어 PDF를 열 수 없습니다. 브라우저 팝업 허용을 확인해주세요.", "error");
    }
  }

  function exportRoomsPDF() {
    if (!printAsPDF(buildRoomsHtml(), `${retreat.name}_방배정`)) {
      toast("팝업이 차단되어 PDF를 열 수 없습니다. 브라우저 팝업 허용을 확인해주세요.", "error");
    }
  }

  async function exportRoomsJPG() {
    if (!await exportAsJPG(buildRoomsHtml(), `${retreat.name}_방배정`)) {
      toast("JPG 저장에 실패했습니다.", "error");
    }
  }

  function addRoom() {
    const id = `r_${Date.now()}`;
    const dong = newRoom.dong.trim();
    setRooms(prev => [...prev, {
      id,
      // 동은 입력했을 때만 저장 — 미입력 시 기존 단일 건물 방과 동일하게 필드 없음
      ...(dong ? { dong } : {}),
      roomNumber: newRoom.roomNumber,
      capacity: parseInt(newRoom.capacity) || 4,
      type: newRoom.type,
      studentIds: [],
      teachers: [],
    }]);
    setNewRoom({ dong: "", roomNumber: "", capacity: "4", type: "남" });
    setShowAddRoom(false);
    markDirty();
  }

  async function removeRoom(id: string) {
    const r = rooms.find(r => r.id === id);
    if (!r) return;
    if ((r.studentIds || []).length > 0 && !await uiConfirm("이 방에 배정된 학생이 미배정으로 돌아갑니다.")) return;
    setUnassigned(u => [...u, ...(r.studentIds || [])]);
    setRooms(prev => prev.filter(r => r.id !== id));
    markDirty();
  }

  async function removeAllRooms() {
    const currentRooms = roomsRef.current;
    if (currentRooms.length === 0 || isSavingRef.current) return;
    const assignedCount = new Set(currentRooms.flatMap(room => room.studentIds || [])).size;
    const confirmed = await uiConfirm(
      `현재 ${currentRooms.length}개 방과 배정 학생 ${assignedCount}명의 방배정을 모두 삭제하시겠습니까?\n\n` +
      "삭제 직전 방배정은 강제 백업되며 복구 버튼에서 되돌릴 수 있습니다. " +
      "이가드의 숙소 정보에서도 모든 방과 배정이 즉시 사라집니다."
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
        await saveRooms(retreat.id, roomsRef.current);
        markClean();
      }
      await clearRooms(retreat.id);
      roomsRef.current = [];
      latestRemoteRoomsRef.current = [];
      setRooms([]);
      setUnassigned(participantIds);
      markClean();
      toast(`${currentRooms.length}개 방을 모두 삭제했습니다.`, "success");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "전체 방 삭제 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  }

  /** 배정만 비우기 — 방 구조(동·호수·정원·성별)는 그대로 두고 사람만 전부 미배정으로. */
  async function clearAllAssignments() {
    const currentRooms = roomsRef.current;
    if (currentRooms.length === 0 || isSavingRef.current) return;
    const assignedCount = new Set(currentRooms.flatMap(room => room.studentIds || [])).size;
    const teacherCount = new Set(currentRooms.flatMap(room => room.teachers || [])).size;
    if (assignedCount === 0 && teacherCount === 0) {
      toast("비울 배정이 없습니다.", "warning");
      return;
    }
    const confirmed = await uiConfirm(
      `${currentRooms.length}개 방은 그대로 두고, 배정된 학생 ${assignedCount}명` +
      (teacherCount > 0 ? `·교사 ${teacherCount}명` : "") +
      `을 모두 미배정으로 되돌립니다.\n\n` +
      "직전 배정은 강제 백업되어 복구 버튼에서 되돌릴 수 있습니다. " +
      "이가드의 숙소 정보에도 즉시 반영됩니다. 계속할까요?"
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
        await saveRooms(retreat.id, roomsRef.current);
        markClean();
      }
      await clearRoomAssignments(retreat.id);
      const cleared = currentRooms.map(room => ({ ...room, studentIds: [], teachers: [] }));
      roomsRef.current = cleared;
      latestRemoteRoomsRef.current = cleared;
      setRooms(cleared);
      setUnassigned(participantIds);
      markClean();
      toast(`배정 ${assignedCount + teacherCount}건을 비웠습니다. 방 ${currentRooms.length}개는 유지됩니다.`, "success");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "배정 비우기 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  }

  const filteredUnassigned = genderFilter === "전체"
    ? allUnassigned
    : allUnassigned.filter(id => students[id]?.gender === genderFilter);

  // 표시용 정렬: 동(건물)별 → 호수 숫자순 (저장 순서는 그대로)
  const maleRooms = sortRooms(rooms.filter(r => r.type === "남"));
  const femaleRooms = sortRooms(rooms.filter(r => r.type === "여"));

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;
  if (loadError) return (
    <div className="card p-6 text-center">
      <p className="text-red-500 font-medium mb-2">⚠ 데이터를 불러오지 못했습니다</p>
      <p className="text-sm text-slate-500 mb-4">{loadError}</p>
      <button onClick={() => window.location.reload()} className="btn-secondary">새로고침</button>
    </div>
  );

  return (
    <div>
      {saveError && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
          ⚠ 저장 오류: {saveError}
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
          <button onClick={applyRemoteRooms}
            className="font-medium underline ml-3 whitespace-nowrap">
            {isDirty ? "내 변경 취소 후 갱신" : "갱신"}
          </button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="text-sm text-slate-500 flex items-center gap-2">
          총 {rooms.length}개 방 · 미배정 {allUnassigned.length}명
          <span className="text-[10px] text-green-500 flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>실시간
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => {
              const cancelled = new Set(Object.entries(cellColors).filter(([,c]) => c === "red").map(([k]) => k));
              if (!cancelled.size) return toast("신청취소 처리된 학생이 없습니다.", "warning");
              const n = rooms.reduce((s, r) => s + (r.studentIds||[]).filter(id => cancelled.has(id)).length, 0);
              if (!n) return toast("방배정에 신청취소자가 없습니다.", "warning");
              if (!await uiConfirm(`신청취소 학생 ${n}명을 모든 방에서 제거하시겠습니까?`)) return;
              setRooms(prev => {
                const updated = prev.map(r => ({ ...r, studentIds: (r.studentIds||[]).filter(id => !cancelled.has(id)) }));
                setUnassigned(excludeAssignedStudents(participantIds, updated, cancelled));
                return updated;
              });
              markDirty();
            }}
            disabled={rooms.length === 0}
            className="btn-secondary btn-sm text-red-600"
          >취소자 제거</button>
          <button onClick={exportRoomsXLSX} disabled={rooms.length === 0} className="btn-secondary btn-sm">📥 XLSX</button>
          <button onClick={exportRoomsPDF} disabled={rooms.length === 0} className="btn-secondary btn-sm">🖨️ PDF</button>
          <button onClick={exportRoomCardsPDF} disabled={rooms.length === 0} title="방 1개 = A4 1장, 방문 부착용 명단" className="btn-secondary btn-sm">🚪 방 카드</button>
          <button onClick={exportRoomsJPG} disabled={rooms.length === 0} className="btn-secondary btn-sm">🖼️ JPG</button>
          <BackupRestoreButton label="방배정" loadBackups={() => getRoomsBackups(retreat.id)} restore={key => restoreRoomsBackup(retreat.id, key)} />
          <button
            onClick={clearAllAssignments}
            disabled={rooms.length === 0 || saving}
            title="방 구조는 그대로 두고 배정된 사람만 전부 미배정으로 되돌립니다"
            className="btn-secondary btn-sm text-amber-600"
          >배정 비우기</button>
          <button
            onClick={removeAllRooms}
            disabled={rooms.length === 0 || saving}
            className="btn-secondary btn-sm text-red-600"
          >방 전체 삭제</button>
          <button onClick={() => setShowAddRoom(true)} className="btn-secondary btn-sm">＋ 방 추가</button>
          <span className={`text-xs font-medium px-2 ${saving ? "text-blue-500" : isDirty ? "text-amber-500" : "text-green-500"}`}>
            {saving ? "저장 중..." : isDirty ? "편집 중..." : "✓ 저장됨"}
          </span>
        </div>
      </div>

      <RoomAutoAssignPanel
        retreatId={retreat.id}
        roomCount={rooms.length}
        studentCount={roomAutoStudents.length}
        adultCount={roomAutoAdults.length}
        staffCount={detectedStaffCount}
        detectedAudioCount={detectedAudioCount}
        detectedMedicalCount={detectedMedicalCount}
        classes={roomAutoClasses}
        rooms={rooms}
        onPreview={previewAutomaticRooms}
      />

      {roomAutoPreview && (
        <RoomAutoAssignPreviewModal
          result={roomAutoPreview}
          students={students}
          runCount={roomAutoRunCount}
          onClose={closeAutomaticPreview}
          onRerun={rerunAutomaticRooms}
          onApply={applyAutomaticRooms}
        />
      )}

      {showAddRoom && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold mb-4">방 추가</h3>
            <div className="space-y-3">
              <input className="input" placeholder="동/건물 (예: 5동 · 여러 건물일 때만)" value={newRoom.dong}
                onChange={e => setNewRoom(p => ({...p, dong: e.target.value}))} />
              <input className="input" placeholder="방 호수 (예: 5012호)" value={newRoom.roomNumber}
                onChange={e => setNewRoom(p => ({...p, roomNumber: e.target.value}))} />
              <select className="input" value={newRoom.type}
                onChange={e => setNewRoom(p => ({...p, type: e.target.value}))}>
                <option value="남">남</option>
                <option value="여">여</option>
              </select>
              <input className="input" type="number" placeholder="정원" value={newRoom.capacity}
                onChange={e => setNewRoom(p => ({...p, capacity: e.target.value}))} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={addRoom} className="btn-primary flex-1 justify-center">추가</button>
              <button onClick={() => setShowAddRoom(false)} className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Unassigned */}
        <div>
          <div className="sticky top-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-sm text-slate-700">미배정</span>
              <span className="tag tag-yellow">{allUnassigned.length}명</span>
              {unassignedTeachers.length > 0 && (
                <span className="tag tag-blue">교사 {unassignedTeachers.length}</span>
              )}
              <select className="text-xs border border-slate-200 rounded px-1 py-0.5 ml-auto"
                value={genderFilter} onChange={e => setGenderFilter(e.target.value)}>
                <option>전체</option>
                <option value="남">남</option>
                <option value="여">여</option>
              </select>
            </div>
            <div
              className="card p-3 min-h-32 max-h-[calc(100vh-6rem)] overflow-y-auto"
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(null)}
            >
              {filteredUnassigned.length === 0 && unassignedTeachers.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">
                  {genderFilter !== "전체" ? `${genderFilter} 미배정 없음` : "모두 배정됨!"}
                </p>
              ) : (
                <RoomUnassignedBySection
                  unassigned={filteredUnassigned}
                  students={students}
                  cellColors={cellColors}
                  unassignedTeachers={genderFilter === "전체" ? unassignedTeachers : []}
                  onDragStartStudent={(id) => handleDragStart("student", id, null)}
                  onDragStartTeacher={(name) => handleDragStart("teacher", name, null)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Rooms */}
        <div className="lg:col-span-3">
          {[
            { label: "남자 방", list: maleRooms, color: "tag-blue" },
            { label: "여자 방", list: femaleRooms, color: "tag-red" },
          ].map(({ label, list: rList, color }) => (
            <div key={label} className="mb-4">
              <h3 className="text-sm font-semibold text-slate-500 mb-2">
                <span className={`tag ${color} mr-2`}>{label}</span>
                {rList.reduce((s, r) => s + (r.studentIds || []).filter(sid => cellColors[sid] !== "red").length, 0)}명
              </h3>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {rList.map(r => (
                  <RoomCard key={r.id} room={r} students={students} cellColors={cellColors}
                    studentCandidateIds={roomStudentCandidateIds}
                    allTeachers={allTeachers}
                    onDrop={() => handleDrop(r.id)}
                    onDragStart={(type, id) => handleDragStart(type, id, r.id)}
                    onAssignStudent={sid => assignStudentBySearch(r.id, sid)}
                    onAssignTeacher={name => assignTeacherBySearch(r.id, name)}
                    onUpdateCapacity={capacity => updateRoomCapacity(r.id, capacity)}
                    onRemoveStudent={sid => {
                      setRooms(prev => prev.map(rm =>
                        rm.id === r.id ? { ...rm, studentIds: rm.studentIds.filter(id => id !== sid) } : rm
                      ));
                      setUnassigned(u => [...u, sid]);
                      markDirty();
                    }}
                    onRemoveTeacher={name => {
                      setRooms(prev => prev.map(rm =>
                        rm.id === r.id ? { ...rm, teachers: (rm.teachers || []).filter(t => t !== name) } : rm
                      ));
                      markDirty();
                    }}
                    onRemove={() => removeRoom(r.id)}
                  />
                ))}
                {rList.length === 0 && (
                  <p className="text-xs text-slate-400 col-span-3 py-2">방이 없습니다.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function parseClassKey(classKey: string): { grade: number; cls: number } {
  const m = classKey?.match(/(\d+)학년\s*(\d+)반/);
  return m ? { grade: parseInt(m[1]), cls: parseInt(m[2]) } : { grade: 0, cls: 0 };
}

function RoomUnassignedBySection({ unassigned, students, cellColors, unassignedTeachers, onDragStartStudent, onDragStartTeacher }: {
  unassigned: string[];
  students: Record<string, StudentInfo>;
  cellColors: Record<string, string>;
  unassignedTeachers: TeacherAttendance[];
  onDragStartStudent: (id: string) => void;
  onDragStartTeacher: (name: string) => void;
}) {
  type Section = { bu: string; grade: number; cls: number; studentIds: string[]; teachers: TeacherAttendance[]; isStaff?: boolean };
  const sections: Section[] = [];
  const sectionMap = new Map<string, Section>();

  function getOrCreate(key: string, bu: string, grade: number, cls: number, isStaff = false) {
    if (!sectionMap.has(key)) {
      const sec: Section = { bu, grade, cls, studentIds: [], teachers: [], isStaff };
      sectionMap.set(key, sec);
      sections.push(sec);
    }
    return sectionMap.get(key)!;
  }

  const staffTeachers = unassignedTeachers.filter(t => t.bu === "스탭");
  if (staffTeachers.length > 0) {
    const sec = getOrCreate("스탭", "스탭", 0, 0, true);
    sec.teachers.push(...staffTeachers);
  }

  unassignedTeachers.filter(t => t.bu !== "스탭").forEach(t => {
    const { grade, cls } = parseClassKey(t.classKey);
    const key = `${t.bu}-${grade}-${cls}`;
    getOrCreate(key, t.bu, grade, cls).teachers.push(t);
  });

  unassigned.forEach(id => {
    const s = students[id];
    const bu = s?.bu || "미분류";
    const grade = s?.grade || 0;
    const cls = s?.class || 0;
    const key = `${bu}-${grade}-${cls}`;
    getOrCreate(key, bu, grade, cls).studentIds.push(id);
  });

  sections.sort((a, b) => {
    if (a.isStaff && !b.isStaff) return -1;
    if (!a.isStaff && b.isStaff) return 1;
    const buOrder = (x: string) => x === "1부" ? 0 : x === "2부" ? 1 : 2;
    return buOrder(a.bu) - buOrder(b.bu) || a.grade - b.grade || a.cls - b.cls;
  });

  return (
    <div className="space-y-2">
      {sections.map(sec => (
        <div key={`${sec.bu}-${sec.grade}-${sec.cls}`}>
          <div className="text-[10px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
            {sec.isStaff ? (
              <span className="inline-block px-1 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">스탭</span>
            ) : (
              <>
                <span className={`inline-block px-1 rounded text-[10px] font-semibold ${sec.bu === "1부" ? "bg-green-100 text-green-700" : sec.bu === "2부" ? "bg-purple-100 text-purple-700" : "bg-yellow-100 text-yellow-700"}`}>{sec.bu}</span>
                {sec.grade > 0 && <span>{sec.grade}학년</span>}
                {sec.cls > 0 && <span>{sec.cls}반</span>}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {sec.teachers.map(t => (
              <RoomTeacherChip key={t.name} teacher={t} onDragStart={() => onDragStartTeacher(t.name)} />
            ))}
            {sec.studentIds.map(id => {
              // id is already "1_rawId" format — use directly as colorKey
              const color = cellColors[id];
              const s = students[id];
              return (
                <RoomStudentChip key={id} id={id} student={s} color={color}
                  onDragStart={() => onDragStartStudent(id)} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoomStudentChip({ id, student, color, onDragStart }: {
  id: string; student?: StudentInfo; color?: string; onDragStart: () => void;
}) {
  const chipBase = color ? CELL_COLOR_CLS[color] : "bg-white border-slate-200";
  return (
    <div draggable onDragStart={onDragStart}
      className={`drag-handle border rounded px-1.5 py-0.5 text-xs flex items-center gap-1 hover:border-blue-300 transition-all select-none ${chipBase}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${student?.gender === "여" ? "bg-red-400" : "bg-blue-400"}`} />
      <span className="font-medium text-slate-700">{student?.name || id}</span>
      {student && <span className="text-slate-400">{student.grade}-{student.class}</span>}
    </div>
  );
}

function RoomTeacherChip({ teacher, onDragStart, onRemove }: {
  teacher: TeacherAttendance;
  onDragStart: () => void;
  onRemove?: () => void;
}) {
  const statusCls = TEACHER_STATUS_CLS[teacher.status] || "bg-slate-100 border-slate-200 text-slate-600";
  return (
    <div draggable onDragStart={onDragStart}
      className={`drag-handle border rounded px-1.5 py-0.5 text-xs flex items-center gap-1 cursor-grab hover:shadow-sm transition-all select-none ${statusCls}`}>
      <span>👨‍🏫 {teacher.name}</span>
      {teacher.status !== "전참" && <span className="text-[10px] opacity-75">({teacher.status})</span>}
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          className="opacity-60 hover:opacity-100 ml-0.5">×</button>
      )}
    </div>
  );
}

function RoomCard({ room, students, cellColors, studentCandidateIds, allTeachers, onDrop, onDragStart, onAssignStudent, onAssignTeacher, onUpdateCapacity, onRemoveStudent, onRemoveTeacher, onRemove }: {
  room: Room; students: Record<string, StudentInfo>;
  cellColors: Record<string, string>;
  studentCandidateIds: string[];
  allTeachers: TeacherAttendance[];
  onDrop: () => void;
  onDragStart: (type: "student" | "teacher", id: string) => void;
  onAssignStudent: (id: string) => void;
  onAssignTeacher: (name: string) => void;
  onUpdateCapacity: (capacity: number) => Promise<boolean>;
  onRemoveStudent: (id: string) => void;
  onRemoveTeacher: (name: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [capacityDraft, setCapacityDraft] = useState(String(room.capacity));
  const totalCount = (room.studentIds || []).length;
  const cancelledCount = (room.studentIds || []).filter(sid => cellColors[sid] === "red").length;
  const teachers = room.teachers || [];
  const activeStudentCount = totalCount - cancelledCount;
  const occupancy = activeStudentCount + teachers.length;
  const isFull = occupancy >= room.capacity;
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ko-KR");
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    const studentResults = studentCandidateIds
      .filter(id => !(room.studentIds || []).includes(id))
      .map(id => ({ type: "student" as const, id, student: students[id] }))
      .filter(result => (result.student?.name || result.id).toLocaleLowerCase("ko-KR").includes(normalizedQuery));
    const seenTeacherNames = new Set<string>();
    const teacherResults = allTeachers
      .filter(teacher => {
        if (seenTeacherNames.has(teacher.name)) return false;
        seenTeacherNames.add(teacher.name);
        return !teachers.includes(teacher.name) && teacher.name.toLocaleLowerCase("ko-KR").includes(normalizedQuery);
      })
      .map(teacher => ({ type: "teacher" as const, id: teacher.name, teacher }));

    return [...studentResults, ...teacherResults]
      .sort((a, b) => {
        const aName = a.type === "student" ? (a.student?.name || a.id) : a.teacher.name;
        const bName = b.type === "student" ? (b.student?.name || b.id) : b.teacher.name;
        const aExact = aName.toLocaleLowerCase("ko-KR") === normalizedQuery ? 0 : 1;
        const bExact = bName.toLocaleLowerCase("ko-KR") === normalizedQuery ? 0 : 1;
        return aExact - bExact || aName.localeCompare(bName, "ko");
      })
      .slice(0, 8);
  }, [allTeachers, normalizedQuery, room.studentIds, studentCandidateIds, students, teachers]);

  function closeEditing() {
    setEditing(false);
    setSearchQuery("");
    setCapacityDraft(String(room.capacity));
  }

  async function saveCapacity() {
    const parsed = Number(capacityDraft);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
      setCapacityDraft(String(room.capacity));
      return;
    }
    const saved = await onUpdateCapacity(parsed);
    if (!saved) setCapacityDraft(String(room.capacity));
  }

  function selectFirstResult() {
    const result = searchResults[0];
    if (!result) return;
    if (result.type === "student") onAssignStudent(result.id);
    else onAssignTeacher(result.teacher.name);
    setSearchQuery("");
  }

  return (
    <div
      className={`card p-3 border-2 ${isFull ? "border-orange-200" : "border-transparent"}`}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-bold text-slate-800">{roomLabel(room)}</span>
          <span className={`tag ${room.type === "남" ? "tag-blue" : "tag-red"} ml-1.5 text-[10px]`}>{room.type}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xs font-medium ${isFull ? "text-orange-500" : "text-slate-400"}`}>
            {occupancy}/{room.capacity}
          </span>
          <button
            onClick={() => editing ? closeEditing() : setEditing(true)}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${editing ? "bg-blue-50 text-blue-600" : "text-slate-300 hover:bg-slate-100 hover:text-slate-600"}`}
            title={editing ? "편집 닫기" : "방 편집"}
            aria-label={`${roomLabel(room)} ${editing ? "편집 닫기" : "방 편집"}`}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button onClick={onRemove} aria-label={`${roomLabel(room)} 삭제`} className="text-slate-300 hover:text-red-400 ml-1">×</button>
        </div>
      </div>

      {editing && (
        <div className="mb-2 space-y-2">
          <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1">
            <label className="shrink-0 text-[11px] font-medium text-slate-500 whitespace-nowrap" htmlFor={`room-capacity-${room.id}`}>방 정원</label>
            <input
              id={`room-capacity-${room.id}`}
              className="input !h-7 !w-14 shrink-0 px-1 py-0 text-center text-xs"
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              value={capacityDraft}
              onChange={event => setCapacityDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") { event.preventDefault(); void saveCapacity(); }
                if (event.key === "Escape") closeEditing();
              }}
            />
            <span className="shrink-0 text-[11px] text-slate-400">명</span>
            <button type="button" className="btn-secondary !h-7 shrink-0 whitespace-nowrap px-2 py-0 text-[11px]" onClick={() => void saveCapacity()}>변경</button>
            <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-slate-400">현재 {occupancy}명</span>
          </div>
          <div className="relative">
            <input
              className="input text-xs py-1.5 pr-8"
              autoFocus
              aria-label={`${roomLabel(room)} 배정할 이름 검색`}
              placeholder="학생·교사 이름 입력"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); selectFirstResult(); }
                if (e.key === "Escape") closeEditing();
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400 hover:text-slate-600"
                aria-label="검색어 지우기"
              >×</button>
            )}
            {normalizedQuery && (
              <div className="absolute z-30 left-0 right-0 top-full mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {searchResults.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">배정 가능한 이름을 찾지 못했습니다.</p>
              ) : searchResults.map(result => {
                if (result.type === "teacher") {
                  return (
                    <button key={`teacher-${result.teacher.name}`} type="button"
                      onClick={() => { onAssignTeacher(result.teacher.name); setSearchQuery(""); }}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-green-50 flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">👨‍🏫 {result.teacher.name}</span>
                      <span className="text-slate-400">교사 · {result.teacher.bu}</span>
                    </button>
                  );
                }
                const student = result.student;
                return (
                  <button key={`student-${result.id}`} type="button"
                    onClick={() => { onAssignStudent(result.id); setSearchQuery(""); }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">{student?.name || result.id}</span>
                    <span className="text-slate-400 whitespace-nowrap">학생 · {student?.bu || ""} {student ? `${student.grade}-${student.class}` : ""}</span>
                  </button>
                );
              })}
              </div>
            )}
          </div>
        </div>
      )}

      {teachers.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {teachers.map(name => (
            <div key={name} draggable onDragStart={() => onDragStart("teacher", name)}
              className="drag-handle border rounded px-1.5 py-0.5 text-xs flex items-center gap-1 group bg-green-50 border-green-200 text-green-700 cursor-grab">
              <span>👨‍🏫 {name}</span>
              <button onClick={() => onRemoveTeacher(name)}
                className="opacity-0 group-hover:opacity-100 ml-0.5">×</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 min-h-8 border-t border-slate-100 pt-2">
        {(room.studentIds || []).map(sid => {
          // sid is already "1_rawId" format — use directly as colorKey
          const color = cellColors[sid];
          const chipCls = color ? CELL_COLOR_CLS[color] : "bg-slate-50 border-slate-200";
          const s = students[sid];
          return (
            <div key={sid} draggable onDragStart={() => onDragStart("student", sid)}
              className={`drag-handle border rounded px-1.5 py-0.5 text-xs flex items-center gap-1 group ${chipCls}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s?.gender === "여" ? "bg-red-400" : "bg-blue-400"}`} />
              <span className="text-slate-700 font-medium">{s?.name || sid}</span>
              {s && <span className="text-slate-400 whitespace-nowrap">{s.bu} {s.grade}-{s.class}</span>}
              <button onClick={() => onRemoveStudent(sid)}
                className="opacity-0 group-hover:opacity-100 text-red-400 ml-0.5">×</button>
            </div>
          );
        })}
        {occupancy === 0 && (
          <p className="text-xs text-slate-300 py-1">드래그하여 배정</p>
        )}
      </div>
    </div>
  );
}
