"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, IguardScheduleBlock, IguardStaff, IguardPost, IguardMovement, IguardSegment } from "@/lib/types";
import { groupDisplayName } from "@/lib/groupNumber";
import { postLabel, parseNames, scheduleSortValue, timeRangeLabel, ageSortValue } from "@/lib/cueSheet";
import { dutyLabelsForStaff, dutyLinesForStaff, withoutStructuredDutyLabels } from "@/lib/personalDuty";
import { isDefaultSegment } from "@/lib/defaultSegment";

export default function StaffRosterBar({ staff, groups, schedule, posts, segments, movements, absentStaffNames = [] }: {
  staff: IguardStaff[];
  groups: Group[];
  schedule: IguardScheduleBlock[];
  posts: IguardPost[];
  segments: IguardSegment[];
  movements: IguardMovement[];
  absentStaffNames?: string[];
}) {
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showAdvance, setShowAdvance] = useState(true);
  const [showLate, setShowLate] = useState(true);
  const [showGroupException, setShowGroupException] = useState(true);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const rosterRef = useRef<HTMLDivElement | null>(null);
  const assignedStaff = useMemo(() => {
    const ids = new Set(movements.flatMap(movement => movement.staffId ? [movement.staffId] : []));
    staff.forEach(member => {
      if (schedule.some(block => dutyLabelsForStaff(dutyLinesForStaff(block, member.name), member.name).length > 0)) {
        ids.add(member.id);
      }
    });
    return ids;
  }, [movements, schedule, staff]);
  const sortedStaff = useMemo(
    () => [...staff].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "ko")),
    [staff]
  );
  const staffByAge = useMemo(() => {
    const map = new Map<string, IguardStaff[]>();
    sortedStaff.forEach(s => {
      const key = s.age?.trim() || "미입력";
      const list = map.get(key) || [];
      list.push(s);
      map.set(key, list);
    });
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "미입력") return 1;
      if (b === "미입력") return -1;
      return ageSortValue(a) - ageSortValue(b) || a.localeCompare(b, "ko", { numeric: true });
    });
  }, [sortedStaff]);
  const scheduleMap = useMemo(() => new Map(schedule.map(block => [block.id, block])), [schedule]);
  const postMap = useMemo(() => new Map(posts.map(post => [post.id, post])), [posts]);
  const assignedCount = sortedStaff.filter(s => assignedStaff.has(s.id)).length;
  const openStaff = openStaffId ? sortedStaff.find(s => s.id === openStaffId) : null;

  const staffGroups = useMemo(() => {
    if (!openStaff) return [];
    return groups.filter(g => parseNames(g.staff).includes(openStaff.name));
  }, [groups, openStaff]);

  const staffMovements = useMemo(() => {
    if (!openStaff) return [];
    const segmentMap = new Map(segments.map(segment => [segment.id, segment]));
    return movements
      .filter(mv => mv.staffId === openStaff.id)
      .map(mv => ({
        movement: mv,
        block: scheduleMap.get(mv.blockId),
        post: postMap.get(mv.postId),
        segment: mv.segmentId ? segmentMap.get(mv.segmentId) : undefined,
      }))
      .sort((a, b) => scheduleSortValue(a.block).localeCompare(scheduleSortValue(b.block)));
  }, [movements, openStaff, postMap, scheduleMap, segments]);

  const staffDuties = useMemo(() => {
    if (!openStaff) return [];
    return schedule
      .map(block => {
        const structuredLabels = staffMovements
          .filter(item => item.movement.blockId === block.id)
          .flatMap(item => [
            postLabel(item.post),
            item.segment && !isDefaultSegment(item.segment) ? item.segment.label : "",
          ]);
        return {
          block,
          labels: withoutStructuredDutyLabels(
            dutyLabelsForStaff(dutyLinesForStaff(block, openStaff.name), openStaff.name),
            structuredLabels,
          ),
        };
      })
      .filter(item => item.labels.length > 0)
      .sort((a, b) => scheduleSortValue(a.block).localeCompare(scheduleSortValue(b.block)));
  }, [openStaff, schedule, staffMovements]);

  const staffTimeline = useMemo(() => {
    const blockOrder = new Map(
      [...schedule]
        .sort((a, b) => scheduleSortValue(a).localeCompare(scheduleSortValue(b)))
        .map((block, index) => [block.id, index]),
    );
    return [
      ...staffMovements.map((item, order) => ({ ...item, kind: "movement" as const, order })),
      ...staffDuties.map((item, order) => ({ ...item, kind: "duty" as const, order })),
    ].sort((a, b) => {
      const scheduleOrder = (blockOrder.get(a.block?.id || "") ?? Number.MAX_SAFE_INTEGER)
        - (blockOrder.get(b.block?.id || "") ?? Number.MAX_SAFE_INTEGER);
      if (scheduleOrder !== 0) return scheduleOrder;
      if (a.kind !== b.kind) return a.kind === "movement" ? -1 : 1;
      return a.order - b.order;
    });
  }, [schedule, staffDuties, staffMovements]);

  useEffect(() => {
    if (!openStaffId) return;
    function handlePointerDown(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) close();
    }
    function close() {
      setOpenStaffId(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function handleViewportChange() { close(); }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [openStaffId]);

  useEffect(() => {
    const element = rosterRef.current;
    if (!element) return;
    const apply = () => document.documentElement.style.setProperty("--schedule-roster-h", `${element.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--schedule-roster-h");
    };
  }, []);

  function chipClasses(assigned: boolean, active: boolean): string {
    // 배정 여부는 "연한 파랑 배경 + 파란 점"으로 표시 → 이름의 corps 색(빨강/볼드/밑줄)과 겹치지 않게
    return `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
      assigned
        ? "border-sky-300 bg-sky-50 hover:bg-sky-100"
        : "border-slate-200 bg-white hover:border-slate-300"
    } ${active ? "ring-2 ring-fuchsia-300" : ""}`;
  }

  function nameClasses(staffMember: IguardStaff): string {
    const role = staffMember.role?.trim();
    const isGroupStaff = role ? role === "조스탭" : true;
    return [
      showLate && staffMember.corps === "후발대" ? "text-red-600" : "text-slate-900",
      showAdvance && staffMember.corps === "선발대" ? "font-black" : "",
      showGroupException && !isGroupStaff ? "underline underline-offset-2 decoration-2" : "",
    ].filter(Boolean).join(" ");
  }

  return (
    <div ref={rosterRef} className="sticky z-10 mb-3 rounded-lg border border-slate-200 bg-white/95 p-2.5 shadow-sm backdrop-blur" style={{ top: "var(--ig-header-h, 92px)" }}>
      <div className="relative mb-1 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-600">스탭 명단</span>
          {absentStaffNames.length > 0 && (
            <span className="text-[11px] text-red-400">불참 : {absentStaffNames.join(", ")}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <input type="checkbox" checked={showAdvance} onChange={e => setShowAdvance(e.target.checked)} />
            선발대
          </label>
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <input type="checkbox" checked={showLate} onChange={e => setShowLate(e.target.checked)} />
            후발대
          </label>
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <input type="checkbox" checked={showGroupException} onChange={e => setShowGroupException(e.target.checked)} />
            예외인력
          </label>
          <div className="text-[11px] text-slate-400">배정 {assignedCount} / {sortedStaff.length}</div>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700"
          >
            {expanded ? "접기" : "전체 보기"}
          </button>
        </div>
      </div>
      <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-slate-400">
        <span>🔵 파란 점 = 배정됨</span>
        <span>⚪ 회색 점 = 미배정</span>
        <span><strong className="text-slate-500">볼드</strong> = 선발대</span>
        <span className="text-red-400">빨간색 = 후발대</span>
        <span className="underline">밑줄 = 조스탭 예외 인력</span>
      </div>

      {sortedStaff.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
          스탭 탭에서 스탭을 먼저 등록해주세요.
        </div>
      ) : (
        <div ref={popoverRef} className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className={`space-y-1 overflow-y-auto pr-1 ${expanded ? "max-h-[320px]" : "max-h-[120px]"}`}>
            {staffByAge.map(([ageLabel, ageStaff]) => (
              <div key={ageLabel} className="grid grid-cols-[52px_1fr] items-start gap-1">
                <div className="pt-0.5 text-xs font-semibold text-slate-700">{/^\d+$/.test(ageLabel) ? `${ageLabel}년생` : ageLabel}</div>
                <div className="flex flex-wrap content-start gap-1">
                  {ageStaff.map(s => {
                    const assigned = assignedStaff.has(s.id);
                    const active = openStaffId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setOpenStaffId(active ? null : s.id)}
                        className={chipClasses(assigned, active)}
                        title={assigned ? "동선 배정됨" : "동선 미배정"}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${assigned ? "bg-sky-500" : "bg-slate-200"}`} aria-hidden />
                        <span className={nameClasses(s)}>{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {openStaff && (
            <div
              role="dialog"
              aria-label={`${openStaff.name} 스탭 정보`}
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-lg"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-800">{openStaff.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {openStaff.age && <div className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{openStaff.age}</div>}
                    {openStaff.role && <div className="inline-flex rounded-full bg-fuchsia-50 px-2 py-0.5 text-[11px] font-medium text-fuchsia-700">{openStaff.role}</div>}
                  </div>
                </div>
                <button type="button" onClick={() => setOpenStaffId(null)} className="text-slate-300 hover:text-slate-500">&times;</button>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-[11px] font-semibold text-slate-400">본대 여부</div>
                  <div className="mt-1 text-slate-700">
                    {openStaff.corps || "본대"}
                    {openStaff.corps === "후발대" && openStaff.lateArrival && <span className="text-slate-400"> &middot; 입소 {openStaff.lateArrival}</span>}
                  </div>
                </div>

                {(!openStaff.role || openStaff.role === "조스탭") && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-400">조스탭</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {staffGroups.length > 0 ? staffGroups.map(g => (
                      <span key={g.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {g.bu} {groupDisplayName(g, groups)}
                      </span>
                    )) : <span className="text-xs text-slate-400">조 미배정</span>}
                  </div>
                </div>
                )}

                {(openStaff.programTeam || openStaff.worship) && (
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400">팀 정보</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {openStaff.programTeam && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">{openStaff.programTeam}</span>}
                      {openStaff.worship && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">찬양팀</span>}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[11px] font-semibold text-slate-400">동선·담당</div>
                  {staffTimeline.length > 0 ? (
                    <div className="mt-1 max-h-56 space-y-1 overflow-y-auto pr-1">
                      {staffTimeline.map(item => {
                        if (item.kind === "movement") {
                          const { movement, block, post, segment } = item;
                          return (
                            <div key={`movement-${movement.id}`} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-mono text-slate-500">{block ? `${block.day}일차 ${timeRangeLabel(block.start, block.end)}` : "시간 미정"}</span>
                                {movement.round && <span className={`rounded px-1.5 py-0.5 text-[10px] ${movement.round === "선밥" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{movement.round}</span>}
                              </div>
                              {segment && !isDefaultSegment(segment) && (
                                <div className="mt-1 text-xs font-semibold text-slate-700">
                                  {segment.zone ? `(${segment.zone}) ` : ""}{segment.label}
                                </div>
                              )}
                              <div className="mt-1 text-xs font-medium text-slate-700">{postLabel(post)}</div>
                              {movement.note && <div className="mt-0.5 text-[11px] text-slate-400">{movement.note}</div>}
                            </div>
                          );
                        }
                        const { block, labels } = item;
                        return (
                          <div key={`duty-${block.id}`} className="rounded-lg border border-fuchsia-100 bg-fuchsia-50 px-2.5 py-2">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-slate-500">{block.day}일차 {timeRangeLabel(block.start, block.end)}</span>
                              <span className="font-medium text-slate-700">{block.label}</span>
                            </div>
                            <div className="mt-1 text-xs font-medium text-fuchsia-700">담당 · {labels.join(" · ")}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-slate-400">배정된 동선·담당 없음</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
