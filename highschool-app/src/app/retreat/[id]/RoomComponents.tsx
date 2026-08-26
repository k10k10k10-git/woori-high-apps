"use client";

import { useMemo, useState } from "react";
import { Room, Student, TeacherAttendance } from "@/lib/types";
import { TEACHER_STATUS_CLS } from "@/lib/constants";
import { roomLabel } from "@/lib/roomLabel";
import { useRetreatCanEdit } from "@/features/portal/RetreatEditContext";

interface StudentInfo extends Student {
  bu?: string;
  gender?: string;
}

const CELL_COLOR_CLS: Record<string, string> = {
  blue: "bg-blue-100 border-blue-300",
  orange: "bg-orange-100 border-orange-300",
  red: "bg-red-100 border-red-300",
};

function parseClassKey(classKey: string): { grade: number; cls: number } {
  const m = classKey?.match(/(\d+)학년\s*(\d+)반/);
  return m ? { grade: parseInt(m[1]), cls: parseInt(m[2]) } : { grade: 0, cls: 0 };
}

export function RoomUnassignedBySection({ unassigned, students, cellColors, unassignedTeachers, onDragStartStudent, onDragStartTeacher }: {
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
  const canEditRetreat = useRetreatCanEdit();
  const chipBase = color ? CELL_COLOR_CLS[color] : "bg-white border-slate-200";
  return (
    <div draggable={canEditRetreat} onDragStart={onDragStart}
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
  const canEditRetreat = useRetreatCanEdit();
  const statusCls = TEACHER_STATUS_CLS[teacher.status] || "bg-slate-100 border-slate-200 text-slate-600";
  return (
    <div draggable={canEditRetreat} onDragStart={onDragStart}
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

export function RoomCard({ room, students, cellColors, studentCandidateIds, allTeachers, onDrop, onDragStart, onAssignStudent, onAssignTeacher, onUpdateCapacity, onRemoveStudent, onRemoveTeacher, onRemove }: {
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
  const canEditRetreat = useRetreatCanEdit();
  const [editing, setEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [capacityDraft, setCapacityDraft] = useState(String(room.capacity));
  const totalCount = (room.studentIds || []).length;
  const cancelledCount = (room.studentIds || []).filter(sid => cellColors[sid] === "red").length;
  const teachers = useMemo(() => room.teachers || [], [room.teachers]);
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
            <div key={name} draggable={canEditRetreat} onDragStart={() => onDragStart("teacher", name)}
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
            <div key={sid} draggable={canEditRetreat} onDragStart={() => onDragStart("student", sid)}
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
