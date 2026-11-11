import "server-only";
import { createHash } from "node:crypto";
import { paths } from "@/lib/paths";
import { parseActivityLogRecord } from "@/features/activityLog/model";
import type { PraiseAuditEvent, PraiseState } from "../types";
import { getPraiseAdmin } from "./supabaseAdmin";
import { fingerprint } from "./stageModel";
import { transactWorkspace } from "./repository";

export function praiseActivityRecord(
  workspaceId: string,
  event: PraiseAuditEvent,
) {
  if (event.historical) return null;
  const id = `praise_${createHash("sha256").update(`${workspaceId}:${event.id}`).digest("hex")}`;
  return parseActivityLogRecord({
    id,
    schemaVersion: 1,
    occurredAt: event.at,
    recordedAt: event.at,
    actor: { kind: "user", ...event.actor },
    area: "semester",
    action: "update",
    target: {
      path: `praiseOps/${workspaceId}`,
      label: `찬양팀 · ${event.label}`.slice(0, 160),
      href: `/sunday-ministry/praise?workspace=${encodeURIComponent(workspaceId)}`,
    },
    changes: event.changes
      .slice(0, 40)
      .map((change) => ({
        field: change.field.slice(0, 160),
        ...(change.before != null
          ? { before: String(change.before).slice(0, 160) }
          : {}),
        ...(change.after != null
          ? { after: String(change.after).slice(0, 160) }
          : {}),
      })),
    changedCount: Math.max(event.changes.length, event.changedCount ?? 0),
  });
}

/** 업무와 함께 저장된 원장을 고정 ID로 투영한다. 조회 요청에서는 호출하지 않는다. */
export async function projectPraiseAudit(state: PraiseState): Promise<boolean> {
  const pending = Object.values(state.audit)
    .filter((event) => !event.projectedAt && !event.historical)
    .sort((a, b) => a.at - b.at);
  const done: string[] = [];
  try {
    for (const event of pending.slice(0, 50)) {
      const value = praiseActivityRecord(state.meta.id, event);
      if (!value) throw new Error("invalid_audit");
      const clean = JSON.parse(JSON.stringify(value));
      const receipt = await getPraiseAdmin()
        .database.transaction(`${paths.activityLogEvents()}/${value.id}`, (current) => current ?? clean);
      const stored = parseActivityLogRecord(receipt.value);
      // 선점된 다른 내용은 성공 영수증이 아니다. 원본 감사와 재시도 대기를 유지한다.
      if (!stored || fingerprint(stored) !== fingerprint(value))
        throw new Error("audit_collision");
      done.push(event.id);
    }
    if (done.length)
      await transactWorkspace(state.meta.id, (current) => {
        if (!current) return undefined;
        const next = structuredClone(current);
        for (const id of done)
          if (next.audit[id]) next.audit[id].projectedAt = Date.now();
        return next;
      });
  } catch {
    return true;
  }
  return pending.length > done.length;
}
