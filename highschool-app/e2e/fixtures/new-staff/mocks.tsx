import { useSyncExternalStore, type AnchorHTMLAttributes } from "react";
import type { MinistryRoles } from "@/features/portal/accessPolicy";
import type { TeamMemberships } from "@/features/teams/teamModel";
import { connect, qa } from "./qaState";
export { qa } from "./qaState";

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
let auth: QaAuth;

export function setQaAuth(state: string, uid = "synthetic-staff-a") {
  auth = {
    user: state === "guest" || state === "loginError" ? null : { uid, email: `${uid}@example.invalid`, displayName: "합성 스탭" },
    roles: state === "admin" ? { semester: "superAdmin", retreat: "superAdmin" }
      : state === "programEditor" ? { semester: "staff", retreat: "adminTeam" }
        : state === "programViewer" ? { semester: "staff", retreat: "leader" }
          : { semester: state === "unapproved" || state === "roleError" ? "none" : "staff", retreat: "none" },
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

// React capture에서 실제 모달이 닫히면 Link의 React bubble은 실행되지 않을 수 있다.
// source handler 뒤 native bubble에서만 일반 이동을 기록하고, 실제 수정 클릭은 보존한다.
document.addEventListener("click", (event) => {
  if (!qa.recordLinkNavigation || event.defaultPrevented || event.button !== 0
    || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('a[data-qa-link="true"][href]');
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const href = link.getAttribute("href");
  if (!href || new URL(href, window.location.href).origin !== window.location.origin) return;
  event.preventDefault();
  qa.navigation.push(href);
});

export default function Link({ href, prefetch, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; prefetch?: boolean | null }) {
  return <a href={href} {...props} data-qa-link="true" data-qa-prefetch={prefetch === false ? "disabled" : "default"} />;
}

const router = { replace: (href: string) => { qa.navigation.push(href); }, push: (href: string) => { qa.navigation.push(href); }, prefetch: (href: string) => { qa.prefetches.push(href); }, back: () => { window.history.back(); }, refresh: () => {} };
const urlListeners = new Set<() => void>();
const notifyUrl = () => urlListeners.forEach((listener) => listener());
for (const method of ["pushState", "replaceState"] as const) {
  const original = window.history[method].bind(window.history);
  window.history[method] = (data: unknown, unused: string, url?: string | URL | null) => { original(data, unused, url); notifyUrl(); };
}
window.addEventListener("popstate", notifyUrl);
function useUrl() { return useSyncExternalStore((listener) => { urlListeners.add(listener); return () => { urlListeners.delete(listener); }; }, () => window.location.href); }
export function useRouter() { return router; }
export function usePathname() { return new URL(useUrl()).pathname; }
export function useSearchParams() { return new URL(useUrl()).searchParams; }
export function useParams() {
  const url = new URL(useUrl());
  return { id: /^\/(?:events|retreat)\/([^/]+)/.exec(url.pathname)?.[1] ?? "synthetic-retreat" };
}

export function subscribeSemesters(callback: (items: unknown[]) => void, fail?: (error: Error) => void) {
  const term = params.get("term");
  const dates = term === "past" ? { startDate: "2026-01-01", endDate: "2026-03-01" }
    : term === "upcoming" ? { startDate: "2027-01-01", endDate: "2027-03-01" }
      : { startDate: "2026-08-29", endDate: "2026-11-21" };
  const current = { id: "2026-2", meta: { title: "합성 2026년 2학기", ...dates, createdAt: "2026-08-01", completionRule: { minRate: 0.7 } } };
  const list = params.get("terms") === "multi" ? [
    { id: "2026-1", meta: { ...current.meta, title: "합성 2026년 1학기", startDate: "2026-01-01", endDate: "2026-06-30" } },
    current,
    { id: "2027-1", meta: { ...current.meta, title: "합성 2027년 1학기", startDate: "2027-01-01", endDate: "2027-06-30" } },
  ] : [current];
  return connect("semesters", "", callback, list, fail);
}
export function subscribeTeams(id: string, callback: (items: unknown[]) => void, fail?: (error: Error) => void) {
  return connect("teams", id, callback, [{ id: "praise-semester-team", teamKey: "praise", name: "찬양팀", color: "bg-green-100", order: 1, room: "합성 연습실", goal: "합성 팀 목표" }, { id: "media-semester-team", teamKey: "media", name: "미디어팀", color: "bg-blue-100", order: 2 }], fail);
}
export function subscribeApplications(id: string, callback: (items: unknown[]) => void, fail?: (error: Error) => void) {
  const common = { status: "배치", teamId: `${qaTeam}-semester-team`, createdAt: "2026-08-01" };
  return connect("applications", id, callback, [
    { ...common, id: "1_student-1", studentId: "student-1", bu: "1부", grade: 1, class: 1, name: "합성학생가", trainingClassId: "training-1" },
    { ...common, id: "1_student-2", studentId: "student-2", bu: "1부", grade: 1, class: 1, name: "합성학생나", trainingClassId: "training-1" },
    { ...common, id: "sf_staff-1", studentId: "sf_staff-1", bu: "스탭", grade: 0, class: 0, name: "합성스탭가" },
  ], fail);
}
export function subscribeSessions(id: string, callback: (items: unknown[]) => void, fail?: (error: Error) => void) {
  const term = params.get("term");
  const date = term === "past" || id === "2026-1" ? "2026-02-07" : term === "upcoming" || id === "2027-1" ? "2027-01-02" : "2026-10-10";
  return connect("sessions", id, callback, [{ id: "meeting-1", date, type: "정규", label: "합성 정규 모임" }, { id: "holiday-1", date: "2026-10-06", type: "휴강", label: "합성 휴강" }], fail);
}
export function subscribeTrainingClasses(id: string, callback: (items: unknown[]) => void, fail?: (error: Error) => void) { return connect("trainingClasses", id, callback, [], fail); }
export function subscribeAllAttendance(id: string, _kind: string, callback: (items: Record<string, unknown>) => void, fail?: (error: Error) => void) { return connect("allAttendance", id, callback, {}, fail); }

export function subscribePeopleSearchData() {
  qa.subscriptions.push("peopleSearch");
  return () => {};
}
