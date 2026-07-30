"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, IguardGbsPlace, IguardStaff, IguardScheduleBlock, IguardPost, AssignedIguardMovement, Retreat, RetreatPeriod } from "@/lib/types";
import {
  nowHHMM, todayStr, formatShortDate, activePeriod, retreatDateForDay,
  periodRangeLabel, currentRetreatDay, compareBlocks, isNowOn,
  currentBlockFor, nextBlockFor, timeRangeLabel,
} from "@/lib/scheduleTime";
import { chooseCueCardStaffId, findPreferredStaffId } from "@/lib/staffIdentity";
import {
  cueTimelineListBlocks, cueTimelineScrollTop, cueTimelineWindow, type CueTimelinePhase,
} from "@/lib/cueCardTimeline";
import { gbsPlacesForStaff } from "@/lib/gbsPlaces";
import { dutyLabelsForStaff } from "@/lib/personalDuty";

interface Data {
  retreatId?: string;
  staff: IguardStaff[];
  schedule: IguardScheduleBlock[];
  posts: IguardPost[];
  movements: AssignedIguardMovement[];
  retreat?: Retreat;
  periods?: RetreatPeriod[];   // 준비일정의 "수련회 기간" — 오늘이 며칠차인지 계산용
  preferredStaffNames?: string[];
  groups?: Group[];
  groupStaff?: Record<string, string[]>;
  gbs?: Record<string, IguardGbsPlace>;
}

function useClock() {
  const [clock, setClock] = useState(() => ({ today: todayStr(), time: nowHHMM() }));
  useEffect(() => {
    const id = window.setInterval(() => setClock({ today: todayStr(), time: nowHHMM() }), 30000);
    return () => window.clearInterval(id);
  }, []);
  return clock;
}
function textLines(value?: string | null): string[] {
  return (value || "").split(/\n+/).map(line => line.trim()).filter(Boolean);
}
function visibleNoticeLines(value?: string | null): string[] {
  const lines = textLines(value);
  const visible: string[] = [];
  let inRosterMemo = false;

  for (const line of lines) {
    const compact = line.replace(/\s+/g, "");
    if (/^스탭명단/.test(compact)) {
      inRosterMemo = true;
      continue;
    }
    if (/^\*\s*(볼드체|밑줄|파란색|빨간색)/.test(line)) continue;
    if (inRosterMemo) continue;
    visible.push(line);
  }
  return visible;
}
function dutyLinesForStaff(block: IguardScheduleBlock, staffName?: string): string[] {
  if (!staffName) return [];
  const all = [...textLines(block.owner), ...visibleNoticeLines(block.notice)];
  const picked: string[] = [];
  all.forEach((line, index) => {
    if (!line.includes(staffName)) return;
    const prev = all[index - 1];
    if (prev && !prev.includes(staffName) && /[:：]$/.test(prev.trim()) && !picked.includes(prev)) picked.push(prev);
    if (!picked.includes(line)) picked.push(line);
  });
  return picked;
}
function TextBlock({ title, children, tone = "slate" }: { title: string; children: string; tone?: "slate" | "fuchsia" | "amber" }) {
  const cls = tone === "fuchsia"
    ? "bg-fuchsia-50 border-fuchsia-100 text-fuchsia-800"
    : tone === "amber"
      ? "bg-amber-50 border-amber-100 text-amber-800"
      : "bg-white border-slate-100 text-slate-700";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="mb-1 text-xs font-semibold opacity-70">{title}</div>
      <div className="text-xs whitespace-pre-line leading-relaxed">{children}</div>
    </div>
  );
}
function BlockTextSummary({ block }: { block: IguardScheduleBlock }) {
  const notice = visibleNoticeLines(block.notice).join("\n");
  const hasAny = block.detail || block.owner || notice;
  if (!hasAny) return null;
  return (
    <div className="grid gap-2">
      {block.detail && <TextBlock title="진행 내용">{block.detail}</TextBlock>}
      {block.owner && <TextBlock title="담당자 / 역할" tone="fuchsia">{block.owner}</TextBlock>}
      {notice && <TextBlock title="특이사항" tone="amber">{notice}</TextBlock>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 개인 큐카드 (스탭 1인의 시간순 동선) — 모바일
// ════════════════════════════════════════════════════════════
export function CueCardView({
  retreatId, staff, schedule, posts, movements, retreat, periods, preferredStaffNames = [],
  groups = [], groupStaff = {}, gbs = {},
}: Data) {
  const clock = useClock();
  const curDay = currentRetreatDay(periods, retreat);
  const [staffId, setStaffId] = useState("");
  const staffPicked = useRef(false);
  const initialTimelinePositioned = useRef(false);
  const timelineAnchorRef = useRef<HTMLDivElement | null>(null);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const pinnedCardsRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pinnedCardsCollapsed, setPinnedCardsCollapsed] = useState(false);
  const [timelineCompact, setTimelineCompact] = useState(false);
  const sortedStaff = useMemo(() => [...staff].sort((a, b) => a.name.localeCompare(b.name, "ko")), [staff]);
  const staffSelectionKey = retreatId ? `iguard:${retreatId}:cue-card-staff` : null;
  const preferredStaffId = useMemo(
    () => findPreferredStaffId(sortedStaff, preferredStaffNames),
    [sortedStaff, preferredStaffNames],
  );
  const displayedStaff = useMemo(() => {
    if (!preferredStaffId) return sortedStaff;
    const mine = sortedStaff.find(s => s.id === preferredStaffId);
    return mine ? [mine, ...sortedStaff.filter(s => s.id !== preferredStaffId)] : sortedStaff;
  }, [preferredStaffId, sortedStaff]);
  const toggleOpen = (id: string) => setOpen(p => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const postName = useMemo(() => {
    const m = new Map(posts.map(p => [p.id, p.area ? `[${p.area}] ${p.name}` : p.name]));
    return (id: string) => m.get(id) || "(삭제된 포스트)";
  }, [posts]);
  const myMoves = useMemo(() => {
    const m = new Map<string, AssignedIguardMovement[]>();
    movements.filter(mv => mv.staffId === staffId).forEach(mv => {
      const current = m.get(mv.blockId) || [];
      current.push(mv);
      m.set(mv.blockId, current);
    });
    return m;
  }, [movements, staffId]);
  const sortedSchedule = useMemo(() => [...schedule].sort(compareBlocks), [schedule]);

  useEffect(() => {
    if (!staffSelectionKey || staffPicked.current) return;
    const saved = window.localStorage.getItem(staffSelectionKey);
    if (saved && sortedStaff.some(member => member.id === saved)) {
      staffPicked.current = true;
      setStaffId(saved);
    }
  }, [sortedStaff, staffSelectionKey]);

  useEffect(() => {
    if (!sortedStaff.length) return;
    const nextStaffId = chooseCueCardStaffId(sortedStaff, staffId, preferredStaffId, staffPicked.current);
    if (staffId !== nextStaffId) setStaffId(nextStaffId);
  }, [preferredStaffId, sortedStaff, staffId]);

  const currentBlock = currentBlockFor(schedule, curDay, clock.time);
  const effectiveDay = curDay;
  const period = activePeriod(periods, retreat);
  const timelinePhase: CueTimelinePhase = curDay != null
    ? "active"
    : !period
      ? "unknown"
      : clock.today < period.startDate
        ? "before"
        : "after";
  const { nextBlock, remainingBlocks } = cueTimelineWindow(
    sortedSchedule,
    currentBlock?.id || null,
    effectiveDay,
    clock.time,
    timelinePhase,
  );
  // 수련회 진행 중에는 지난 일정도 DOM에 남겨 위로 스크롤해 다시 볼 수 있게 한다.
  // 시작 전·종료 후·기간 미설정 상태는 기존처럼 고정 카드 이후 일정만 간결하게 표시한다.
  const listBlocks = cueTimelineListBlocks(sortedSchedule, remainingBlocks, timelinePhase);
  const initialVisibleBlockId = timelinePhase === "active"
    ? remainingBlocks[0]?.id || currentBlock?.id || "__timeline_end"
    : null;
  const days = [...new Set(listBlocks.map(b => b.day))].sort((a, b) => a - b);
  const currentMoves = currentBlock ? myMoves.get(currentBlock.id) || [] : [];
  const nextMoves = nextBlock ? myMoves.get(nextBlock.id) || [] : [];
  const currentDate = effectiveDay == null ? null : retreatDateForDay(periods, retreat, effectiveDay);
  const selectedStaff = staff.find(s => s.id === staffId);
  const selectedStaffGbs = useMemo(
    () => gbsPlacesForStaff(staffId, selectedStaff?.name, groups, groupStaff, gbs),
    [staffId, selectedStaff?.name, groups, groupStaff, gbs],
  );
  const currentDutyLines = currentBlock ? dutyLinesForStaff(currentBlock, selectedStaff?.name) : [];
  const nextDutyLines = nextBlock ? dutyLinesForStaff(nextBlock, selectedStaff?.name) : [];
  const currentDutyLabels = dutyLabelsForStaff(currentDutyLines, selectedStaff?.name);
  const nextDutyLabels = dutyLabelsForStaff(nextDutyLines, selectedStaff?.name);

  useEffect(() => {
    if (timelinePhase !== "active" || !initialVisibleBlockId || initialTimelinePositioned.current) return;
    const frame = window.requestAnimationFrame(() => {
      const target = initialVisibleBlockId === "__timeline_end" ? timelineEndRef.current : timelineAnchorRef.current;
      if (!target) return;
      const headerHeight = Number.parseFloat(
        window.getComputedStyle(document.documentElement).getPropertyValue("--ig-header-h"),
      ) || 0;
      const pinnedHeight = pinnedCardsRef.current?.offsetHeight || 0;
      const targetTop = target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: cueTimelineScrollTop(targetTop, headerHeight, pinnedHeight), behavior: "auto" });
      initialTimelinePositioned.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialVisibleBlockId, timelinePhase]);

  if (staff.length === 0 || schedule.length === 0) return (
    <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🪪</div>
      <p>스탭·스탭 전체 큐싯·동선 매트릭스를 먼저 입력하면<br />여기에 개인 큐카드가 자동 생성됩니다.</p></div>
  );

  return (
    <div>
      <div className="mb-4">
        <label className="mb-1 block text-xs font-semibold text-slate-500">스탭 선택 · 본인 우선, 나머지 가나다순</label>
        <select
          className="input h-12 w-full border-fuchsia-300 bg-white text-base font-semibold text-slate-800 shadow-sm focus:border-fuchsia-500"
          value={staffId}
          onChange={e => {
            staffPicked.current = true;
            setStaffId(e.target.value);
            if (staffSelectionKey) window.localStorage.setItem(staffSelectionKey, e.target.value);
          }}
        >
          {displayedStaff.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="mt-2 flex min-h-10 items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs">
          <span className="shrink-0 font-semibold text-indigo-700">우리 조 GBS 장소</span>
          {selectedStaffGbs.length > 0 ? (
            <span className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-indigo-900">
              {selectedStaffGbs.flatMap(summary =>
                summary.groups.map(group => (
                  <span key={`${summary.place}-${group.id}`}>
                    {group.bu} {group.label} · <strong>{summary.place}</strong>
                  </span>
                )),
              )}
            </span>
          ) : (
            <span className="text-indigo-400">담당 조 또는 장소가 지정되지 않았습니다.</span>
          )}
        </div>
      </div>
      <div
        ref={pinnedCardsRef}
        className={`sticky z-10 -mx-3 mb-4 bg-slate-50/95 px-3 py-2 shadow-[0_10px_18px_-16px_rgba(15,23,42,0.45)] backdrop-blur sm:-mx-4 sm:px-4 ${pinnedCardsCollapsed ? "space-y-1" : "space-y-2"}`}
        style={{ top: "var(--ig-header-h, 0px)" }}
      >
      <div className={`card border-2 ${pinnedCardsCollapsed ? "p-3" : "min-h-[116px] p-4 sm:min-h-[132px] sm:p-5"} ${currentBlock ? "border-fuchsia-300 bg-fuchsia-50/80" : "border-slate-200 bg-white/95"}`}>
        <div className={`flex items-start justify-between gap-3 ${pinnedCardsCollapsed ? "mb-0" : "mb-2"}`}>
          <div>
            <div className="text-xs font-semibold text-fuchsia-700 mb-1">지금 해야 할 일</div>
            <div className={`${pinnedCardsCollapsed ? "text-base" : "text-lg sm:text-xl"} font-bold text-slate-800`}>
              {currentBlock
                ? currentBlock.label
                : timelinePhase === "before"
                  ? "수련회 시작 전입니다"
                  : timelinePhase === "after"
                    ? "수련회가 종료되었습니다"
                    : curDay == null
                      ? "수련회 기간을 확인해주세요"
                      : nextBlock
                        ? "현재 진행 중인 일정이 없습니다"
                        : "오늘 일정이 종료되었습니다"}
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="text-right">
              <div className="font-mono text-sm font-semibold text-slate-700">{clock.time}</div>
              {!pinnedCardsCollapsed && (
                <div className="text-xs text-slate-400">{currentDate ? `${effectiveDay}일차 · ${formatShortDate(currentDate)}` : periodRangeLabel(periods, retreat)}</div>
              )}
            </div>
            <button
              type="button"
              className="min-h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-fuchsia-300 hover:text-fuchsia-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
              aria-expanded={!pinnedCardsCollapsed}
              aria-controls="cue-card-current-details cue-card-next-details"
              onClick={() => setPinnedCardsCollapsed(value => !value)}
            >
              {pinnedCardsCollapsed ? "펼치기 ▼" : "접기 ▲"}
            </button>
          </div>
        </div>
        <div id="cue-card-current-details">
        {!pinnedCardsCollapsed && (currentBlock ? (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">
              {timeRangeLabel(currentBlock)}
            </div>
            <div className="rounded-lg bg-white border border-fuchsia-100 p-3">
              {currentMoves.length > 0 ? (
                <div className="space-y-2">
                  {currentMoves.map(move => (
                    <div key={move.id}>
                      <div className="text-sm font-semibold text-slate-800">📍 {postName(move.postId)}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {move.round && <span className={`px-2 py-0.5 rounded-full text-xs ${move.round === "선밥" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{move.round}</span>}
                        {move.note && <span className="px-2 py-0.5 rounded-full text-xs bg-fuchsia-100 text-fuchsia-700">{move.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-500">배치 없음 · 조와 함께 움직이면 됩니다.</div>
              )}
            </div>

            {currentDutyLabels.length > 0 && (
              <TextBlock title="담당 역할" tone="fuchsia">{currentDutyLabels.join("\n")}</TextBlock>
            )}
            {currentBlock.detail && <div className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{currentBlock.detail}</div>}
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            {timelinePhase === "before"
              ? `첫 일정은 ${nextBlock ? `${nextBlock.day}일차 ${timeRangeLabel(nextBlock)} · ${nextBlock.label}` : "아직 등록되지 않았습니다."}`
              : timelinePhase === "after"
                ? "모든 일정이 종료되었습니다."
                : curDay == null
                  ? "수련회 기간을 설정하면 현재·다음 일정이 자동으로 표시됩니다."
                  : nextBlock
                    ? `${timeRangeLabel(nextBlock)}까지 대기합니다.`
                    : "현재 시간 이후로 등록된 시간 블록이 없습니다."}
          </div>
        ))}
        </div>
      </div>
      <div className={`card border ${pinnedCardsCollapsed ? "p-3" : "min-h-[96px] p-4 sm:min-h-[110px] sm:p-5"} ${nextBlock ? "border-violet-200 bg-violet-50/90" : "border-slate-200 bg-white/95"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`${pinnedCardsCollapsed ? "mb-0.5" : "mb-1"} text-xs font-semibold text-violet-700`}>다음 해야 할 일</div>
            <div className={`truncate font-bold text-slate-800 ${pinnedCardsCollapsed ? "text-base" : "text-lg"}`}>
              {nextBlock ? nextBlock.label : "예정된 다음 일정이 없습니다"}
            </div>
          </div>
          {nextBlock && (
            <div className="shrink-0 text-right text-xs text-slate-500">
              <div className="font-mono font-semibold text-slate-700">{timeRangeLabel(nextBlock)}</div>
              <div>{nextBlock.day}일차</div>
            </div>
          )}
        </div>
        <div id="cue-card-next-details">
        {!pinnedCardsCollapsed && nextBlock && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {nextMoves.length > 0 ? (
              nextMoves.map(move => (
                <span key={move.id} className="inline-flex flex-wrap items-center gap-1">
                  <span className="rounded-md bg-white px-2 py-1 font-semibold text-slate-700">📍 {postName(move.postId)}</span>
                  {move.round && <span className={`rounded-full px-2 py-0.5 ${move.round === "선밥" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{move.round}</span>}
                  {move.note && <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-fuchsia-700">{move.note}</span>}
                </span>
              ))
            ) : (
              <span className="text-slate-500">배치 없음 · 조와 함께</span>
            )}
            {nextDutyLabels.length > 0 && (
              <span className="rounded-md bg-white px-2 py-1 text-violet-800">담당 · {nextDutyLabels.join(" · ")}</span>
            )}
          </div>
        )}
        </div>
      </div>
      </div>
      <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-700">전체 일정 {listBlocks.length}개</div>
          <div className="truncate text-xs text-slate-400">
            {timelineCompact ? "시간·일정·내 위치를 한 줄로 확인합니다." : "한눈에 보기로 급할 때 전체 흐름을 빠르게 확인하세요."}
          </div>
        </div>
        <button
          type="button"
          className={`min-h-10 shrink-0 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 ${
            timelineCompact
              ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
              : "border-slate-200 bg-white text-slate-600 hover:border-fuchsia-300 hover:text-fuchsia-700"
          }`}
          aria-pressed={timelineCompact}
          onClick={() => {
            setTimelineCompact(value => {
              const next = !value;
              if (next) setPinnedCardsCollapsed(true);
              return next;
            });
          }}
        >
          {timelineCompact ? "상세 카드로 보기" : "한눈에 보기"}
        </button>
      </div>
      {days.map(day => (
        <div key={day} className="mb-4">
          <div className="text-xs font-semibold text-slate-400 mb-2">
            {(() => {
              const date = retreatDateForDay(periods, retreat, day);
              return `${day}일차${date ? ` · ${formatShortDate(date)}${curDay === day ? " · 오늘" : ""}` : ""}`;
            })()}
          </div>
          <div className="space-y-2">
            {listBlocks.filter(b => b.day === day).map(b => {
              const blockMoves = myMoves.get(b.id) || [];
              const now = isNowOn(b, curDay, clock.time);
              const isOpen = open.has(b.id);
              const dutyLines = dutyLinesForStaff(b, selectedStaff?.name);
              const dutyLabels = dutyLabelsForStaff(dutyLines, selectedStaff?.name);
              return (
                <div
                  key={b.id}
                  ref={b.id === initialVisibleBlockId ? timelineAnchorRef : undefined}
                  className={`card ${timelineCompact ? "p-2.5" : "p-3"} ${now ? "ring-2 ring-fuchsia-400" : ""}`}
                >
                  <div className={`flex items-start ${timelineCompact ? "gap-2" : "gap-3"}`}>
                    <div className={`shrink-0 pt-0.5 text-center ${timelineCompact ? "w-12" : "w-14"}`}>
                      <div className="font-mono text-xs text-slate-500">{timeRangeLabel(b).split("~")[0]}</div>
                      {now && <div className="text-[11px] font-bold text-fuchsia-700">지금</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      {timelineCompact ? (
                        <>
                          <div className="truncate text-sm font-semibold text-slate-800">{b.label}</div>
                          <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                            <span className="truncate">
                              {blockMoves.length ? `📍 ${blockMoves.map(move => postName(move.postId)).join(" · ")}` : "조와 함께"}
                            </span>
                            {blockMoves[0]?.round && (
                              <span className={`shrink-0 rounded px-1.5 py-0.5 ${blockMoves[0].round === "선밥" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                {blockMoves[0].round}
                              </span>
                            )}
                          </div>
                          {dutyLabels.length > 0 && (
                            <div className="mt-0.5 truncate text-xs font-medium text-fuchsia-700">
                              담당 · {dutyLabels.join(" · ")}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-slate-500 truncate">{b.label}</div>
                          {blockMoves.length ? (
                            <div className="space-y-1">
                              {blockMoves.map(move => (
                                <div key={move.id} className="font-semibold text-slate-800">
                                  📍 {postName(move.postId)}
                                  {move.round && <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${move.round === "선밥" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{move.round}</span>}
                                  {move.note && <span className="ml-2 text-xs font-normal text-fuchsia-700">• {move.note}</span>}
                                </div>
                              ))}
                            </div>
                          ) : <div className="text-sm text-slate-300">배치 없음 (조와 함께)</div>}
                          {dutyLabels.length > 0 && (
                            <div className="mt-1 rounded-lg bg-fuchsia-50 border border-fuchsia-100 px-2 py-1.5 text-xs text-fuchsia-800 whitespace-pre-line leading-relaxed">
                              담당 역할 · {dutyLabels.join(" · ")}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {!timelineCompact && (b.detail || b.owner || b.notice) && (
                      <button onClick={() => toggleOpen(b.id)} className="min-h-9 shrink-0 whitespace-nowrap rounded px-2 text-xs text-slate-500 hover:bg-fuchsia-50 hover:text-fuchsia-700">
                        {isOpen ? "접기" : "상세 ▾"}
                      </button>
                    )}
                  </div>
                  {!timelineCompact && (b.detail || b.owner || b.notice) && isOpen && (
                    <div className="mt-2 ml-14">
                      <BlockTextSummary block={b} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div ref={timelineEndRef} aria-hidden="true" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 현재시각 포스트 보드 — "그 시간에 누가 어디" (안전 핵심)
// ════════════════════════════════════════════════════════════
export function PostBoardView({ staff, schedule, posts, movements, retreat, periods }: Data) {
  const clock = useClock();
  const curDay = currentRetreatDay(periods, retreat);
  const days = useMemo(() => [...new Set(schedule.map(b => b.day))].sort((a, b) => a - b), [schedule]);
  const sorted = useMemo(() => [...schedule].sort(compareBlocks), [schedule]);

  const [day, setDay] = useState<number>(() => (curDay != null && days.includes(curDay)) ? curDay : (days[0] ?? 1));
  const userPicked = useRef(false);
  // 데이터 로드/날짜 변화 시 오늘 일자로 자동 스냅 (사용자가 직접 고르기 전까지)
  useEffect(() => {
    if (userPicked.current) return;
    if (curDay != null && days.includes(curDay)) setDay(curDay);
    else if (days.length && !days.includes(day)) setDay(days[0]);
  }, [curDay, days, day]);

  const dayBlocks = useMemo(() => sorted.filter(b => b.day === day), [sorted, day]);
  const selectedDate = retreatDateForDay(periods, retreat, day);
  const selectedDateLabel = selectedDate ? formatShortDate(selectedDate) : null;
  const [blockId, setBlockId] = useState<string>("");
  const blockPicked = useRef(false);
  // 일자가 바뀌면 자동 선택 플래그 리셋 — 새 일자에선 다시 "지금" 블록으로 자동 스냅.
  // (이 effect가 아래 자동 선택 effect보다 먼저 선언돼야 같은 day 변경에서 리셋이 선행됨)
  useEffect(() => { blockPicked.current = false; }, [day]);
  // 일자 변경/시각 경과 시 "지금" 블록(없으면 첫 블록) 자동 선택.
  // ⚠ 사용자가 드롭다운으로 직접 고른 뒤엔 유지 — 이 가드가 없으면 30초 시계 tick마다
  //   선택이 첫 블록(1일차 기도회)으로 되돌아가던 버그가 됨.
  useEffect(() => {
    if (blockPicked.current) return;
    const target = dayBlocks.find(b => isNowOn(b, curDay, clock.time)) ?? dayBlocks[0];
    setBlockId(target?.id ?? "");
  }, [day, dayBlocks, curDay, clock.time]);

  const block = sorted.find(b => b.id === blockId);
  const staffName = useMemo(() => new Map(staff.map(s => [s.id, s.name])), [staff]);
  const assignmentFor = useCallback((targetBlockId: string) => {
    const byPost = new Map<string, { name: string; round?: string }[]>();
    const assignedStaff = new Set<string>();
    movements.filter(mv => mv.blockId === targetBlockId).forEach(mv => {
      const arr = byPost.get(mv.postId) || [];
      arr.push({ name: staffName.get(mv.staffId) || "?", round: mv.round });
      byPost.set(mv.postId, arr);
      assignedStaff.add(mv.staffId);
    });
    return { byPost, idle: staff.filter(s => !assignedStaff.has(s.id)) };
  }, [movements, staff, staffName]);
  const assigned = useMemo(() => assignmentFor(blockId), [assignmentFor, blockId]);
  const todayBlocks = curDay == null ? [] : sorted.filter(b => b.day === curDay);
  const currentBlock = currentBlockFor(schedule, curDay, clock.time);
  const currentBlockId = currentBlock?.id ?? "";
  const nextBlock = currentBlock ? null : nextBlockFor(todayBlocks, clock.time);
  const currentAssigned = currentBlockId ? assignmentFor(currentBlockId) : null;
  const currentDate = curDay == null ? null : retreatDateForDay(periods, retreat, curDay);

  if (schedule.length === 0) return (
    <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">📡</div><p>스탭 전체 큐싯·동선을 먼저 입력해주세요.</p></div>
  );

  return (
    <div>
      <div className={`card p-4 mb-4 border-2 ${currentBlock ? "border-fuchsia-300 bg-fuchsia-50/50" : "border-slate-200"}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-xs font-semibold text-fuchsia-700 mb-1">현재 포스트 상황</div>
            <div className="text-lg font-bold text-slate-800">
              {currentBlock ? currentBlock.label : curDay == null ? "수련회 기간 밖입니다" : nextBlock ? "다음 일정 대기" : "오늘 일정이 종료되었습니다"}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-sm font-semibold text-slate-700">{clock.time}</div>
            <div className="text-xs text-slate-400">{currentDate ? `${curDay}일차 · ${formatShortDate(currentDate)}` : periodRangeLabel(periods, retreat)}</div>
          </div>
        </div>
        {currentBlock ? (
          <>
            <div className="text-xs text-slate-500 mb-2">{timeRangeLabel(currentBlock)}</div>
            <div className="mb-3">
              <BlockTextSummary block={currentBlock} />
            </div>
            {currentAssigned && currentAssigned.byPost.size > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {posts.filter(p => currentAssigned.byPost.has(p.id)).map(p => (
                  <div key={p.id} className="rounded-lg bg-white border border-fuchsia-100 p-3">
                    <div className="text-sm font-semibold text-slate-700 mb-1">📍 {p.area ? `[${p.area}] ` : ""}{p.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {currentAssigned.byPost.get(p.id)!.map((x, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-fuchsia-100 text-fuchsia-700">
                          {x.name}{x.round ? ` (${x.round})` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-white border border-slate-100 p-3 text-sm text-slate-500">현재 블록에 배치된 포스트가 없습니다.</div>
            )}
            {currentAssigned && currentAssigned.idle.length > 0 && (
              <div className="mt-3 text-xs text-slate-400">미배치 스탭 · {currentAssigned.idle.map(s => s.name).join(", ")}</div>
            )}
          </>
        ) : (
          <div className="text-sm text-slate-500">
            {curDay == null ? "오늘 날짜가 이 수련회 기간에 포함되지 않습니다." : nextBlock ? `${timeRangeLabel(nextBlock)} · ${nextBlock.label}` : "현재 시간 이후로 등록된 시간 블록이 없습니다."}
          </div>
        )}
      </div>
      {/* 일자 선택 */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {days.map(d => (
          <button key={d} onClick={() => { userPicked.current = true; setDay(d); }}
            className={`min-h-10 rounded-lg px-4 text-sm font-medium ${day === d ? "bg-fuchsia-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
            {(() => {
              const date = retreatDateForDay(periods, retreat, d);
              return `${d}일차${date ? ` · ${formatShortDate(date)}${curDay === d ? " · 오늘" : ""}` : ""}`;
            })()}
          </button>
        ))}
      </div>
      <div className="text-xs text-slate-400 mb-3">
        시간 블록 · {selectedDateLabel ? `${selectedDateLabel} (${day}일차)` : periodRangeLabel(periods, retreat)}
        {curDay === day ? <span className="text-fuchsia-700"> · 현재 날짜</span> : null}
      </div>
      <div className="mb-3">
        <label className="text-xs text-slate-500 block mb-1">
          시간 블록
          {curDay != null && day === curDay ? <span className="text-fuchsia-700"> · 현재 일자·시각 자동선택</span>
            : curDay == null ? <span className="text-slate-400"> · 오늘이 수련회 기간이 아니에요 — 일자를 직접 선택하세요</span> : null}
        </label>
        <select className="input" value={blockId} onChange={e => { blockPicked.current = true; setBlockId(e.target.value); }}>
          {dayBlocks.map(b => <option key={b.id} value={b.id}>{b.start} {b.label}{isNowOn(b, curDay, clock.time) ? " ← 지금" : ""}</option>)}
        </select>
      </div>
      {block && (
        <>
          {(block.detail || block.owner || block.notice) && block.id !== currentBlockId && (
            <div className="mb-4">
              <BlockTextSummary block={block} />
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 mb-4">
            {posts.filter(p => assigned.byPost.has(p.id)).map(p => (
              <div key={p.id} className="card p-3">
                <div className="text-sm font-semibold text-slate-700 mb-1">📍 {p.area ? `[${p.area}] ` : ""}{p.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {assigned.byPost.get(p.id)!.map((x, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-fuchsia-100 text-fuchsia-700">
                      {x.name}{x.round ? ` (${x.round})` : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {[...assigned.byPost.keys()].length === 0 && (
            <div className="card p-6 text-center text-slate-400 mb-4">이 시간 블록에 배치된 포스트가 없습니다.</div>
          )}
          {assigned.idle.length > 0 && (
            <div className="card p-3">
              <div className="text-xs font-semibold text-slate-400 mb-1.5">미배치 스탭 (조와 함께) · {assigned.idle.length}명</div>
              <div className="flex flex-wrap gap-1.5">
                {assigned.idle.map(s => <span key={s.id} className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">{s.name}</span>)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 조장 큐싯 — 조장이 시간대별로 해야 할 일 (모바일, 읽기 전용)
// ════════════════════════════════════════════════════════════
export function LeaderCueView({ schedule, retreat, periods }: {
  schedule: IguardScheduleBlock[];
  retreat?: Retreat;
  periods?: RetreatPeriod[];
}) {
  const clock = useClock();
  const curDay = currentRetreatDay(periods, retreat);
  const sortedSchedule = useMemo(() => [...schedule].sort(compareBlocks), [schedule]);

  if (schedule.length === 0) return (
    <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🧑‍🏫</div>
      <p>타임테이블을 먼저 입력하면<br />여기에 조장 큐싯이 자동 생성됩니다.</p></div>
  );

  const days = [...new Set(schedule.map(b => b.day))].sort((a, b) => a - b);
  const currentBlock = currentBlockFor(schedule, curDay, clock.time);
  const todayBlocks = curDay == null ? [] : sortedSchedule.filter(b => b.day === curDay);
  const nextBlock = currentBlock ? null : nextBlockFor(todayBlocks, clock.time);
  const currentDate = curDay == null ? null : retreatDateForDay(periods, retreat, curDay);

  return (
    <div>
      <div className={`card p-4 mb-4 border-2 ${currentBlock ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200"}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-xs font-semibold text-emerald-700 mb-1">조장 — 지금 할 일</div>
            <div className="text-lg font-bold text-slate-800">
              {currentBlock ? currentBlock.label : curDay == null ? "수련회 기간 밖입니다" : nextBlock ? "다음 일정 대기" : "오늘 일정이 종료되었습니다"}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-sm font-semibold text-slate-700">{clock.time}</div>
            <div className="text-xs text-slate-400">{currentDate ? `${curDay}일차 · ${formatShortDate(currentDate)}` : periodRangeLabel(periods, retreat)}</div>
          </div>
        </div>
        {currentBlock ? (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">{timeRangeLabel(currentBlock)}</div>
            {currentBlock.leaderNote
              ? <div className="rounded-lg bg-white border border-emerald-100 p-3 text-sm text-slate-700 whitespace-pre-line leading-relaxed">{currentBlock.leaderNote}</div>
              : <div className="rounded-lg bg-white border border-slate-100 p-3 text-sm text-slate-400">이 시간대 조장 안내가 없습니다. 조와 함께 움직이세요.</div>}
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            {curDay == null ? "오늘 날짜가 이 수련회 기간에 포함되지 않습니다." : nextBlock ? `${timeRangeLabel(nextBlock)} · ${nextBlock.label}` : "현재 시간 이후로 등록된 시간 블록이 없습니다."}
          </div>
        )}
      </div>
      {days.map(day => (
        <div key={day} className="mb-4">
          <div className="text-xs font-semibold text-slate-400 mb-2">
            {(() => {
              const date = retreatDateForDay(periods, retreat, day);
              return `${day}일차${date ? ` · ${formatShortDate(date)}${curDay === day ? " · 오늘" : ""}` : ""}`;
            })()}
          </div>
          <div className="space-y-2">
            {schedule.filter(b => b.day === day).map(b => {
              const now = isNowOn(b, curDay, clock.time);
              return (
                <div key={b.id} className={`card p-3 ${now ? "ring-2 ring-emerald-400" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="text-center shrink-0 w-14 pt-0.5">
                      <div className="font-mono text-xs text-slate-500">{b.start}</div>
                      {now && <div className="text-[11px] font-bold text-emerald-700">지금</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-500">{b.label}</div>
                      {b.leaderNote
                        ? <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed mt-0.5">{b.leaderNote}</div>
                        : <div className="text-sm text-slate-300 mt-0.5">조장 안내 없음 (조와 함께)</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
