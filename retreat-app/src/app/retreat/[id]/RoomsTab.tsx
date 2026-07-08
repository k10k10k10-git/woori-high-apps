"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { Retreat, Room, Student, Participant, TeacherAttendance } from "@/lib/types";
import { saveRooms, subscribeToRooms, getStudentsByYear, subscribeToParticipants, subscribeToCellColors, subscribeToTeachers, getRoomsBackups, restoreRoomsBackup } from "@/lib/db";
import BackupRestoreButton from "./BackupRestoreButton";
import * as XLSX from "xlsx";
import { useUI } from "@/context/UIContext";
import { saveWorkbook, printAsPDF, exportAsJPG, escapeHtml } from "@/lib/exportUtils";
import { TEACHER_STATUS_CLS, LATE_REGISTRANT_COLORS } from "@/lib/constants";

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
  const [newRoom, setNewRoom] = useState({ roomNumber: "", capacity: "4", type: "남" });
  const [genderFilter, setGenderFilter] = useState<string>("전체");
  const [cellColors, setCellColors] = useState<Record<string, string>>({});

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
        const assigned = new Set(prev.flatMap(r => r.studentIds || []));
        setUnassigned(ids.filter(id => !assigned.has(id)));
        return prev;
      });
    }, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: cell colors
    unsubs.push(subscribeToCellColors(retreat.id, setCellColors, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: teachers
    unsubs.push(subscribeToTeachers(retreat.id, (teachers) => {
      setAllTeachers(teachers);
    }, e => setLoadError(prev => prev ?? `구독 실패 — ${e.message}`)));

    // Real-time: rooms
    unsubs.push(subscribeToRooms(retreat.id, (newRooms) => {
      if (!initialLoaded.current) {
        setRooms(newRooms);
        setParticipantIds(prev => {
          const assigned = new Set(newRooms.flatMap(r => r.studentIds || []));
          setUnassigned(prev.filter(id => !assigned.has(id)));
          return prev;
        });
        setLoading(false);
        initialLoaded.current = true;
      } else if (!isDirtyRef.current && !isDragging.current) {
        setRooms(newRooms);
        setParticipantIds(prev => {
          const assigned = new Set(newRooms.flatMap(r => r.studentIds || []));
          setUnassigned(prev.filter(id => !assigned.has(id)));
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
      const assigned = new Set(newRooms.flatMap(r => r.studentIds || []));
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

  // 전체 미배정: 기존 미배정 + 후기 신청자 중 방에 미배정된 인원
  // 신청취소(red) 학생은 풀에서 제외 — 취소자 제거 후 리로드 시 재등장 방지
  const allUnassigned = useMemo(() => {
    const assignedSet = new Set(rooms.flatMap(r => r.studentIds || []));
    const lateUnassigned = lateRegistrantIds.filter(id => !assignedSet.has(id));
    return [...unassigned, ...lateUnassigned].filter(id => cellColors[id] !== "red");
  }, [unassigned, lateRegistrantIds, rooms, cellColors]);

  const unassignedTeachers = useMemo(() => {
    const assigned = new Set(rooms.flatMap(r => r.teachers || []));
    return allTeachers.filter(t => !assigned.has(t.name));
  }, [rooms, allTeachers]);

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
      if (!await uiConfirm(`${targetRoom.roomNumber}호가 정원(${targetRoom.capacity}명)을 초과합니다. 계속할까요?`)) {
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


  function exportRoomsXLSX() {
    const rows: Record<string, string | number>[] = [];
    rooms.forEach(r => {
      (r.teachers || []).forEach(t => {
        rows.push({ "방번호": r.roomNumber, "유형": r.type, "정원": r.capacity, "역할": "교사", "이름": t, "부": "", "학년": "", "반": "" });
      });
      (r.studentIds || []).forEach(sid => {
        const s = students[sid];
        rows.push({ "방번호": r.roomNumber, "유형": r.type, "정원": r.capacity, "역할": "학생", "이름": s?.name || sid, "부": s?.buNum === 1 ? "1부" : s?.buNum === 2 ? "2부" : "", "학년": s ? `${s.grade}학년` : "", "반": s ? `${s.class}반` : "" });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 8 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 6 }, { wch: 8 }, { wch: 6 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "방배정");
    saveWorkbook(wb, `${retreat.name}_방배정`);
  }

  function buildRoomsHtml() {
    const typeList = [...new Set(rooms.map(r => r.type))].sort();
    const chip = (text: string, bg = "#eff6ff", border = "#bfdbfe", color = "#1e40af") =>
      `<span style="display:inline-block;background:${bg};border:1px solid ${border};border-radius:9999px;padding:1px 8px;font-size:10px;color:${color};margin:2px 2px 2px 0">${escapeHtml(text)}</span>`;

    let html = `<h1 style="margin:0 0 4px">${escapeHtml(retreat.name)} 방배정</h1>
      <p style="font-size:11px;color:#888;margin:0 0 16px">총 ${rooms.length}개 방 · 출력일: ${new Date().toLocaleDateString("ko-KR")}</p>`;

    typeList.forEach(type => {
      const typeRooms = rooms.filter(r => r.type === type);
      html += `<h2 style="font-size:13px;margin:0 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">${escapeHtml(type)}생 방 (${typeRooms.length}개)</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">`;

      typeRooms.forEach(r => {
        const teacherChips = (r.teachers || []).map(t =>
          chip(t, "#f1f5f9", "#cbd5e1", "#334155")
        ).join("");
        const studentChips = (r.studentIds || []).map(sid => {
          const s = students[sid];
          const color = cellColors[sid];
          const [bg, border, fg] = color === "blue"   ? ["#dbeafe","#93c5fd","#1e40af"]
                                  : color === "orange" ? ["#ffedd5","#fdba74","#9a3412"]
                                  : color === "red"    ? ["#fee2e2","#fca5a5","#991b1b"]
                                  : ["#eff6ff","#bfdbfe","#1e40af"];
          const label = s ? `${s.name} ${s.buNum ? s.buNum+"부 " : ""}${s.grade}-${s.class}` : sid;
          return chip(label, bg, border, fg);
        }).join("");

        html += `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;page-break-inside:avoid;font-size:11px">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">
            ${escapeHtml(r.roomNumber)}호
            <span style="font-size:10px;background:#f1f5f9;color:#475569;border-radius:4px;padding:1px 6px;margin-left:4px">${escapeHtml(r.type)}생</span>
            <span style="font-size:10px;color:#94a3b8;margin-left:4px">정원 ${r.capacity}명</span>
          </div>
          ${teacherChips ? `<div style="margin-bottom:5px"><span style="color:#64748b;font-size:10px">👨‍🏫 교사: </span>${teacherChips}</div>` : ""}
          <div style="border-top:1px solid #f1f5f9;padding-top:6px">${studentChips || '<span style="color:#cbd5e1;font-size:10px">배정 없음</span>'}</div>
          <div style="text-align:right;font-size:10px;color:#94a3b8;margin-top:4px">${(r.studentIds || []).length}명 / ${r.capacity}명</div>
        </div>`;
      });

      html += `</div>`;
    });

    return html;
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
    setRooms(prev => [...prev, {
      id,
      roomNumber: newRoom.roomNumber,
      capacity: parseInt(newRoom.capacity) || 4,
      type: newRoom.type,
      studentIds: [],
      teachers: [],
    }]);
    setNewRoom({ roomNumber: "", capacity: "4", type: "남" });
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

  const filteredUnassigned = genderFilter === "전체"
    ? allUnassigned
    : allUnassigned.filter(id => students[id]?.gender === genderFilter);

  const maleRooms = rooms.filter(r => r.type === "남");
  const femaleRooms = rooms.filter(r => r.type === "여");

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
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-slate-500 flex items-center gap-2">
          총 {rooms.length}개 방 · 미배정 {allUnassigned.length}명
          <span className="text-[10px] text-green-500 flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>실시간
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const cancelled = new Set(Object.entries(cellColors).filter(([,c]) => c === "red").map(([k]) => k));
              if (!cancelled.size) return toast("신청취소 처리된 학생이 없습니다.", "warning");
              const n = rooms.reduce((s, r) => s + (r.studentIds||[]).filter(id => cancelled.has(id)).length, 0);
              if (!n) return toast("방배정에 신청취소자가 없습니다.", "warning");
              if (!await uiConfirm(`신청취소 학생 ${n}명을 모든 방에서 제거하시겠습니까?`)) return;
              setRooms(prev => {
                const updated = prev.map(r => ({ ...r, studentIds: (r.studentIds||[]).filter(id => !cancelled.has(id)) }));
                const assigned = new Set(updated.flatMap(r => r.studentIds||[]));
                setUnassigned(participantIds.filter(id => !assigned.has(id) && !cancelled.has(id)));
                return updated;
              });
              markDirty();
            }}
            disabled={rooms.length === 0}
            className="btn-secondary btn-sm text-red-600"
          >취소자 제거</button>
          <button onClick={exportRoomsXLSX} disabled={rooms.length === 0} className="btn-secondary btn-sm">📥 XLSX</button>
          <button onClick={exportRoomsPDF} disabled={rooms.length === 0} className="btn-secondary btn-sm">🖨️ PDF</button>
          <button onClick={exportRoomsJPG} disabled={rooms.length === 0} className="btn-secondary btn-sm">🖼️ JPG</button>
          <BackupRestoreButton label="방배정" loadBackups={() => getRoomsBackups(retreat.id)} restore={key => restoreRoomsBackup(retreat.id, key)} />
          <button onClick={() => setShowAddRoom(true)} className="btn-secondary btn-sm">＋ 방 추가</button>
          <span className={`text-xs font-medium px-2 ${saving ? "text-blue-500" : isDirty ? "text-amber-500" : "text-green-500"}`}>
            {saving ? "저장 중..." : isDirty ? "편집 중..." : "✓ 저장됨"}
          </span>
        </div>
      </div>

      {showAddRoom && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold mb-4">방 추가</h3>
            <div className="space-y-3">
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
                    onDrop={() => handleDrop(r.id)}
                    onDragStart={(type, id) => handleDragStart(type, id, r.id)}
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

function RoomCard({ room, students, cellColors, onDrop, onDragStart, onRemoveStudent, onRemoveTeacher, onRemove }: {
  room: Room; students: Record<string, StudentInfo>;
  cellColors: Record<string, string>;
  onDrop: () => void;
  onDragStart: (type: "student" | "teacher", id: string) => void;
  onRemoveStudent: (id: string) => void;
  onRemoveTeacher: (name: string) => void;
  onRemove: () => void;
}) {
  const totalCount = (room.studentIds || []).length;
  const cancelledCount = (room.studentIds || []).filter(sid => cellColors[sid] === "red").length;
  const count = totalCount - cancelledCount;
  const isFull = count >= room.capacity;
  const teachers = room.teachers || [];

  return (
    <div
      className={`card p-3 border-2 ${isFull ? "border-orange-200" : "border-transparent"}`}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-bold text-slate-800">{room.roomNumber}</span>
          <span className={`tag ${room.type === "남" ? "tag-blue" : "tag-red"} ml-1.5 text-[10px]`}>{room.type}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xs font-medium ${isFull ? "text-orange-500" : "text-slate-400"}`}>
            {count}/{room.capacity}
          </span>
          <button onClick={onRemove} className="text-slate-300 hover:text-red-400 ml-1">×</button>
        </div>
      </div>

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
        {count === 0 && teachers.length === 0 && (
          <p className="text-xs text-slate-300 py-1">드래그하여 배정</p>
        )}
      </div>
    </div>
  );
}
