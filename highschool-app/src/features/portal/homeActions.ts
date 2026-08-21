import type { SharedCalendarItem } from "./SharedMinistryCalendar";

export type HomeAction = {
  id: string;
  date: string;
  title: string;
  meta: string;
  kind: SharedCalendarItem["kind"];
  href?: string;
  urgency: "overdue" | "today" | "upcoming";
  dayLabel: string;
};

const KIND_META: Record<SharedCalendarItem["kind"], string> = {
  semester: "훈련·사역팀",
  sunday: "주일 사역",
  retreat: "수련회 행정",
  field: "수련회 이가드",
};

function urgencyFor(item: SharedCalendarItem, today: string): HomeAction["urgency"] {
  if (item.date <= today && today <= (item.endDate ?? item.date)) return "today";
  if (item.date < today) return "overdue";
  return "upcoming";
}

function utcDay(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** 캘린더 날짜를 오늘 기준의 짧은 디데이로 바꾼다. 다일 일정은 진행 중인 모든 날이 D-Day다. */
export function homeActionDayLabel(item: Pick<SharedCalendarItem, "date" | "endDate">, today: string): string {
  if (item.date <= today && today <= (item.endDate ?? item.date)) return "D-Day";
  if (today < item.date) return `D-${utcDay(item.date) - utcDay(today)}`;
  return `D+${utcDay(today) - utcDay(item.endDate ?? item.date)}`;
}

/** 홈 할 일은 공유 사역 캘린더와 같은 항목을 그대로 쓴다. 과거 일정은 미완료 공유 준비만 남긴다. */
export function buildHomeActions(items: SharedCalendarItem[], today: string, limit = 6): HomeAction[] {
  const priority: Record<HomeAction["urgency"], number> = { overdue: 0, today: 1, upcoming: 2 };
  return items
    .filter((item) => !item.done && ((item.endDate ?? item.date) >= today || item.editable))
    .map((item) => {
      const urgency = urgencyFor(item, today);
      return {
        id: item.id,
        date: item.date,
        title: item.title,
        meta: urgency === "overdue" ? `${KIND_META[item.kind]} · 기한 지남` : KIND_META[item.kind],
        kind: item.kind,
        href: item.href,
        urgency,
        dayLabel: homeActionDayLabel(item, today),
      };
    })
    .sort((a, b) => priority[a.urgency] - priority[b.urgency] || a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "ko"))
    .slice(0, limit);
}
