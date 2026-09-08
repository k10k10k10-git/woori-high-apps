import type { PraiseMeeting, PraiseMeta } from "./types";

/** 원장 배치 화면과 찬양 업무를 같은 팀·회차로 왕복한다. 외부 return URL을 받지 않는다. */
export function praiseSemesterHref(meta: PraiseMeta, meeting?: PraiseMeeting | null): string | null {
  if (!meta.semesterId || !meta.teamId) return null;
  const query = new URLSearchParams({ tab: "배치", team: meta.teamId, praiseWorkspace: meta.id });
  if (meeting) query.set("praiseMeeting", meeting.id);
  return `/semester/${encodeURIComponent(meta.semesterId)}?${query}`;
}

export function praiseReturnHref(query: URLSearchParams): string | null {
  const workspace = query.get("praiseWorkspace");
  if (!workspace || !/^[A-Za-z0-9_-]{1,160}$/.test(workspace)) return null;
  const params = new URLSearchParams({ workspace, tab: "week" });
  const meeting = query.get("praiseMeeting");
  if (meeting && /^[A-Za-z0-9_-]{1,160}$/.test(meeting)) params.set("meeting", meeting);
  return `/sunday-ministry/praise?${params}`;
}
