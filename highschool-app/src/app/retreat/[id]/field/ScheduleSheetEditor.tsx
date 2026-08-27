"use client";

import {
  type FocusEvent,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  IguardMovement,
  IguardPost,
  IguardScheduleBlock,
  IguardSegment,
  IguardStaff,
} from "@/features/iguard/lib/types";
import { syncIguardScheduleOwner, updateIguardScheduleBlock } from "@/features/iguard/lib/db";
import {
  normalizeEnd,
  normalizeTime,
  scheduleTimeError,
  timeRangeLabel,
} from "@/features/iguard/lib/cueSheet";
import { buildScheduleAssignmentSummary } from "@/features/iguard/lib/scheduleSheet";
import { useUI } from "@/context/UIContext";
import ScheduleSegmentEditor from "./ScheduleSegmentEditor";
import ScheduleBlockEditor from "./ScheduleBlockEditor";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface SheetDraft {
  day: number;
  start: string;
  end: string;
  label: string;
  detail: string;
  owner: string;
  notice: string;
  meal: boolean;
  noMovement: boolean;
}

function draftOf(block: IguardScheduleBlock): SheetDraft {
  return {
    day: block.day,
    start: block.start,
    end: block.end || "",
    label: block.label,
    detail: block.detail || "",
    owner: block.owner || "",
    notice: block.notice || "",
    meal: !!block.meal,
    noMovement: !!block.noMovement,
  };
}

function sameDraft(a: SheetDraft, b: SheetDraft): boolean {
  return Object.keys(a).every(key => a[key as keyof SheetDraft] === b[key as keyof SheetDraft]);
}

function SheetFieldLabel({ children }: { children: string }) {
  return <div className="mb-1 text-[11px] font-semibold text-slate-400 lg:hidden">{children}</div>;
}

type AutoGrowTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & {
  value: string;
};

function AutoGrowTextarea({
  value,
  className = "",
  ...props
}: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const resizeToContent = () => {
      textarea.style.height = "auto";
      const borderHeight = textarea.offsetHeight - textarea.clientHeight;
      textarea.style.height = `${textarea.scrollHeight + borderHeight}px`;
    };

    resizeToContent();
    window.addEventListener("resize", resizeToContent);
    return () => window.removeEventListener("resize", resizeToContent);
  }, [value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      rows={1}
      value={value}
      className={`input min-h-[240px] w-full resize-none overflow-hidden px-3 py-3 !text-[11px] !leading-[1.55] lg:min-h-[300px] ${className}`}
    />
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const label = state === "dirty" ? "변경됨"
    : state === "saving" ? "저장 중"
      : state === "saved" ? "저장됨"
        : state === "error" ? "저장 오류"
          : "";
  if (!label) return null;
  return (
    <span
      role={state === "error" ? "alert" : "status"}
      className={`text-[11px] font-medium ${
        state === "error" ? "text-red-500"
          : state === "saved" ? "text-emerald-600"
            : "text-emerald-600"
      }`}
    >
      {label}
    </span>
  );
}

function ScheduleSheetRow({
  retreatId,
  block,
  schedule,
  segments,
  movements,
  staff,
  posts,
  onOpenAdvanced,
  onDelete,
}: {
  retreatId: string;
  block: IguardScheduleBlock;
  schedule: IguardScheduleBlock[];
  segments: IguardSegment[];
  movements: IguardMovement[];
  staff: IguardStaff[];
  posts: IguardPost[];
  onOpenAdvanced: () => void;
  onDelete: () => void;
}) {
  const { toast } = useUI();
  const rowRef = useRef<HTMLElement | null>(null);
  const editingRef = useRef(false);
  const committedRef = useRef<SheetDraft>(draftOf(block));
  const draftRef = useRef<SheetDraft>(draftOf(block));
  const saveRunRef = useRef(0);
  const [draft, setDraft] = useState<SheetDraft>(() => draftOf(block));
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    if (editingRef.current) return;
    const next = draftOf(block);
    committedRef.current = next;
    draftRef.current = next;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setDraft(next);
    });
    return () => { cancelled = true; };
  }, [block]);

  const assignmentLines = useMemo(
    () => buildScheduleAssignmentSummary(block.id, segments, movements, staff, posts),
    [block.id, segments, movements, staff, posts],
  );
  const movementCount = movements.filter(movement => movement.blockId === block.id).length;

  function change<K extends keyof SheetDraft>(key: K, value: SheetDraft[K]) {
    setDraft(previous => {
      const next = { ...previous, [key]: value };
      draftRef.current = next;
      setSaveState(sameDraft(next, committedRef.current) ? "idle" : "dirty");
      return next;
    });
  }

  async function save({ forceOwnerSync = false }: { forceOwnerSync?: boolean } = {}): Promise<boolean> {
    const snapshot = draftRef.current;
    const draftChanged = !sameDraft(snapshot, committedRef.current);
    if (!draftChanged && !forceOwnerSync) {
      setSaveState("idle");
      return true;
    }
    const start = normalizeTime(snapshot.start);
    const end = normalizeEnd(snapshot.end);
    const timeError = scheduleTimeError(start, end || undefined);
    if (timeError) {
      setSaveState("error");
      toast(timeError, "warning");
      return false;
    }
    if (!snapshot.label.trim()) {
      setSaveState("error");
      toast("구분을 입력해주세요.", "warning");
      return false;
    }

    const normalized: SheetDraft = {
      ...snapshot,
      start,
      end,
      label: snapshot.label.trim(),
      detail: snapshot.detail.trim(),
      owner: snapshot.owner.trim(),
      notice: snapshot.notice.trim(),
    };
    // 블록 저장 직후 실시간 구독이 committedRef를 먼저 갱신할 수 있으므로,
    // 담당 변경 여부는 await 전에 고정해야 구조화 동선 동기화를 놓치지 않는다.
    const ownerChanged = normalized.owner !== (committedRef.current.owner || "").trim();
    const run = ++saveRunRef.current;
    setSaveState("saving");
    try {
      if (draftChanged) {
        await updateIguardScheduleBlock(retreatId, block.id, {
          day: normalized.day,
          start: normalized.start,
          end: normalized.end || null,
          label: normalized.label,
          detail: normalized.detail || null,
          owner: normalized.owner || null,
          notice: normalized.notice || null,
          meal: normalized.meal || null,
          noMovement: normalized.noMovement || null,
        });
      }
      if (ownerChanged || forceOwnerSync) {
        const sync = await syncIguardScheduleOwner(
          retreatId,
          { ...block, ...normalized, end: normalized.end || undefined },
          schedule,
          staff,
          posts,
          segments,
          movements,
        );
        if (sync.unmatched.length > 0) {
          toast(`명단에서 찾지 못한 담당자: ${sync.unmatched.join(", ")}`, "warning");
        }
      }
      if (run !== saveRunRef.current) return false;
      committedRef.current = normalized;
      if (sameDraft(draftRef.current, snapshot)) {
        draftRef.current = normalized;
        setDraft(normalized);
        setSaveState("saved");
      } else {
        setSaveState("dirty");
      }
      return true;
    } catch (error) {
      if (run !== saveRunRef.current) return false;
      setSaveState("error");
      toast(`저장 오류: ${error instanceof Error ? error.message : String(error)}`, "error");
      return false;
    }
  }

  async function openAdvanced() {
    if (await save()) onOpenAdvanced();
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    const next = event.relatedTarget;
    const leavingRow = !(next instanceof Node && rowRef.current?.contains(next));
    const forceOwnerSync = (event.target as HTMLElement).dataset.scheduleOwner === "true";
    if (!leavingRow && !forceOwnerSync) return;
    if (leavingRow) editingRef.current = false;
    void save({ forceOwnerSync });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  }

  return (
    <article
      ref={rowRef}
      onFocusCapture={() => { editingRef.current = true; }}
      onBlurCapture={handleBlur}
      onKeyDownCapture={handleKeyDown}
      className="grid gap-3 border-b border-slate-200 bg-white px-3 py-4 last:border-b-0 lg:grid-cols-[150px_170px_minmax(260px,1.35fr)_minmax(250px,1.2fr)_minmax(220px,0.95fr)_104px] lg:gap-3 lg:px-4 lg:py-5"
    >
      <div>
        <SheetFieldLabel>시간</SheetFieldLabel>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <input
            aria-label={`${block.label} 시작 시간`}
            className="input min-h-12 min-w-0 px-3 py-2 font-mono text-sm"
            value={draft.start}
            onChange={event => change("start", event.target.value)}
          />
          <span className="text-xs text-slate-300">~</span>
          <input
            aria-label={`${block.label} 종료 시간`}
            className="input min-h-12 min-w-0 px-3 py-2 font-mono text-sm"
            value={draft.end}
            onChange={event => change("end", event.target.value)}
            placeholder="종료"
          />
        </div>
      </div>

      <div>
        <SheetFieldLabel>구분</SheetFieldLabel>
        <input
          aria-label={`${block.label} 구분`}
          className="input min-h-12 w-full px-3 py-2 text-sm font-semibold"
          value={draft.label}
          onChange={event => change("label", event.target.value)}
        />
        <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={draft.meal} onChange={event => change("meal", event.target.checked)} />
            식사
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={draft.noMovement} onChange={event => change("noMovement", event.target.checked)} />
            동선 없음
          </label>
        </div>
      </div>

      <div>
        <SheetFieldLabel>내용</SheetFieldLabel>
        <AutoGrowTextarea
          aria-label={`${block.label} 내용`}
          value={draft.detail}
          onChange={event => change("detail", event.target.value)}
          placeholder="분 단위 진행 내용과 준비 사항"
        />
      </div>

      <div>
        <SheetFieldLabel>담당·동선</SheetFieldLabel>
        <AutoGrowTextarea
          aria-label={`${block.label} 담당`}
          data-schedule-owner="true"
          value={draft.owner}
          onChange={event => change("owner", event.target.value)}
          placeholder={"장소: 담당자 형식으로 적으면 포스트·동선에 자동 반영됩니다.\n예) 강당 입구: 김민수, 이영희"}
        />
        <div className="mt-1.5 space-y-1">
          {assignmentLines.map(line => (
            <div key={`${line.segmentId}-${line.postId}`} className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-slate-500">
              <span className="font-semibold text-emerald-600">{line.segmentLabel}</span>
              {" · "}{line.postLabel}: {line.assignees.join(", ")}
            </div>
          ))}
          {assignmentLines.length === 0 && !draft.noMovement && (
            <div className="text-[11px] text-amber-600">구조화된 동선 배정 없음</div>
          )}
        </div>
      </div>

      <div>
        <SheetFieldLabel>특이사항</SheetFieldLabel>
        <AutoGrowTextarea
          aria-label={`${block.label} 특이사항`}
          value={draft.notice}
          onChange={event => change("notice", event.target.value)}
          placeholder="주의사항·준비물·예외"
        />
      </div>

      <div className="flex items-center justify-between gap-2 lg:flex-col lg:items-stretch lg:justify-start">
        <div className="flex min-h-5 items-center justify-end lg:justify-start">
          <SaveBadge state={saveState} />
        </div>
        <button type="button" onClick={() => { void openAdvanced(); }} className="btn-secondary min-h-10 text-xs">
          상세 설정 · {movementCount}
        </button>
        <button type="button" onClick={onDelete} className="min-h-10 rounded-md px-2 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600">
          삭제
        </button>
      </div>
    </article>
  );
}

function AdvancedDrawer({
  retreatId,
  block,
  segments,
  movements,
  staff,
  posts,
  onClose,
}: {
  retreatId: string;
  block: IguardScheduleBlock;
  segments: IguardSegment[];
  movements: IguardMovement[];
  staff: IguardStaff[];
  posts: IguardPost[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="상세 설정 닫기"
        className="absolute inset-0 h-full w-full bg-slate-950/30"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-advanced-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <div className="text-xs font-semibold text-emerald-600">{block.day}일차 · {timeRangeLabel(block.start, block.end)}</div>
            <h2 id="schedule-advanced-title" className="mt-1 text-lg font-bold text-slate-900">{block.label} 상세 설정</h2>
            <p className="mt-1 text-xs text-slate-500">구간·포스트·담당자의 세부 구조가 필요할 때만 사용합니다.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="btn-secondary min-h-10 px-3" aria-label="상세 설정 닫기">
            닫기
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <section className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 text-sm font-bold text-slate-700">시간 블록 고급 설정</h3>
            <ScheduleBlockEditor key={block.id} retreatId={retreatId} block={block} />
          </section>
          <h3 className="mb-2 text-sm font-bold text-slate-700">구간·포스트·담당자</h3>
          <ScheduleSegmentEditor
            retreatId={retreatId}
            block={block}
            allSegments={segments}
            movements={movements}
            staff={staff}
            posts={posts}
          />
        </div>
      </aside>
    </div>
  );
}

export default function ScheduleSheetEditor({
  retreatId,
  schedule,
  segments,
  movements,
  staff,
  posts,
  onDelete,
}: {
  retreatId: string;
  schedule: IguardScheduleBlock[];
  segments: IguardSegment[];
  movements: IguardMovement[];
  staff: IguardStaff[];
  posts: IguardPost[];
  onDelete: (block: IguardScheduleBlock) => void;
}) {
  const days = useMemo(() => [...new Set(schedule.map(block => block.day))].sort((a, b) => a - b), [schedule]);
  const [selectedDay, setSelectedDay] = useState<number | "all">("all");
  const [advancedBlockId, setAdvancedBlockId] = useState<string | null>(null);
  const advancedTriggerRef = useRef<HTMLElement | null>(null);
  const advancedBlock = schedule.find(block => block.id === advancedBlockId) || null;
  // 고른 일차가 사라지면(큐싯 재가져오기 등) 렌더 중 파생으로 "전체"로 되돌린다 —
  // effect에서 setState하면 cascading render가 되고, 시계 tick류 effect와 겹치면
  // 사용자 선택을 덮는 사고로 이어진다(루트 CLAUDE.md 실수 13).
  const activeDay = selectedDay !== "all" && !days.includes(selectedDay) ? "all" : selectedDay;
  const visibleDays = activeDay === "all" ? days : days.filter(day => day === activeDay);

  const openAdvanced = useCallback((blockId: string) => {
    advancedTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setAdvancedBlockId(blockId);
  }, []);

  const closeAdvanced = useCallback(() => {
    setAdvancedBlockId(null);
    requestAnimationFrame(() => advancedTriggerRef.current?.focus());
  }, []);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" aria-label="큐싯 일자 필터">
          <button
            type="button"
            onClick={() => setSelectedDay("all")}
            aria-pressed={activeDay === "all"}
            className={`min-h-10 rounded-lg border px-3 text-sm font-semibold ${
              activeDay === "all" ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            전체 {schedule.length}
          </button>
          {days.map(day => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              aria-pressed={activeDay === day}
              className={`min-h-10 rounded-lg border px-3 text-sm font-semibold ${
                activeDay === day ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              {day}일차 {schedule.filter(block => block.day === day).length}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">행을 벗어나면 자동 저장 · ⌘/Ctrl + Enter 즉시 저장</p>
      </div>

      <div className="card overflow-x-auto border-slate-200">
        {/* 강제 min-width를 두면 컨테이너보다 넓어져 특이사항 열이 잘린다.
            컬럼 minmax 최소값(합계 약 1284px)이 자연 최소폭을 정하게 둔다. */}
        <div>
          <div
            className="hidden grid-cols-[150px_170px_minmax(260px,1.35fr)_minmax(250px,1.2fr)_minmax(220px,0.95fr)_104px] gap-3 border-b border-slate-300 bg-slate-900 px-4 py-3 text-xs font-semibold text-white lg:grid"
          >
            <div>시간</div>
            <div>구분</div>
            <div>내용</div>
            <div>담당·동선</div>
            <div>특이사항</div>
            <div>상태</div>
          </div>
          {visibleDays.map(day => (
            <section key={day}>
              <div
                className="border-b border-slate-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800"
              >
                {day}일차
              </div>
              {schedule.filter(block => block.day === day).map(block => (
                <ScheduleSheetRow
                  key={block.id}
                  retreatId={retreatId}
                  block={block}
                  schedule={schedule}
                  segments={segments}
                  movements={movements}
                  staff={staff}
                  posts={posts}
                  onOpenAdvanced={() => openAdvanced(block.id)}
                  onDelete={() => onDelete(block)}
                />
              ))}
            </section>
          ))}
        </div>
      </div>

      {advancedBlock && (
        <AdvancedDrawer
          retreatId={retreatId}
          block={advancedBlock}
          segments={segments}
          movements={movements}
          staff={staff}
          posts={posts}
          onClose={closeAdvanced}
        />
      )}
    </>
  );
}
