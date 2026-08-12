import type { Session } from "@/features/semester/types";
import type { Milestone, Retreat } from "@/lib/types";
import type { RetreatPeriodWithOwner } from "@/lib/db";
import { retreatEntryHref, type MinistryRoles } from "./accessPolicy";

export type HomeAction = {
  id: string;
  date: string;
  title: string;
  meta: string;
  href?: string;
  urgency: "overdue" | "today" | "upcoming";
};

type BuildHomeActionsInput = {
  today: string;
  roles: MinistryRoles;
  milestones: Milestone[];
  sessions: Session[];
  semesterHref?: string;
  periods: RetreatPeriodWithOwner[];
  retreats: Retreat[];
};

function urgencyFor(date: string, today: string): HomeAction["urgency"] {
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "upcoming";
}

export function buildHomeActions(input: BuildHomeActionsInput): HomeAction[] {
  const actions: HomeAction[] = input.milestones
    .filter((item) => !item.done)
    .map((item) => ({
      id: `milestone-${item.id}`,
      date: item.targetDate,
      title: item.title,
      meta: "공유 준비 일정",
      urgency: urgencyFor(item.targetDate, input.today),
    }));

  const nextSession = input.sessions
    .filter((item) => item.date >= input.today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nextSession) {
    actions.push({
      id: `session-${nextSession.id}`,
      date: nextSession.date,
      title: nextSession.label?.trim() || `${nextSession.type} 모임`,
      meta: "다음 학기 일정",
      href: input.semesterHref,
      urgency: urgencyFor(nextSession.date, input.today),
    });
  }

  const nextPeriod = input.periods
    .filter((period) => period.endDate >= input.today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (nextPeriod) {
    const retreat = input.retreats.find((item) => item.id === nextPeriod.retreatId);
    actions.push({
      id: `period-${nextPeriod.retreatId}-${nextPeriod.id}`,
      date: nextPeriod.startDate,
      title: retreat?.name ?? "수련회",
      meta: nextPeriod.startDate <= input.today ? "현재 진행 중" : "다음 수련회",
      href: retreatEntryHref(nextPeriod.retreatId, input.roles),
      urgency: urgencyFor(nextPeriod.startDate, input.today),
    });
  }

  return actions
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "ko"))
    .slice(0, 6);
}
