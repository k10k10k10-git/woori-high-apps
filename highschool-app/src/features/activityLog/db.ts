import { endAt, endBefore, get, limitToFirst, limitToLast, onValue, orderByChild, query, ref, startAt } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { snapToList } from "@/lib/db/snapToList";
import { activityRangeBounds, parseActivityLogRecord } from "./model";
import type { ActivityLogCursor, ActivityLogPage, ActivityLogRange, ActivityLogStatus } from "./types";

export const ACTIVITY_LOG_PAGE_SIZE = 100;
const accessError = () => new Error("통합관리자 권한을 확인할 수 없습니다. 다시 로그인해 주세요.");

async function requireCurrentAdmin(): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw accessError();
  const permission = await get(ref(db, paths.admins(uid)));
  if (auth.currentUser?.uid !== uid || permission.val() !== true) throw accessError();
  return uid;
}

export async function loadActivityLogPage(range: ActivityLogRange, cursor?: ActivityLogCursor): Promise<ActivityLogPage> {
  const { from, to } = activityRangeBounds(range);
  if (cursor && (!Number.isFinite(cursor.occurredAt) || cursor.occurredAt < from || cursor.occurredAt > to
    || !/^[A-Za-z0-9_-]{1,160}$/.test(cursor.id))) throw new Error("조회 위치가 올바르지 않습니다. 새로고침해 주세요.");
  const uid = await requireCurrentAdmin();
  const snapshot = await get(query(ref(db, paths.activityLogEvents()), orderByChild("occurredAt"),
    startAt(from), cursor ? endBefore(cursor.occurredAt, cursor.id) : endAt(to), limitToLast(ACTIVITY_LOG_PAGE_SIZE + 1)));
  if (auth.currentUser?.uid !== uid) throw accessError();
  const invalidRecordError = () => new Error("읽을 수 없는 형식의 활동 기록이 있습니다. 관리자에게 확인해 주세요.");
  const rootValue = snapshot.val();
  if (snapshot.exists() && (!rootValue || typeof rootValue !== "object" || Array.isArray(rootValue))) throw invalidRecordError();
  // 공용 변환기가 거르는 손상된 자식도 감사 화면에서는 누락 사실을 알린다.
  snapshot.forEach((child) => {
    const value = child.val();
    if (!value || typeof value !== "object" || Array.isArray(value)
      || (value.id !== undefined && value.id !== child.key)) throw invalidRecordError();
  });
  const raw = snapToList<{ id: string }>(snapshot);
  const rows = raw.map(parseActivityLogRecord);
  // 손상된 기록을 조용히 제외하면 빠진 이력을 정상 조회로 오인한다.
  if (rows.some((row) => !row)) throw invalidRecordError();
  const sorted = rows.filter((row) => row !== null).sort((a, b) =>
    b.occurredAt - a.occurredAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const records = sorted.slice(0, ACTIVITY_LOG_PAGE_SIZE);
  const last = records.at(-1);
  return { records, nextCursor: sorted.length > ACTIVITY_LOG_PAGE_SIZE && last ? { occurredAt: last.occurredAt, id: last.id } : null };
}

/** 첫/마지막 저장 기록만 구독한다. 별도 상태 노드 쓰기나 전체 이력 다운로드는 없다. */
export function subscribeActivityLogStatus(onData: (status: ActivityLogStatus | null) => void, onError: (error: Error) => void): () => void {
  const uid = auth.currentUser?.uid;
  let active = true;
  const fail = (error: Error) => { if (active) onError(error); };
  if (!uid) {
    queueMicrotask(() => fail(accessError()));
    return () => { active = false; };
  }
  const times: { first?: number | null; last?: number | null } = {};
  const watch = (key: "first" | "last") => onValue(query(ref(db, paths.activityLogEvents()), orderByChild("occurredAt"),
    key === "first" ? limitToFirst(1) : limitToLast(1)), (snapshot) => {
    if (!active) return;
    if (auth.currentUser?.uid !== uid) { fail(accessError()); return; }
    const records = snapToList<{ id: string }>(snapshot).map(parseActivityLogRecord);
    if (records.some((record) => !record) || (snapshot.exists() && records.length !== 1)) {
      fail(new Error("로그 저장 시각을 확인할 수 없습니다."));
      return;
    }
    times[key] = records[0]?.occurredAt ?? null;
    if (times.first === undefined || times.last === undefined) return;
    if (times.first === null && times.last === null) { onData(null); return; }
    // 두 구독의 첫 이벤트 도착 순서 차이는 다음 이벤트까지 기다린다.
    if (times.first === null || times.last === null || times.last < times.first) return;
    onData({ startedAt: times.first, lastRecordedAt: times.last });
  }, fail);
  const unsubscribeFirst = watch("first");
  const unsubscribeLast = watch("last");
  return () => { active = false; unsubscribeFirst(); unsubscribeLast(); };
}
