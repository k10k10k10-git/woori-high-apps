"use client";

// 출석 표 — 학생 출석부와 같은 인원×회차 격자.
// ⚠ 셀은 토글이 아니다. 셀을 누르면 출석/지각/결석/지우기를 명시적으로 고른다
//   (같은 값을 다시 골라도 결과가 같은 멱등 기록 — 모노레포 실수 규칙 11).

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { describeApplicant } from "@/features/semester/db";
import { calcCompletion } from "@/features/semester/completion";
import { isStaffApplication, splitStudentsAndStaff } from "@/features/semester/roster";
import { sessionDateLabel, sessionDayLabel } from "@/features/semester/sessionDate";
import { sessionDisplayLabel } from "@/features/semester/sessionKind";
import type { Application, AttendanceStatus, CompletionEntry, Session, SessionAttendance } from "@/features/semester/types";
import { attendanceMenuPosition } from "./attendanceGridPosition";

type Props = {
  members: Application[];
  sessions: Session[];
  attBySession: Record<string, SessionAttendance>;
  canEdit: boolean;
  completion: Record<string, CompletionEntry>;
  completionMinRate: number;
  onMark: (appKey: string, sessId: string, status: AttendanceStatus) => void;
  onClear: (appKey: string, sessId: string) => void;
  onToggleCompletion: (appKey: string, field: "certPrinted" | "photoChecked", value: boolean) => void;
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

/** 학생·스탭 구간. 둘 다 있을 때만 구분 머리글을 넣는다(한쪽뿐이면 군더더기). */
function memberSections(members: Application[]): { label: string | null; rows: Application[] }[] {
  const { students, staff } = splitStudentsAndStaff(members);
  if (students.length === 0 || staff.length === 0) return [{ label: null, rows: members }];
  return [
    { label: "학생", rows: students },
    { label: "교사·스탭", rows: staff },
  ];
}

export default function AttendanceGrid({
  members,
  sessions,
  attBySession,
  canEdit,
  completion,
  completionMinRate,
  onMark,
  onClear,
  onToggleCompletion,
}: Props) {
  const [openCell, setOpenCell] = useState<{ appKey: string; sessId: string } | null>(null);
  // 메뉴는 body로 포털한다 — 표 컨테이너가 overflow-x:auto라 절대배치 메뉴가 아래에서 잘렸다.
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const groups = useMemo(() => monthGroups(sessions), [sessions]);
  const sections = useMemo(() => memberSections(members), [members]);
  const columnCount = sessions.length + 7;

  function closeMenu() {
    setOpenCell(null);
    setMenuAt(null);
    anchorRef.current = null;
  }

  function openMenu(event: React.MouseEvent<HTMLButtonElement>, appKey: string, sessId: string, open: boolean) {
    if (open) {
      closeMenu();
      return;
    }
    const anchor = event.currentTarget;
    anchorRef.current = anchor;
    setMenuAt(attendanceMenuPosition(anchor.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    setOpenCell({ appKey, sessId });
  }

  useEffect(() => {
    if (!openCell) return;
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      setMenuAt(attendanceMenuPosition(anchor.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }));
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !anchorRef.current?.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
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
    // 카드가 내용만큼만 차지하게 한다 — 회차가 적을 때 오른쪽에 빈 카드가 넓게 남지 않도록.
    <div className="card relative inline-block max-w-full overflow-x-auto align-top">
      {/* 회차가 적을 때 열이 늘어나지 않도록 내용 폭(w-max)으로 둔다 */}
      <table className="semester-attendance-grid cell-action-grid w-max border-collapse text-center text-sm">
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
            {(["점수", "출석률", "판정", "수료증", "사진"] as const).map((label) => (
              <th key={label} rowSpan={2} className="min-w-16 border-l px-2 py-2 text-xs font-semibold text-slate-500" style={{ borderColor: "var(--color-border)" }}>
                {label}
              </th>
            ))}
          </tr>
          <tr>
            {sessions.map((session) => {
              const label = sessionDisplayLabel(session);
              const special = session.type === "휴강" || label !== "정규";
              return (
                <th key={session.id}
                  title={`${sessionDateLabel(session)} · ${label}`}
                  className={`min-w-11 border-b px-1 py-1 text-xs font-semibold ${special ? "bg-amber-50 text-amber-700" : "text-slate-500"}`}
                  style={{ borderColor: "var(--color-border)" }}>
                  {sessionDayLabel(session)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <Fragment key={section.label ?? "all"}>
              {section.label && (
                <tr>
                  <th colSpan={columnCount}
                    className="sticky left-0 bg-slate-50 px-2 py-1 text-left text-[11px] font-semibold text-slate-500">
                    {section.label} <span className="font-normal text-slate-400">{section.rows.length}명</span>
                  </th>
                </tr>
              )}
              {section.rows.map((member, index) => {
                const staffMember = isStaffApplication(member);
                const result = staffMember ? null : calcCompletion(member.id, sessions, attBySession, completionMinRate);
                const check = completion[member.id] ?? {};
                return (
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
                      <td key={session.id} className={`attendance-status-cell p-0 ${
                        holiday ? "bg-amber-50/60" : entry ? MARK[entry.s].cell : ""
                      }`}>
                        <button
                          ref={open ? anchorRef : undefined}
                          disabled={!canEdit || holiday}
                          onClick={(event) => openMenu(event, member.id, session.id, open)}
                          aria-label={`${member.name} ${sessionDateLabel(session)} 출석 상태${entry ? ` (현재 ${entry.s})` : ""}`}
                          aria-expanded={open}
                          className={`attendance-status-button w-full text-sm font-semibold transition-colors disabled:cursor-default ${
                            entry ? "" : "text-slate-200 hover:bg-slate-50"
                          }`}
                          style={open ? { boxShadow: "inset 0 0 0 2px var(--color-primary)" } : undefined}
                        >
                          {holiday ? <span className="text-[10px] text-amber-600">휴강</span> : entry ? MARK[entry.s].text : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-l px-2 py-1.5 text-xs tabular-nums text-slate-600" style={{ borderColor: "var(--color-border)" }}>
                    {result ? `${result.score}/${result.maxScore}` : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-xs tabular-nums text-slate-600">{result ? `${Math.round(result.rate * 100)}%` : "-"}</td>
                  <td className="px-2 py-1.5">
                    {result ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${result.completed ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-500"}`}>{result.completed ? "수료" : "미수료"}</span> : <span className="text-xs text-slate-400">대상 아님</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {!staffMember && <input type="checkbox" aria-label={`${member.name} 수료증 제작`} disabled={!canEdit} checked={check.certPrinted ?? false} onChange={(event) => onToggleCompletion(member.id, "certPrinted", event.target.checked)} />}
                  </td>
                  <td className="px-2 py-1.5">
                    {!staffMember && <input type="checkbox" aria-label={`${member.name} 사진 확인`} disabled={!canEdit} checked={check.photoChecked ?? false} onChange={(event) => onToggleCompletion(member.id, "photoChecked", event.target.checked)} />}
                  </td>
                </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      {/* 메뉴는 body로 포털 — 표의 overflow에 잘리지 않는다 */}
      {openCell && menuAt && typeof document !== "undefined" && createPortal(
        (() => {
          const entry = attBySession[openCell.sessId]?.[openCell.appKey];
          return (
            <div ref={menuRef} role="menu"
              style={{ left: menuAt.left, top: menuAt.top, width: 148 }}
              className="fixed z-50 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              {(Object.keys(MARK) as AttendanceStatus[]).map((status) => (
                <button key={status} role="menuitem"
                  onClick={() => { onMark(openCell.appKey, openCell.sessId, status); closeMenu(); }}
                  className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium hover:bg-slate-50 ${entry?.s === status ? MARK[status].cell : "text-slate-500"}`}>
                  {MARK[status].text} {status}{entry?.s === status ? " (현재)" : ""}
                </button>
              ))}
              {entry && (
                <button role="menuitem" onClick={() => { onClear(openCell.appKey, openCell.sessId); closeMenu(); }}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-50">
                  ⌫ 기록 지우기
                </button>
              )}
            </div>
          );
        })(),
        document.body,
      )}
    </div>
  );
}
