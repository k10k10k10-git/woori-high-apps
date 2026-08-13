"use client";
import { useState } from "react";
import { Group, Student, TeacherAttendance } from "@/lib/types";
import { TEACHER_STATUS_CLS } from "@/lib/constants";
import { resolveGroupRoleStudentId } from "@/lib/groupRoleStudent";
import { useRetreatCanEdit } from "@/features/portal/RetreatEditContext";

const parseNames = (csv: string) => (csv || "").split(",").map(s => s.trim()).filter(Boolean);

export interface StudentInfo extends Student {
  bu?: string;
  participantKey?: string;
}

export const CHIP_COLOR_CLS: Record<string, string> = {
  blue:   "bg-blue-100 border-blue-300",
  orange: "bg-orange-100 border-orange-300",
  red:    "bg-red-100 border-red-300",
};

function parseClassKey(classKey: string): { grade: number; cls: number } {
  const m = classKey?.match(/(\d+)학년\s*(\d+)반/);
  return m ? { grade: parseInt(m[1]), cls: parseInt(m[2]) } : { grade: 0, cls: 0 };
}

// ── StudentChip ─────────────────────────────────────────────

export function StudentChip({ id, name, tag, bu, color, onDragStart }: {
  id: string; name: string; tag: string | null; bu?: string; color?: string; onDragStart: () => void
}) {
  const canEditRetreat = useRetreatCanEdit();
  const chipBase = color ? CHIP_COLOR_CLS[color] : "bg-white border-slate-200";
  return (
    <div
      draggable={canEditRetreat}
      onDragStart={(e) => {
        e.dataTransfer.setData("dragType", "student");
        e.dataTransfer.setData("dragName", name);
        e.dataTransfer.setData("dragId", id);
        onDragStart();
      }}
      className={`drag-handle border rounded-lg px-2 py-1 text-xs flex items-center gap-1 hover:border-blue-300 hover:shadow-sm transition-all select-none ${chipBase}`}
    >
      <span className="font-medium text-slate-700">{name}</span>
      {tag && <span className="text-slate-400">{tag}</span>}
      {bu && <span className={`tag ${bu.includes("1") ? "tag-green" : "tag-purple"} text-[10px] px-1`}>{bu}</span>}
    </div>
  );
}

// ── TeacherChip ─────────────────────────────────────────────

export function TeacherChip({ teacher, onDragStart, onRemove }: {
  teacher: TeacherAttendance;
  onDragStart: () => void;
  onRemove?: () => void;
}) {
  const canEditRetreat = useRetreatCanEdit();
  const statusCls = TEACHER_STATUS_CLS[teacher.status] || "bg-slate-100 border-slate-200 text-slate-600";
  return (
    <div
      draggable={canEditRetreat}
      onDragStart={(e) => {
        e.dataTransfer.setData("dragType", "teacher");
        e.dataTransfer.setData("dragName", teacher.name);
        onDragStart();
      }}
      className={`drag-handle border rounded-lg px-2 py-1 text-xs flex items-center gap-1 hover:shadow-sm transition-all select-none cursor-grab ${statusCls}`}
    >
      <span className="font-medium">👨‍🏫 {teacher.name}</span>
      {teacher.status !== "전참" && <span className="text-[10px] opacity-75">({teacher.status})</span>}
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          className="opacity-60 hover:opacity-100 ml-0.5" aria-label={`${teacher.name} 제거`}>×</button>
      )}
    </div>
  );
}

// ── UnassignedBySection ─────────────────────────────────────

export function UnassignedBySection({ unassigned, students, cellColors, unassignedTeachers, onDragStartStudent, onDragStartTeacher }: {
  unassigned: string[];
  students: Record<string, StudentInfo & { bu?: string }>;
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

  // 스탭 교사 먼저
  const staffTeachers = unassignedTeachers.filter(t => t.bu === "스탭");
  if (staffTeachers.length > 0) {
    const sec = getOrCreate("스탭", "스탭", 0, 0, true);
    sec.teachers.push(...staffTeachers);
  }

  // 일반 교사 → 각 반 섹션에
  unassignedTeachers.filter(t => t.bu !== "스탭").forEach(t => {
    const { grade, cls } = parseClassKey(t.classKey);
    const key = `${t.bu}-${grade}-${cls}`;
    getOrCreate(key, t.bu, grade, cls).teachers.push(t);
  });

  // 학생 → 각 반 섹션에
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
              <span className="tag tag-blue text-[10px] px-1 py-0">스탭</span>
            ) : (
              <>
                <span className={`tag ${sec.bu === "1부" ? "tag-green" : sec.bu === "2부" ? "tag-purple" : "tag-yellow"} text-[10px] px-1 py-0`}>{sec.bu}</span>
                {sec.grade > 0 && <span>{sec.grade}학년</span>}
                {sec.cls > 0 && <span>{sec.cls}반</span>}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {sec.teachers.map(t => (
              <TeacherChip key={t.name} teacher={t} onDragStart={() => onDragStartTeacher(t.name)} />
            ))}
            {sec.studentIds.map(id => {
              const color = cellColors[id];
              const s = students[id];
              return (
                <StudentChip key={id} id={id} name={s?.name || id} tag={null}
                  bu={s?.bu} color={color}
                  onDragStart={() => onDragStartStudent(id)} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── GroupCard ────────────────────────────────────────────────

export function GroupCard({ group, displayName, students, teacherStatusMap, allTeachers, iguardStaffNames, cellColors, onDrop, onDragStart, onRemoveStudent, onRemoveTeacher, onUpdate, onRemoveGroup, onAddStudent }: {
  group: Group;
  displayName: string;
  students: Record<string, StudentInfo>;
  teacherStatusMap: Record<string, string>;
  allTeachers: TeacherAttendance[];
  iguardStaffNames: string[];
  cellColors: Record<string, string>;
  onDrop: () => void;
  onDragStart: (type: "student" | "teacher", id: string) => void;
  onRemoveStudent: (id: string) => void;
  onRemoveTeacher: (name: string) => void;
  onUpdate: (field: keyof Group, val: unknown) => void;
  onRemoveGroup: () => void;
  onAddStudent: (id: string) => void;
}) {
  const canEditRetreat = useRetreatCanEdit();
  const [editing, setEditing] = useState(false);
  const [editTeachers, setEditTeachers] = useState("");
  const [editLeader, setEditLeader] = useState("");
  const [editStaff, setEditStaff] = useState("");
  const [editGbs, setEditGbs] = useState("");

  function toggleEditing() {
    if (!editing) {
      setEditTeachers((group.teachers || []).join(", "));
      setEditLeader(group.leader || "");
      setEditStaff(group.staff || "");
      setEditGbs(group.gbs || "");
    }
    setEditing(prev => !prev);
  }

  function handleDrop(field: "teachers" | "leader" | "staff", e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const name = e.dataTransfer.getData("dragName");
    const id = e.dataTransfer.getData("dragId");
    if (!name) return;
    if (field === "teachers") {
      const parts = parseNames(editTeachers);
      if (parts.includes(name)) return;
      const next = parts.length > 0 ? `${editTeachers}, ${name}` : name;
      setEditTeachers(next);
      onUpdate("teachers", [...parts, name]);
    } else if (field === "leader") {
      const parts = parseNames(editLeader);
      if (parts.includes(name)) return;
      const next = parts.length > 0 ? `${editLeader}, ${name}` : name;
      setEditLeader(next);
      onUpdate("leader", next);
      if (id) onAddStudent(id);
    } else if (field === "staff") {
      const parts = parseNames(editStaff);
      if (parts.includes(name)) return;
      const next = parts.length > 0 ? `${editStaff}, ${name}` : name;
      setEditStaff(next);
      onUpdate("staff", next);
      if (id) onAddStudent(id);
    }
  }

  return (
    <div
      className="card p-3"
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-slate-800">{displayName}</span>
          <span className={`tag ${group.bu === "1부" ? "tag-green" : "tag-purple"} text-[10px]`}>{group.bu}</span>
        </div>
        {/* 윈도우 창 컨트롤 느낌 — 평소엔 납작한 아이콘, 호버 시에만 강조(삭제는 빨강 채움) */}
        <div className="flex items-center -mr-1 -mt-0.5">
          <button onClick={toggleEditing}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="조 편집" aria-label="조 편집">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button onClick={onRemoveGroup}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:bg-red-500 hover:text-white transition-colors"
            title="조 삭제" aria-label="조 삭제">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      {editing && (
        <div className="mb-2 space-y-1.5 bg-slate-50 rounded p-2">
          <input className="input text-xs py-1" placeholder="👨‍🏫 교사 (쉼표 구분 또는 드래그)"
            aria-label="교사"
            value={editTeachers}
            onChange={e => setEditTeachers(e.target.value)}
            onBlur={() => onUpdate("teachers", editTeachers.split(",").map(t => t.trim()).filter(Boolean))}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDrop("teachers", e)} />
          <input className="input text-xs py-1" placeholder="⭐ 조장 (드래그 또는 입력)"
            aria-label="조장"
            value={editLeader}
            onChange={e => setEditLeader(e.target.value)}
            onBlur={() => onUpdate("leader", editLeader)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDrop("leader", e)} />
          <input className="input text-xs py-1" placeholder="🧑‍💼 조 스탭 (드래그 또는 입력)"
            aria-label="조 스탭"
            value={editStaff}
            onChange={e => setEditStaff(e.target.value)}
            onBlur={() => onUpdate("staff", editStaff)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDrop("staff", e)} />
          <input className="input text-xs py-1" placeholder="📍 GBS 장소 (예: 5012호)"
            aria-label="GBS 장소"
            value={editGbs}
            onChange={e => setEditGbs(e.target.value)}
            onBlur={() => onUpdate("gbs", editGbs)} />
        </div>
      )}


      {!editing && (
        <div className="flex flex-wrap items-center gap-1 mb-1">
          <span className="text-xs text-slate-400">👨‍🏫 교사:</span>
          {(group.teachers || []).length === 0 && <span className="text-xs text-slate-300">-</span>}
          {(group.teachers || []).map(t => {
            const status = teacherStatusMap[t];
            const cls = status ? TEACHER_STATUS_CLS[status] : "bg-slate-100 border-slate-200 text-slate-600";
            return (
              <div key={t}
                draggable={canEditRetreat}
                onDragStart={(e) => { e.dataTransfer.setData("dragType", "teacher"); e.dataTransfer.setData("dragName", t); onDragStart("teacher", t); }}
                className={`drag-handle border rounded px-1.5 py-0.5 text-xs flex items-center gap-1 group cursor-grab ${cls}`}
              >
                <span>{t}</span>
                {status === "부분참" && <span className="text-[10px] opacity-75">(부분참)</span>}
                {status === "불참" && <span className="text-[10px] opacity-75">(불참)</span>}
                <button onClick={() => onRemoveTeacher(t)}
                  className="opacity-0 group-hover:opacity-100 ml-0.5" aria-label={`${t} 제거`}>×</button>
              </div>
            );
          })}
        </div>
      )}
      {!editing && (() => {
        const names = (group.leader || "").split(",").map(n => n.trim()).filter(Boolean);
        return (
          <div className="flex flex-wrap items-center gap-1 mb-1">
            <span className="text-xs text-slate-400">⭐ 조장:</span>
            {names.length === 0 && <span className="text-xs text-slate-300">-</span>}
            {names.map(name => {
              const sid = resolveGroupRoleStudentId(students, group, name);
              const s = sid ? students[sid] : null;
              return (
                <div key={name} className="border border-yellow-200 bg-yellow-50 rounded px-1.5 py-0.5 text-xs flex items-center gap-1 group">
                  <span className="text-slate-700">{name}</span>
                  {s && <span className="text-slate-400">{s.grade}-{s.class}</span>}
                  <button onClick={() => {
                    onUpdate("leader", names.filter(n => n !== name).join(", "));
                    if (sid) onRemoveStudent(sid);
                  }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 ml-0.5" aria-label={`조장 ${name} 제거`}>×</button>
                </div>
              );
            })}
          </div>
        );
      })()}
      {!editing && (() => {
        const names = (group.staff || "").split(",").map(n => n.trim()).filter(Boolean);
        // 이가드에서 배정한 조스탭도 같은 줄에 합쳐 표시 (행정 스탭과 이름이 겹치면 행정 칩만)
        const iguardOnly = iguardStaffNames.filter(n => !names.includes(n));
        return (
          <div className="flex flex-wrap items-center gap-1 mb-1">
            <span className="text-xs text-slate-400">🧑‍💼 스탭:</span>
            {names.length === 0 && iguardOnly.length === 0 && <span className="text-xs text-slate-300">-</span>}
            {names.map(name => {
              const sid = resolveGroupRoleStudentId(students, group, name);
              return (
                <div key={name} className="border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5 text-xs flex items-center gap-1 group">
                  <span className="text-slate-700">{name}</span>
                  <button onClick={() => {
                    onUpdate("staff", names.filter(n => n !== name).join(", "));
                    if (sid) onRemoveStudent(sid);
                  }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 ml-0.5" aria-label={`스탭 ${name} 제거`}>×</button>
                </div>
              );
            })}
            {iguardOnly.map(name => (
              <span key={`ig_${name}`}
                title="이가드 사이트의 조스탭 배정 탭에서 배정됨 — 해제도 이가드에서"
                className="rounded bg-fuchsia-50 border border-fuchsia-100 px-1.5 py-0.5 text-xs text-fuchsia-700">
                🧩 {name}
              </span>
            ))}
          </div>
        );
      })()}
      {!editing && (
        <div className="text-xs text-blue-500 mb-2">📍 GBS: {group.gbs ? group.gbs : <span className="text-slate-300">-</span>}</div>
      )}

      {(() => {
        const leaderNames = new Set((group.leader || "").split(",").map(n => n.trim()).filter(Boolean));
        const staffNames = new Set((group.staff || "").split(",").map(n => n.trim()).filter(Boolean));
        const filteredIds = (group.studentIds || []).filter(sid => {
          const s = students[sid];
          return !s || (!leaderNames.has(s.name) && !staffNames.has(s.name));
        });

        // 반 담임 맵 (부 필터 적용)
        const classTeacherMap = new Map<string, TeacherAttendance>();
        allTeachers.filter(t => t.bu === group.bu).forEach(t => {
          const m = t.classKey?.match(/(\d+)학년\s*(\d+)반/);
          if (m) classTeacherMap.set(`${m[1]}-${m[2]}`, t);
        });

        // 반별 그룹화
        const classBuckets = new Map<string, string[]>();
        const unknownIds: string[] = [];
        filteredIds.forEach(sid => {
          const s = students[sid];
          if (!s) { unknownIds.push(sid); return; }
          const key = `${s.grade}-${s.class}`;
          if (!classBuckets.has(key)) classBuckets.set(key, []);
          classBuckets.get(key)!.push(sid);
        });
        const sortedClasses = [...classBuckets.keys()].sort((a, b) => {
          const [ag, ac] = a.split("-").map(Number);
          const [bg, bc] = b.split("-").map(Number);
          return ag !== bg ? ag - bg : ac - bc;
        });

        const StudentChipInner = ({ sid }: { sid: string }) => {
          const s = students[sid];
          const color = cellColors[sid];
          const chipCls = color ? CHIP_COLOR_CLS[color] : "bg-blue-50 border-blue-200";
          return (
            <div
              draggable={canEditRetreat}
              onDragStart={(e) => { e.dataTransfer.setData("dragType", "student"); e.dataTransfer.setData("dragName", s?.name || sid); e.dataTransfer.setData("dragId", sid); onDragStart("student", sid); }}
              className={`drag-handle border rounded px-1.5 py-0.5 text-xs flex items-center gap-1 group cursor-grab ${chipCls}`}
            >
              <span className="text-slate-700">{s?.name || sid}</span>
              <button onClick={() => onRemoveStudent(sid)}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 ml-0.5" aria-label={`${s?.name || sid} 제거`}>×</button>
            </div>
          );
        };

        return (
          <>
            <div className="min-h-8 border-t border-slate-100 pt-2"
              onDragOver={e => e.preventDefault()}
            >
              {sortedClasses.length === 0 && unknownIds.length === 0 && (
                <p className="text-xs text-slate-300 py-1">여기에 드래그하세요</p>
              )}
              {/* 학교 자리표처럼 반마다 하나의 분단(열) — 반이 좌우로 나란히, 학생은 그 아래 세로 한 줄 */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 items-start">
                {sortedClasses.map(classKey => {
                  const [gradeStr, classNumStr] = classKey.split("-");
                  const teacher = classTeacherMap.get(classKey);
                  const sids = classBuckets.get(classKey) || [];
                  const isEven = parseInt(classNumStr) % 2 === 0;
                  return (
                    <div key={classKey} className="min-w-0">
                      <div className="mb-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isEven ? "bg-pink-50 text-pink-600" : "bg-blue-50 text-blue-600"}`}>
                          {gradeStr}학년 {classNumStr}반
                        </span>
                      </div>
                      {/* 교사도 학생과 통일성 있게 반 라벨 아래 세로 줄 맨 위에 배치 */}
                      <div className="flex flex-col gap-1 items-start">
                        {teacher && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${TEACHER_STATUS_CLS[teacher.status] || "bg-slate-50 text-slate-500 border-slate-200"}`}>
                            {teacher.name}{teacher.status !== "전참" ? ` (${teacher.status})` : ""}
                          </span>
                        )}
                        {sids.map(sid => <StudentChipInner key={sid} sid={sid} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {unknownIds.length > 0 && (
                <div className="flex flex-col gap-1 items-start mt-2">
                  {unknownIds.map(sid => <StudentChipInner key={sid} sid={sid} />)}
                </div>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1.5 text-right">
              {(() => {
                const cancelled = filteredIds.filter(sid => cellColors[sid] === "red").length;
                // 조장·스탭도 조 인원이다 — 학생 목록(filteredIds)에서 이름으로 빠져 있으므로 다시 더한다.
                const total = filteredIds.length - cancelled + leaderNames.size + staffNames.size;
                return cancelled > 0
                  ? <>{total}명 <span className="text-red-300">(취소 {cancelled}명 제외)</span></>
                  : <>{total}명</>;
              })()}
            </div>
          </>
        );
      })()}
    </div>
  );
}
