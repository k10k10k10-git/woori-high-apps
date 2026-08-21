"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type SharedCalendarItem = {
  id: string;
  date: string;
  endDate?: string;
  title: string;
  kind: "semester" | "sunday" | "retreat" | "field";
  href?: string;
  done?: boolean;
  /** prepMilestones에서 온 일정만 이 화면에서 수정·삭제한다. */
  editable?: boolean;
};

const KIND_LABEL: Record<SharedCalendarItem["kind"], string> = {
  semester: "훈련·사역팀",
  sunday: "주일 사역",
  retreat: "수련회 행정",
  field: "수련회 이가드",
};

export const CALENDAR_KIND_STYLE: Record<SharedCalendarItem["kind"], { chip: string; detail: string; dot: string }> = {
  semester: { chip: "bg-blue-100 text-blue-800", detail: "text-blue-300", dot: "bg-blue-500" },
  sunday: { chip: "bg-amber-100 text-amber-800", detail: "text-amber-300", dot: "bg-amber-500" },
  retreat: { chip: "bg-emerald-100 text-emerald-800", detail: "text-emerald-300", dot: "bg-emerald-500" },
  field: { chip: "bg-slate-100 text-slate-700", detail: "text-slate-300", dot: "bg-slate-400" },
};

export function calendarKindForSourceSite(sourceSite?: string): SharedCalendarItem["kind"] {
  if (sourceSite?.startsWith("sunday-")) return "sunday";
  if (sourceSite === "move-guide" || sourceSite?.startsWith("iguard")) return "field";
  return "retreat";
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function calendarItemsForDate(items: SharedCalendarItem[], date: string) {
  return items.filter((item) => item.date <= date && date <= (item.endDate ?? item.date));
}

export default function SharedMinistryCalendar({
  items,
  canEdit = false,
  onAdd,
  onEdit,
  onDelete,
}: {
  items: SharedCalendarItem[];
  canEdit?: boolean;
  onAdd?: (date: string) => void;
  onEdit?: (item: SharedCalendarItem) => void;
  onDelete?: (item: SharedCalendarItem) => void;
}) {
  const today = new Date();
  const initial = items.find((item) => item.date >= ymd(today.getFullYear(), today.getMonth(), today.getDate()))?.date;
  const initialDate = initial ? new Date(`${initial}T00:00:00`) : today;
  const [cursor, setCursor] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => initial ?? ymd(today.getFullYear(), today.getMonth(), today.getDate()));

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: first }, () => null),
      ...Array.from({ length: count }, (_, index) => index + 1),
    ];
  }, [cursor]);

  const selectedItems = calendarItemsForDate(items, selectedDate);

  return (
    <section className="calendar-shell surface-panel p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">공유 사역 캘린더</h2>
          <p className="mt-0.5 text-xs text-slate-400">학기 모임과 수련회 일정을 한 달력에서 함께 확인합니다.</p>
        </div>
        <div className="flex items-center gap-1">
          <button aria-label="이전 달" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="rounded-lg px-2.5 py-2 text-slate-500 hover:bg-slate-100">‹</button>
          <strong className="min-w-24 text-center text-sm">{cursor.getFullYear()}년 {cursor.getMonth() + 1}월</strong>
          <button aria-label="다음 달" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="rounded-lg px-2.5 py-2 text-slate-500 hover:bg-slate-100">›</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(250px,0.75fr)]">
        <div className="calendar-grid overflow-hidden rounded-2xl">
          <div className="grid grid-cols-7 bg-slate-50 text-center text-[11px] font-semibold text-slate-400">
            {WEEKDAYS.map((day) => <div key={day} className="py-2">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="min-h-20 border-t border-slate-100 bg-slate-50/40 sm:min-h-24" />;
              const date = ymd(cursor.getFullYear(), cursor.getMonth(), day);
              const dayItems = calendarItemsForDate(items, date);
              const selected = selectedDate === date;
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`calendar-day min-h-20 border-t border-slate-100 p-1.5 text-left align-top transition sm:min-h-24 sm:p-2 ${selected ? "calendar-selected" : ""}`}
                >
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${date === ymd(today.getFullYear(), today.getMonth(), today.getDate()) ? "calendar-today text-white" : "text-slate-600"}`}>{day}</span>
                  <span className="mt-1 grid gap-1">
                    {dayItems.slice(0, 2).map((item) => <span key={item.id} className={`truncate rounded px-1.5 py-1 text-[10px] font-medium ${CALENDAR_KIND_STYLE[item.kind].chip}`}>{item.title}</span>)}
                    {dayItems.length > 2 && <span className="px-1 text-[10px] text-slate-400">+{dayItems.length - 2}개</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="calendar-detail-panel rounded-2xl p-4 text-white lg:min-h-full sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-[var(--color-on-dark-accent)]">{selectedDate.replaceAll("-", ".")}</p>
              <h3 className="mt-1 text-base font-bold">전체 일정</h3>
            </div>
            {canEdit && onAdd && (
              <button
                onClick={() => onAdd(selectedDate)}
                className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold transition hover:bg-white/20"
              >
                + 일정 추가
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-2">
            {selectedItems.map((item) => {
              const body = (
                <>
                  <span className={`text-[10px] font-bold ${CALENDAR_KIND_STYLE[item.kind].detail}`}>
                    {KIND_LABEL[item.kind]}
                  </span>
                  <p className={`mt-1 text-sm font-semibold leading-snug ${item.done ? "text-slate-400 line-through" : ""}`}>{item.title}</p>
                </>
              );
              if (item.editable) {
                return (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    {body}
                    {canEdit && (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => onEdit?.(item)} className="text-[11px] text-sky-200 underline-offset-2 hover:underline">수정</button>
                        <button onClick={() => onDelete?.(item)} className="text-[11px] text-red-300 underline-offset-2 hover:underline">삭제</button>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <Link key={item.id} href={item.href ?? "#"} className="rounded-xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10">
                  {body}
                </Link>
              );
            })}
            {selectedItems.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/15 px-3 py-8 text-center text-xs text-slate-400">
                등록된 일정이 없습니다.{canEdit && onAdd ? " 위 ‘일정 추가’로 만들 수 있어요." : ""}
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
