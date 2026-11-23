import "server-only";
import { canAccessTeam } from "@/features/teams/teamModel";
import { canAdministerPraise, praisePermissions } from "../permissions";
import { defaultPraiseMeeting } from "../domain/workflow";
import { toSeoulDate } from "../domain/terms";
import type {
  PraiseActor,
  PraiseCommandRequest,
  PraiseCreateRequest,
  PraiseMeta,
  PraiseState,
} from "../types";
import { praisePaths } from "../paths";
import { applyPraiseCommand, createPraiseState } from "./commands";
import { getPraiseAdmin, praiseUnavailable } from "./supabaseAdmin";
import {
  listWorkspaceIds,
  readWorkspace,
  transactWorkspace,
  transactWorkspaceChecked,
} from "./repository";
import { praiseAccounts, praiseReferences, validateSemesterLink } from "./references";
import { validatePraiseRosterLink, validatePraiseRosterLinks } from "./roster";
import { fingerprint } from "./stageModel";
import { projectPraiseAudit } from "./projection";
import { requireValue } from "./validation";
import { praiseView } from "./view";
import { assertSharedAttendanceCurrent, initialSharedSessions, loadSharedAttendance, overlaySharedAttendance } from "./sharedAttendance";
import { executeSharedAttendance, executeSharedAttendanceEntries, pendingSharedAttendance, resolveSharedAttendance } from "./sharedAttendanceWrite";

export async function createPraiseReferences(actor: PraiseActor) {
  requireValue(canAdministerPraise(actor), "찬양팀 운영 공간 개설 권한이 없습니다.", "forbidden", 403);
  return { semesters: await praiseReferences(actor) };
}
export async function readPraiseView(actor: PraiseActor, workspaceId: string, attendanceMeeting?: string) {
  const state = await requireWorkspace(actor, workspaceId);
  return resolvedPraiseView(state, actor, attendanceMeeting);
}

async function resolvedPraiseView(state: PraiseState, actor: PraiseActor, attendanceMeeting?: string) {
  if (attendanceMeeting !== undefined) {
    const meeting = Object.values(state.meetings).find((item) => item.id === attendanceMeeting)
      ?? defaultPraiseMeeting(Object.values(state.meetings), toSeoulDate(new Date()));
    const shared = meeting ? await loadSharedAttendance(state, { meetingId: meeting.id }) : undefined;
    return praiseView(shared ? overlaySharedAttendance(state, shared) : state, actor, shared?.sources, undefined, meeting?.id ?? "");
  }
  const [shared, pending] = await Promise.all([loadSharedAttendance(state), pendingSharedAttendance(state, actor)]);
  return praiseView(overlaySharedAttendance(state, shared), actor, shared.sources, pending);
}

async function savedAttendance(state: PraiseState, actor: PraiseActor, attendanceMeeting?: string, afterResponse?: (work: () => Promise<unknown>) => void) {
  const view = resolvedPraiseView(state, actor, attendanceMeeting);
  if (afterResponse) {
    // 개인별 원본 감사가 이미 저장됐다. 공용 로그 투영은 응답 뒤에 진행한다.
    const logPending = Object.values(state.audit).some(event => !event.historical && !event.projectedAt);
    if (logPending) afterResponse(() => projectPraiseAudit(state));
    return { view: await view, logPending };
  }
  const [current, logPending] = await Promise.all([view, projectPraiseAudit(state)]);
  return { view: current, logPending };
}

export function requirePraiseAccess(actor: PraiseActor) {
  requireValue(
    canAccessTeam("praise", actor.roles, actor.teamMemberships),
    "찬양팀 접근 권한이 없습니다.",
    "forbidden",
    403,
  );
}
export async function listPraise(actor: PraiseActor) {
  requirePraiseAccess(actor);
  const ids = await listWorkspaceIds();
  const workspaces: PraiseMeta[] = [];
  // 학기별 원장 대신 작은 meta 노드만 제한 병렬로 조회한다.
  for (let start = 0; start < ids.length; start += 6) {
    const batch = await Promise.all(ids.slice(start, start + 6).map(async (id) => {
      const meta = await getPraiseAdmin().database.get(praisePaths.metadata(id)) as PraiseMeta | null;
      return meta?.id === id && canAccessTeam("praise", actor.roles, actor.teamMemberships, meta.semesterId) ? meta : null;
    })).catch(() => { throw praiseUnavailable("workspace_list_unavailable"); });
    workspaces.push(...batch.filter((meta) => meta !== null));
  }
  return {
    workspaces: workspaces.sort((a, b) =>
      b.startDate.localeCompare(a.startDate),
    ),
    canCreate: canAdministerPraise(actor),
  };
}
export async function requireWorkspace(
  actor: PraiseActor,
  workspaceId: string,
  manage = false,
): Promise<PraiseState> {
  requirePraiseAccess(actor);
  const state = await readWorkspace(workspaceId);
  requireValue(state, "찬양팀 운영 공간이 없습니다.", "not_found", 404);
  requireValue(
    praisePermissions(actor, state).read,
    "이 학기의 찬양팀 접근 권한이 없습니다.",
    "forbidden",
    403,
  );
  requireValue(
    !manage || praisePermissions(actor, state).manage,
    "찬양팀 운영 관리 권한이 없습니다.",
    "forbidden",
    403,
  );
  return state;
}
export async function createPraise(
  actor: PraiseActor,
  request: PraiseCreateRequest,
) {
  requireValue(
    canAdministerPraise(actor, request.workspace.semesterId),
    "찬양팀 운영 공간 개설 권한이 없습니다.",
    "forbidden",
    403,
  );
  await validateSemesterLink(
    request.workspace.semesterId,
    request.workspace.teamId,
  );
  const initialSessions = await initialSharedSessions(request.workspace.semesterId);
  const at = Date.now();
  const result = await transactWorkspace(request.workspace.id, (current) => {
    if (!current) {
      const state = createPraiseState(request, actor, at);
      for (const meeting of Object.values(state.meetings)) if (initialSessions[meeting.date]) meeting.linkedSessionId = initialSessions[meeting.date];
      return state;
    }
    const operation = current.operations[request.operationId];
    requireValue(
      operation?.actorUid === actor.uid &&
        operation.fingerprint === fingerprint(request.workspace),
      "이미 사용 중인 운영 공간 번호입니다.",
      "workspace_exists",
      409,
    );
    return current;
  });
  requireValue(
    result,
    "운영 공간 개설 결과를 확인하지 못했습니다.",
    "unavailable",
    503,
  );
  const logPending = await projectPraiseAudit(result);
  return { workspaceId: result.meta.id, logPending };
}
export async function executePraise(
  actor: PraiseActor,
  workspaceId: string,
  request: PraiseCommandRequest,
  afterResponse?: (work: () => Promise<unknown>) => void,
  attendanceMeeting?: string,
) {
  const before = await requireWorkspace(actor, workspaceId);
  const { command } = request;
  if (command.type === "attendance.batch") {
    const batch = { operationId: request.operationId, signature: fingerprint(command) };
    const items = command.entries.map((entry) => ({
      operationId: `pab_${fingerprint({ batchId: batch.operationId, personId: entry.personId })}`,
      command: { type: "attendance.set" as const, meetingId: command.meetingId, ...entry },
    }));
    const linked = before.operations[batch.operationId]
      ? before.operations[items[0].operationId]?.sharedAttendance
      : before.meetings[command.meetingId]?.linkedSessionId;
    const result = linked
      ? await executeSharedAttendanceEntries(actor, before, items, await loadSharedAttendance(before, { meetingId: command.meetingId }), batch)
      : await transactWorkspace(workspaceId, current => {
        requireValue(current, "운영 공간이 없습니다.", "not_found", 404);
        requireValue(praisePermissions(actor, current).read, "찬양팀 접근 권한이 없습니다.", "forbidden", 403);
        const known = current.operations[batch.operationId];
        if (known) {
          requireValue(known.actorUid === actor.uid && known.fingerprint === batch.signature && !known.sharedAttendance &&
            items.every(item => current.operations[item.operationId] && !current.operations[item.operationId].sharedAttendance),
            "다른 내용에 사용된 작업 번호입니다.", "operation_conflict", 409);
          return undefined;
        }
        requireValue(items.every(item => !current.operations[item.operationId]), "출석 작업 번호가 충돌했습니다.", "operation_conflict", 409);
        const at = Date.now();
        const next = items.reduce((state, item) => applyPraiseCommand(state, item.command, actor, at, item.operationId), current);
        next.operations[batch.operationId] = { at, actorUid: actor.uid, fingerprint: batch.signature };
        return next;
      });
    requireValue(result, "저장 결과를 확인하지 못했습니다. 같은 작업을 다시 시도해 주세요.", "unavailable", 503);
    return savedAttendance(result, actor, attendanceMeeting, afterResponse);
  }
  if (command.type === "attendance.resolve") {
    const result = await resolveSharedAttendance(actor, before, command, request.operationId);
    const logPending = await projectPraiseAudit(result);
    return { view: await resolvedPraiseView(result, actor), logPending };
  }
  if (command.type === "attendance.set" && (before.meetings[command.meetingId]?.linkedSessionId || before.operations[request.operationId]?.sharedAttendance)) {
    const shared = await loadSharedAttendance(before, { meetingId: command.meetingId, personId: command.personId });
    const result = await executeSharedAttendance(actor, before, command, request.operationId, shared);
    return savedAttendance(result, actor, attendanceMeeting, afterResponse);
  }
  if (command.type === "person.save" || command.type === "person.reconcile") {
    requireValue(
      praisePermissions(actor, before).manage,
      "팀원 연결 권한이 없습니다.",
      "forbidden",
      403,
    );
    await validatePraiseRosterLink(before, command.person);
  }
  if (command.type === "people.reconcile") {
    requireValue(
      praisePermissions(actor, before).manage,
      "팀원 연결 권한이 없습니다.",
      "forbidden",
      403,
    );
    await validatePraiseRosterLinks(before, command.people.map((entry) => entry.person));
  }
  if (command.type === "people.import")
    requireValue(
      command.people.every((p) => !p.rosterLink),
      "파일 가져오기로 인물을 연결할 수 없습니다. 명단에서 개별 확인해 주세요.",
    );
  if (command.type === "meta.save" || command.type === "access.save") {
    requireValue(
      praisePermissions(actor, before).manage,
      "찬양팀 운영 관리 권한이 없습니다.",
      "forbidden",
      403,
    );
    if (command.type === "meta.save") {
      requireValue(
        canAdministerPraise(actor, command.meta.semesterId),
        "연결할 학기의 찬양팀 운영 권한이 없습니다.",
        "forbidden",
        403,
      );
      await validateSemesterLink(command.meta.semesterId, command.meta.teamId);
    } else if (command.access.active) {
      const accounts = await praiseAccounts();
      requireValue(
        accounts.some((account) => account.uid === command.access.uid),
        "찬양팀을 이용할 수 있는 승인 계정을 선택해 주세요.",
      );
      // 옛 Firebase UID 계정은 첫 로그인 때 Supabase 계정이 생기므로 승인 목록 확인으로 갈음한다.
      const status = await getPraiseAdmin()
        .auth.accountStatus(command.access.uid)
        .catch(() => "missing" as const);
      requireValue(
        status === "active" || status === "unverifiable",
        "연결할 로그인 계정이 없거나 사용 중지 상태입니다.",
      );
    }
  }
  const stageShared = command.type.startsWith("stage.") ? await loadSharedAttendance(before) : null;
  const at = Date.now();
  const updateWorkspace = (current: PraiseState | null) => {
    requireValue(
      current,
      "운영 공간이 삭제되었습니다. 목록을 새로고침해 주세요.",
      "not_found",
      404,
    );
    const stageAttendance = stageShared ? overlaySharedAttendance(current, stageShared).attendance : undefined;
    return applyPraiseCommand(current, command, actor, at, request.operationId, { stageAttendance });
  };
  const result = stageShared && (command.type === "stage.generate" || command.type === "stage.save" || command.type === "stage.confirm")
    ? await transactWorkspaceChecked(workspaceId, updateWorkspace, async (current) => {
        requireValue(current, "운영 공간이 없습니다.", "not_found", 404);
        await assertSharedAttendanceCurrent(current, stageShared, command.meetingId);
      })
    : command.type === "person.save" || command.type === "person.reconcile"
      ? await transactWorkspaceChecked(workspaceId, updateWorkspace, async (current) => {
          requireValue(current, "운영 공간이 없습니다.", "not_found", 404);
          await validatePraiseRosterLink(current, command.person);
        })
    : command.type === "people.reconcile"
      ? await transactWorkspaceChecked(workspaceId, updateWorkspace, async (current) => {
          requireValue(current, "운영 공간이 없습니다.", "not_found", 404);
          await validatePraiseRosterLinks(current, command.people.map((entry) => entry.person));
        })
    : await transactWorkspace(workspaceId, updateWorkspace);
  requireValue(
    result,
    "저장 결과를 확인하지 못했습니다. 같은 작업을 다시 시도해 주세요.",
    "unavailable",
    503,
  );
  if (command.type === "attendance.set" || command.type === "availability.set") return savedAttendance(result, actor, attendanceMeeting, afterResponse);
  const logPending = await projectPraiseAudit(result);
  return { view: await resolvedPraiseView(result, actor, attendanceMeeting), logPending };
}
