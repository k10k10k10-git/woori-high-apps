"use client";

// 출석 표 — 학생 출석부와 같은 인원×회차 격자.
// ⚠ 셀은 토글이 아니다. 셀을 누르면 출석/지각/결석/지우기를 명시적으로 고른다
//   (같은 값을 다시 골라도 결과가 같은 멱등 기록 — 모노레포 실수 규칙 11).

import { useEffect, useMemo, useRef, useState } from "react";
import { describeApplicant } from "@/features/semester/db";
import { sessionDisplayLabel } from "@/features/semester/sessionKind";
import type { Application, AttendanceStatus, Session, SessionAttendance } from "@/features/semester/types";

type Props = {
  members: Application[];
  sessions: Session[];
  attBySession: Record<string, SessionAttendance>;
  canEdit: boolean;
  onMark: (appKey: string, sessId: string, status: AttendanceStatus) => void;
  onClear: (appKey: string, sessId: string) => void;
};

const MARK: Record<AttendanceStatus, { text: string; cell: string }> = {
  출석: { text: "✓", cell: "bg-emerald-50 text-emerald-600" },
  지각: { text: "△", cell: "bg-amber-50 text-amber-600" },
  결석: { text: "✕", cell: "bg-red-50 text-red-500" },
};

/** 월별 헤더 그룹 — "1월 / 4 11 18 25" 형태 */
function monthGroups(sessions: Session[]) {
  const groups: { month: number; sessions: Session[] }[] = [];
  for (const session of sessions) {
    const month = Number(session.date.slice(5, 7));
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.sessions.push(session);
    else groups.push({ month, sessions: [session] });
  }
  return groups;
}

export default function AttendanceGrid({ members, sessions, attBySession, canEdit, onMark, onClear }: Props) {
  const [openCell, setOpenCell] = useState<{ appKey: string; sessId: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => monthGroups(sessions), [sessions]);

  useEffect(() => {
    if (!openCell) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenCell(null); };
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenCell(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [openCell]);

  if (sessions.length === 0) return <p className="text-sm text-slate-400">등록된 회차가 없습니다.</p>;
  if (members.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
        표시할 인원이 없습니다.
      </p>
    );
  }

  return (
    <div className="card relative overflow-x-auto">
      {/* 회차가 적을 때 열이 늘어나지 않도록 내용 폭(w-max)으로 둔다 */}
      <table className="w-max border-collapse text-center text-sm">
        <thead>
          <tr>
            <th rowSpan={2} className="sticky left-0 z-10 bg-white px-2 py-2 text-xs font-semibold text-slate-400">순</th>
            <th rowSpan={2} className="sticky left-8 z-10 min-w-28 bg-white px-2 py-2 text-xs font-semibold text-slate-400">이름</th>
            {groups.map((group) => (
              <th key={group.month} colSpan={group.sessions.length}
                className="border-b px-2 py-1 text-xs font-bold"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}>
                {group.month}월
              </th>
            ))}
          </tr>
          <tr>
            {sessions.map((session) => {
              const label = sessionDisplayLabel(session);
              const special = session.type === "휴강" || label !== "정규";
              return (
                <th key={session.id}
                  title={`${session.date} · ${label}`}
                  className={`min-w-11 border-b px-1 py-1 text-xs font-semibold ${special ? "bg-amber-50 text-amber-700" : "text-slate-500"}`}
                  style={{ borderColor: "var(--color-border)" }}>
                  {Number(session.date.slice(8, 10))}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {members.map((member, index) => (
            <tr key={member.id} className="border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
              <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-xs text-slate-400">{index + 1}</td>
              <td className="sticky left-8 z-10 whitespace-nowrap bg-white px-2 py-1.5 text-left">
                <span className="font-medium text-slate-800">{member.name}</span>
                <span className="ml-1.5 text-[11px] text-slate-400">{describeApplicant(member)}</span>
              </td>
              {sessions.map((session) => {
                const entry = attBySession[session.id]?.[member.id];
                const holiday = session.type === "휴강";
                const open = openCell?.appKey === member.id && openCell?.sessId === session.id;
                return (
                  <td key={session.id} className={`relative p-0 ${holiday ? "bg-amber-50/60" : ""}`}>
                    <button
                      disabled={!canEdit || holiday}
                      onClick={() => setOpenCell(open ? null : { appKey: member.id, sessId: session.id })}
                      aria-label={`${member.name} ${session.date} 출석 상태${entry ? ` (현재 ${entry.s})` : ""}`}
                      className={`h-9 w-full text-sm font-semibold transition-colors disabled:cursor-default ${
                        entry ? MARK[entry.s].cell : "text-slate-200 hover:bg-slate-50"
                      } ${open ? "ring-2 ring-inset" : ""}`}
                      style={open ? { boxShadow: "inset 0 0 0 2px var(--color-primary)" } : undefined}
                    >
                      {holiday ? <span className="text-[10px] text-amber-600">휴강</span> : entry ? MARK[entry.s].text : "·"}
                    </button>
                    {open && (
                      <div ref={menuRef}
                        className="absolute left-1/2 top-full z-30 mt-1 w-32 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                        {(Object.keys(MARK) as AttendanceStatus[]).map((status) => (
                          <button key={status}
                            onClick={() => { onMark(member.id, session.id, status); setOpenCell(null); }}
                            className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium hover:bg-slate-50 ${entry?.s === status ? "text-slate-900" : "text-slate-500"}`}>
                            {MARK[status].text} {status}{entry?.s === status ? " (현재)" : ""}
                          </button>
                        ))}
                        {entry && (
                          <button onClick={() => { onClear(member.id, session.id); setOpenCell(null); }}
                            className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-50">
                            ⌫ 기록 지우기
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
