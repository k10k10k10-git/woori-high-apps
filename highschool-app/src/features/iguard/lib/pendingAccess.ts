export interface IguardPendingReq {
  uid: string;
  email: string;
  name: string;
  requestedAt: number;
}
/** 같은 사용자 노드의 siteRequests는 팀원 승인 요청으로 해석하지 않는다. */
export function normalizeIguardPendingRequests(raw: unknown): IguardPendingReq[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, unknown>)
    .flatMap(([uid, value]) => {
      if (!value || typeof value !== "object") return [];
      const item = value as { email?: unknown; name?: unknown; requestedAt?: unknown };
      if (typeof item.email !== "string" || typeof item.requestedAt !== "number") return [];
      return [{
        uid,
        email: item.email,
        name: typeof item.name === "string" ? item.name : "",
        requestedAt: item.requestedAt,
      }];
    })
    .sort((a, b) => a.requestedAt - b.requestedAt);
}
