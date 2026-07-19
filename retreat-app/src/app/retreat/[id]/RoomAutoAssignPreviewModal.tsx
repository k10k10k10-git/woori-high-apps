"use client";

import { useEffect } from "react";
import type { RoomAutoAssignResult } from "@/lib/roomAutoAssign";
import type { Student } from "@/lib/types";
import { roomLabel } from "@/lib/roomLabel";

interface Props {
  result: RoomAutoAssignResult;
  students: Record<string, Student & { bu?: string; gender?: string }>;
  onClose: () => void;
  onApply: () => void;
}

export default function RoomAutoAssignPreviewModal({ result, students, onClose, onApply }: Props) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const canApply = result.hardViolations.length === 0;
  const assignedRooms = result.rooms.filter(room => room.studentIds.length || (room.teachers?.length ?? 0));

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/45 p-3 sm:p-6 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">🎲 자동 방배정 결과 미리보기</h2>
            <p className="text-sm text-slate-500 mt-1">
              30회 비교 완료 · 학생 {result.assignedStudentCount}명 · 교사/스탭/외부 {result.assignedAdultCount}명 · 사용 방 {result.usedRoomCount}개 · 빈 침상 {result.emptyBedCount}개
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-700" aria-label="닫기">×</button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {result.hardViolations.length > 0 && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-bold mb-1">적용할 수 없는 항목</p>
              {result.hardViolations.map(message => <p key={message}>• {message}</p>)}
            </div>
          )}
          {result.warnings.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              {result.warnings.map(message => <p key={message}>• {message}</p>)}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {assignedRooms.map(room => {
              const occupancy = room.studentIds.length + (room.teachers?.length ?? 0);
              const classLabels = [...new Set(room.studentIds.map(id => {
                const student = students[id];
                return student ? `${student.buNum ?? "?"}부 ${student.grade}-${student.class}` : "미상";
              }))];
              return (
                <article key={room.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                  <div className={`px-3 py-2 flex justify-between text-white ${room.type === "남" ? "bg-blue-800" : "bg-pink-700"}`}>
                    <span className="font-bold">{roomLabel(room)}</span>
                    <span className="text-xs">{room.type} · {occupancy}/{room.capacity}</span>
                  </div>
                  <div className="p-3 space-y-2 text-xs">
                    {classLabels.length > 0 && <p className="font-semibold text-slate-500">{classLabels.join(" · ")}</p>}
                    {(room.teachers ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(room.teachers ?? []).map((name, index) => <span key={`${name}-${index}`} className="tag tag-green">🧑‍🏫 {name}</span>)}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {room.studentIds.map(id => <span key={id} className={room.type === "남" ? "tag tag-blue" : "tag tag-red"}>{students[id]?.name ?? id}</span>)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <footer className="px-5 py-4 border-t border-slate-200 flex flex-col sm:flex-row gap-2 justify-end">
          <p className="text-xs text-slate-400 sm:mr-auto self-center">적용 전에는 현재 방배정과 DB가 변경되지 않습니다.</p>
          <button type="button" onClick={onClose} className="btn-secondary justify-center">취소</button>
          <button type="button" onClick={onApply} disabled={!canApply} className="btn-primary justify-center">
            ✅ 이 배정으로 적용
          </button>
        </footer>
      </div>
    </div>
  );
}
