import { ACTIVITY_AREAS, type ActivityChange, type ActivityLogRange, type ActivityLogRecord } from "./types";

const DAY = 86_400_000;
const KST_OFFSET = 9 * 60 * 60 * 1_000;
const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
  && !Number.isNaN(new Date(value).getTime());

export function defaultActivityLogRange(now = Date.now()): ActivityLogRange {
  const to = new Date(now + KST_OFFSET).toISOString().slice(0, 10);
  const from = new Date(now + KST_OFFSET - 6 * DAY).toISOString().slice(0, 10);
  return { from, to };
}

export function activityRangeBounds(range: ActivityLogRange): { from: number; to: number } {
  function parse(value: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("조회 시작일과 종료일을 선택해 주세요.");
    const time = Date.parse(value + "T00:00:00.000+09:00");
    if (!Number.isFinite(time) || new Date(time + KST_OFFSET).toISOString().slice(0, 10) !== value) {
      throw new Error("올바른 날짜를 선택해 주세요.");
    }
    return time;
  }
  const from = parse(range.from);
  const end = parse(range.to);
  if (end < from) throw new Error("종료일은 시작일보다 빠를 수 없습니다.");
  if (end - from >= 31 * DAY) throw new Error("한 번에 최대 31일의 기록을 조회할 수 있습니다.");
  return { from, to: end + DAY - 1 };
}

/** 저장 계약에 맞는 필드만 구성해 알 수 없는 버전·잘못된 링크·원문 유입을 차단한다. */
export function parseActivityLogRecord(value: unknown): ActivityLogRecord | null {
  const row = asObject(value);
  if (!row || row.schemaVersion !== 1 || !isText(row.id, 160) || !/^[A-Za-z0-9_-]{1,160}$/.test(row.id)
    || !isTime(row.occurredAt) || !isTime(row.recordedAt)
    || !isText(row.area, 40) || !Object.hasOwn(ACTIVITY_AREAS, row.area)
    || typeof row.action !== "string" || !["create", "update", "delete"].includes(row.action)) return null;
  const actor = asObject(row.actor);
  const target = asObject(row.target);
  if (!actor || typeof actor.kind !== "string" || !["user", "system", "unknown"].includes(actor.kind)
    || !target || !isText(target.path, 1024) || !isText(target.label, 160)
    || (actor.kind === "user" && (!isText(actor.uid, 128) || !actor.uid))) return null;
  const rawChanges = Array.isArray(row.changes) ? row.changes : Object.values(asObject(row.changes) ?? {});
  if (rawChanges.length > 40) return null;
  const changes: ActivityChange[] = [];
  for (const raw of rawChanges) {
    const change = asObject(raw);
    if (!change || !isText(change.field, 160)) return null;
    if (change.redacted === true) {
      changes.push({ field: change.field, redacted: true });
      continue;
    }
    if ((change.before != null && !isText(change.before, 160)) || (change.after != null && !isText(change.after, 160))) return null;
    changes.push({ field: change.field, before: change.before as string | null | undefined, after: change.after as string | null | undefined });
  }
  const href = isText(target.href, 512) && /^\/(?:semester\/|retreat\/|sunday-ministry(?:\/|\?|$)|\?)/.test(target.href)
    && !/[\\\u0000-\u0020]/.test(target.href) ? target.href : undefined;
  return {
    id: row.id, schemaVersion: 1, occurredAt: row.occurredAt, recordedAt: row.recordedAt,
    actor: {
      kind: actor.kind as ActivityLogRecord["actor"]["kind"],
      ...(actor.kind === "user" ? { uid: actor.uid as string } : {}),
      ...(isText(actor.name, 80) && actor.name ? { name: actor.name } : {}),
    },
    area: row.area as ActivityLogRecord["area"], action: row.action as ActivityLogRecord["action"],
    target: { path: target.path, label: target.label, ...(isText(target.context, 160) ? { context: target.context } : {}), ...(href ? { href } : {}) },
    changes,
    changedCount: typeof row.changedCount === "number" && Number.isSafeInteger(row.changedCount) && row.changedCount >= changes.length
      ? row.changedCount : changes.length,
  };
}
