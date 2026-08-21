import type { SharedCalendarItem } from "./SharedMinistryCalendar";

export type HomeAction = {
  id: string;
  date: string;
  title: string;
  meta: string;
  kind: SharedCalendarItem["kind"];
  href?: string;
  urgency: "overdue" | "today" | "upcoming";
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
      };
    })
    .sort((a, b) => priority[a.urgency] - priority[b.urgency] || a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "ko"))
    .slice(0, limit);
}
