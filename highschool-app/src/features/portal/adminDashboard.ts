import type { IguardPendingReq } from "@/features/iguard/lib/pendingAccess";
import type { SiteRequest } from "@/features/suggestions/siteRequest";

export type AdminPendingRequests = Record<string, {
  email: string;
  name: string;
  requestedAt: number;
}>;

export interface AccessQueueItem {
  uid: string;
  email: string;
  name: string;
  requestedAt: number;
  sources: Array<"학기·수련회" | "이가드 현장">;
}

export interface AdminWorkItem {
  id: string;
  destination: "team" | "requests";
  title: string;
  description: string;
  timestamp: number;
  priority: "urgent" | "normal";
  kind: "access" | "request";
}

export interface AdminDashboardSummary {
  totalPending: number;
  openRequests: number;
  accessPending: number;
  teamMembers: number;
  resolvedToday: number;
}

export function mergeAccessQueue(
  adminPending: AdminPendingRequests,
  iguardPending: IguardPendingReq[],
): AccessQueueItem[] {
  const byUid = new Map<string, AccessQueueItem>();

  for (const [uid, request] of Object.entries(adminPending)) {
    byUid.set(uid, {
      uid,
      email: request.email,
      name: request.name,
      requestedAt: request.requestedAt,
      sources: ["학기·수련회"],
    });
  }

  for (const request of iguardPending) {
    const current = byUid.get(request.uid);
    if (current) {
      current.email ||= request.email;
      current.name ||= request.name;
      current.requestedAt = Math.min(current.requestedAt, request.requestedAt);
      current.sources.push("이가드 현장");
      continue;
    }
    byUid.set(request.uid, {
      uid: request.uid,
      email: request.email,
      name: request.name,
      requestedAt: request.requestedAt,
      sources: ["이가드 현장"],
    });
  }

  return [...byUid.values()].sort((a, b) => a.requestedAt - b.requestedAt);
}

export function countUniqueTeamMembers(
  mainAdmins: Record<string, boolean>,
  retreatAdmins: Record<string, unknown>,
  iguardMembers: Record<string, unknown>,
): number {
  return new Set([
    ...Object.entries(mainAdmins).filter(([, enabled]) => enabled).map(([uid]) => uid),
    ...Object.keys(retreatAdmins),
    ...Object.keys(iguardMembers),
  ]).size;
}

function isSameLocalDate(timestamp: number, reference: Date): boolean {
  const value = new Date(timestamp);
  return value.getFullYear() === reference.getFullYear()
    && value.getMonth() === reference.getMonth()
    && value.getDate() === reference.getDate();
}

export function buildAdminDashboardSummary({
  requests,
  accessQueue,
  teamMembers,
  now = new Date(),
}: {
  requests: SiteRequest[];
  accessQueue: AccessQueueItem[];
  teamMembers: number;
  now?: Date;
}): AdminDashboardSummary {
  const openRequests = requests.filter((request) => request.status === "received").length;
  const resolvedToday = requests.filter((request) => (
    request.status === "resolved"
    && request.resolvedAt != null
    && isSameLocalDate(request.resolvedAt, now)
  )).length;
  return {
    totalPending: openRequests + accessQueue.length,
    openRequests,
    accessPending: accessQueue.length,
    teamMembers,
    resolvedToday,
  };
}

function urgent(urgency: string): boolean {
  return urgency.includes("긴급") || urgency.includes("높");
}

export function buildAdminWorkQueue(
  requests: SiteRequest[],
  accessQueue: AccessQueueItem[],
): AdminWorkItem[] {
  const requestItems: AdminWorkItem[] = requests
    .filter((request) => request.status === "received")
    .map((request) => ({
      id: `request:${request.ownerUid}:${request.id}`,
      destination: "requests",
      title: request.title,
      description: `${request.category} · ${request.anonymous ? "익명" : request.reporterName || "작성자 미확인"}`,
      timestamp: request.createdAt,
      priority: urgent(request.urgency) ? "urgent" : "normal",
      kind: "request",
    }));

  const accessItems: AdminWorkItem[] = accessQueue.map((request) => ({
    id: `access:${request.uid}`,
    destination: "team",
    title: request.name || request.email || "이름 미설정",
    description: `${request.sources.join(" · ")} 권한 승인`,
    timestamp: request.requestedAt,
    priority: "normal",
    kind: "access",
  }));

  return [...requestItems, ...accessItems].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
    return a.timestamp - b.timestamp;
  });
}

export function recentResolvedRequests(requests: SiteRequest[], limit = 4): SiteRequest[] {
  return requests
    .filter((request) => request.status === "resolved" && request.resolvedAt != null)
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
    .slice(0, limit);
}
