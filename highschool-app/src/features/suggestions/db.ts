import { get, onValue, push, ref, remove, set, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import {
  normalizeSiteRequest,
  normalizeSiteRequestsRoot,
  unnotifiedResolvedRequests,
  type NewSiteRequest,
  type SiteRequest,
} from "./siteRequest";

export async function createSiteRequest(request: NewSiteRequest): Promise<string> {
  const target = push(ref(db, paths.siteRequests(request.ownerUid)));
  if (!target.key) throw new Error("요청 번호를 만들지 못했습니다.");
  await set(target, { ...request, status: "received" });
  return target.key;
}

/** 통합관리자 전용: 모든 사용자 요청을 메일함처럼 실시간 구독한다. */
export function subscribeToAdminSiteRequests(
  callback: (requests: SiteRequest[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onValue(
    ref(db, paths.iguardPending()),
    (snapshot) => callback(normalizeSiteRequestsRoot(snapshot.exists() ? snapshot.val() : null)),
    (error) => onError?.(error),
  );
}

/** 로그인 직후 한 번만 읽어 아직 전달하지 않은 해결 알림을 찾는다. */
export async function getMyUnnotifiedResolvedRequests(uid: string): Promise<SiteRequest[]> {
  const snapshot = await get(ref(db, paths.siteRequests(uid)));
  if (!snapshot.exists()) return [];
  const requests = Object.entries(snapshot.val() as Record<string, unknown>)
    .map(([id, value]) => normalizeSiteRequest(uid, id, value))
    .filter((request): request is SiteRequest => request != null);
  return unnotifiedResolvedRequests(requests).sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0));
}

export async function resolveSiteRequest(
  ownerUid: string,
  requestId: string,
  resolvedBy: string,
  resolutionNote: string,
): Promise<void> {
  await update(ref(db, paths.siteRequest(ownerUid, requestId)), {
    status: "resolved",
    resolvedAt: Date.now(),
    resolvedBy,
    resolutionNote: resolutionNote.trim() || null,
    notifiedAt: null,
  });
}

/** 통합관리자 전용: 다른 사용자 정보는 유지하고 선택한 요청 한 건만 삭제한다. */
export async function deleteSiteRequest(ownerUid: string, requestId: string): Promise<void> {
  await remove(ref(db, paths.siteRequest(ownerUid, requestId)));
}

export async function markSiteRequestNotified(ownerUid: string, requestId: string): Promise<void> {
  await update(ref(db, paths.siteRequest(ownerUid, requestId)), { notifiedAt: Date.now() });
}
