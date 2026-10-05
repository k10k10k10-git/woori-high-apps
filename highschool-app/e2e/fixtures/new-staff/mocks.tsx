import { useSyncExternalStore, type AnchorHTMLAttributes } from "react";
import type { MinistryRoles } from "@/features/portal/accessPolicy";
import type { TeamMemberships } from "@/features/teams/teamModel";

type QaAuth = {
  user: { uid: string; email: string; displayName: string } | null;
  roles: MinistryRoles;
  teamMemberships: TeamMemberships;
  loading: boolean;
  roleError: boolean;
  canSearchOfficialRoster: boolean;
  memberName: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  retryRoles: () => void;
};

const callbacks = new Set<() => void>();
const params = new URLSearchParams(window.location.search);
const qaTeam = params.get("team") === "media" ? "media" : "praise";
export const qa = { writes: [] as unknown[], retries: 0, signInCalls: 0, navigation: [] as string[], prefetches: [] as string[], subscriptions: [] as string[], childMounts: 0 };
let auth: QaAuth;

export function setQaAuth(state: string, uid = "synthetic-staff-a") {
  auth = {
    user: state === "guest" || state === "loginError" ? null : { uid, email: `${uid}@example.invalid`, displayName: "합성 스탭" },
    roles: { semester: state === "unapproved" || state === "roleError" ? "none" : "staff", retreat: "none" },
    teamMemberships: state === "unassigned" || state === "unapproved" || state === "roleError"
      ? {} : { [qaTeam]: { active: true, role: state === "viewer" ? "viewer" : "staff" } },
    loading: state === "loading",
    roleError: state === "roleError" || state === "roleErrorAssigned",
    canSearchOfficialRoster: false,
    memberName: "합성 스탭",
    signIn: async () => {
      qa.signInCalls += 1;
      if (qa.signInCalls === 1 && state === "loginError") throw Object.assign(new Error("Synthetic Firebase diagnostic details must not be displayed"), { code: "auth/unauthorized-domain" });
      setQaAuth("ready", uid);
    },
    signOut: async () => { setQaAuth("guest"); },
    retryRoles: () => { qa.retries += 1; setQaAuth("ready", uid); },
  };
  callbacks.forEach((callback) => callback());
}

setQaAuth(params.get("state") ?? "ready");
export function useAuth() {
  return useSyncExternalStore((callback) => { callbacks.add(callback); return () => { callbacks.delete(callback); }; }, () => auth);
}

export default function Link({ href, prefetch, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; prefetch?: boolean | null }) {
  return <a href={href} {...props} data-qa-prefetch={prefetch === false ? "disabled" : "default"} />;
}

export function useRouter() { return { replace: (href: string) => { qa.navigation.push(href); }, push: (href: string) => { qa.navigation.push(href); }, prefetch: (href: string) => { qa.prefetches.push(href); }, back: () => { window.history.back(); }, refresh: () => {} }; }
export function usePathname() { return window.location.pathname; }
export function useSearchParams() { return new URLSearchParams(window.location.search); }

export function subscribeSemesters(callback: (items: unknown[]) => void) {
  qa.subscriptions.push("semesters");
  const term = params.get("term");
  const dates = term === "past" ? { startDate: "2026-01-01", endDate: "2026-03-01" }
    : term === "upcoming" ? { startDate: "2027-01-01", endDate: "2027-03-01" }
      : { startDate: "2026-08-29", endDate: "2026-11-21" };
  callback([{ id: "2026-2", meta: { title: "합성 2026년 2학기", ...dates, createdAt: "2026-08-01", completionRule: { minRate: 0.7 } } }]);
  return () => {};
}
export function subscribeTeams(_id: string, callback: (items: unknown[]) => void) {
  qa.subscriptions.push("teams");
  callback([{ id: "praise-semester-team", teamKey: "praise", name: "찬양팀", color: "bg-green-100", order: 1, room: "합성 연습실", goal: "합성 팀 목표" }, { id: "media-semester-team", teamKey: "media", name: "미디어팀", color: "bg-blue-100", order: 2 }]);
  return () => {};
}
export function subscribeApplications(_id: string, callback: (items: unknown[]) => void) {
  qa.subscriptions.push("applications");
  const common = { status: "배치", teamId: `${qaTeam}-semester-team`, createdAt: "2026-08-01" };
  callback([
    { ...common, id: "1_student-1", studentId: "student-1", bu: "1부", grade: 1, class: 1, name: "합성학생가", trainingClassId: "training-1" },
    { ...common, id: "1_student-2", studentId: "student-2", bu: "1부", grade: 1, class: 1, name: "합성학생나", trainingClassId: "training-1" },
    { ...common, id: "sf_staff-1", studentId: "sf_staff-1", bu: "스탭", grade: 0, class: 0, name: "합성스탭가" },
  ]);
  return () => {};
}
export function subscribeSessions(_id: string, callback: (items: unknown[]) => void) {
  qa.subscriptions.push("sessions");
  const term = params.get("term");
  const date = term === "past" ? "2026-02-07" : term === "upcoming" ? "2027-01-02" : "2026-10-10";
  callback([{ id: "meeting-1", date, type: "정규", label: "합성 정규 모임" }, { id: "holiday-1", date: "2026-10-06", type: "휴강", label: "합성 휴강" }]);
  return () => {};
}

export function subscribePeopleSearchData() {
  qa.subscriptions.push("peopleSearch");
  return () => {};
}
