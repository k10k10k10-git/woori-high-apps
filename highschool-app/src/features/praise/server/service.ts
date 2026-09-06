import "server-only";
import { canAccessSundayTeam } from "@/features/portal/accessPolicy";
import { canAdministerPraise, praisePermissions } from "../permissions";
import type {
  PraiseActor,
  PraiseCommandRequest,
  PraiseCreateRequest,
  PraiseMeta,
  PraiseState,
} from "../types";
import { praisePaths } from "../paths";
import { applyPraiseCommand, createPraiseState } from "./commands";
import { getPraiseFirebaseAdmin, praiseUnavailable } from "./firebaseAdmin";
import {
  listWorkspaceIds,
  readWorkspace,
  transactWorkspace,
  transactWorkspaceChecked,
} from "./repository";
import { praiseAccounts, praiseReferences, validateSemesterLink } from "./references";
import { validatePraiseRosterLink } from "./roster";
import { fingerprint } from "./stageModel";
import { projectPraiseAudit } from "./projection";
import { requireValue } from "./validation";
import { praiseView } from "./view";
import { assertSharedAttendanceCurrent, initialSharedSessions, loadSharedAttendance, overlaySharedAttendance } from "./sharedAttendance";
import { executeSharedAttendance, pendingSharedAttendance, resolveSharedAttendance } from "./sharedAttendanceWrite";

export async function createPraiseReferences(actor: PraiseActor) {
  requireValue(canAdministerPraise(actor.roles), "찬양팀 운영 공간 개설 권한이 없습니다.", "forbidden", 403);
  return { semesters: await praiseReferences() };
}
export async function readPraiseView(actor: PraiseActor, workspaceId: string) {
  const state = await requireWorkspace(actor, workspaceId);
  return resolvedPraiseView(state, actor);
}

async function resolvedPraiseView(state: PraiseState, actor: PraiseActor) {
  const [shared, pending] = await Promise.all([loadSharedAttendance(state), pendingSharedAttendance(state, actor)]);
  return praiseView(overlaySharedAttendance(state, shared), actor, shared.sources, pending);
}

export function requirePraiseAccess(actor: PraiseActor) {
  requireValue(
    canAccessSundayTeam("praise", actor.roles),
    "찬양팀 접근 권한이 없습니다.",
    "forbidden",
    403,
  );
}
export async function listPraise(actor: PraiseActor) {
  requirePraiseAccess(actor);
  const ids = await listWorkspaceIds();
  const workspaces: PraiseMeta[] = [];
  // 학기별 원장 대신 작은 meta 노드만 조회한다.
  for (const id of ids) {
    let meta;
    try {
      meta = (
        await getPraiseFirebaseAdmin()
          .database.ref(praisePaths.metadata(id))
          .get()
      ).val() as PraiseMeta | null;
    } catch {
      throw praiseUnavailable("workspace_list_unavailable");
    }
    if (meta?.id === id) workspaces.push(meta);
  }
  return {
    workspaces: workspaces.sort((a, b) =>
      b.startDate.localeCompare(a.startDate),
    ),
    canCreate: canAdministerPraise(actor.roles),
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
    canAdministerPraise(actor.roles),
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
) {
  const before = await requireWorkspace(actor, workspaceId);
  const { command } = request;
  if (command.type === "attendance.resolve") {
    const result = await resolveSharedAttendance(actor, before, command, request.operationId);
    const logPending = await projectPraiseAudit(result);
    return { view: await resolvedPraiseView(result, actor), logPending };
  }
  if (command.type === "attendance.set" && (before.meetings[command.meetingId]?.linkedSessionId || before.operations[request.operationId]?.sharedAttendance)) {
    const shared = await loadSharedAttendance(before);
    const result = await executeSharedAttendance(actor, before, command, request.operationId, shared);
    const logPending = await projectPraiseAudit(result);
    return { view: await resolvedPraiseView(result, actor), logPending };
  }
  if (command.type === "person.save") {
    requireValue(
      praisePermissions(actor, before).manage,
      "팀원 연결 권한이 없습니다.",
      "forbidden",
      403,
    );
    await validatePraiseRosterLink(before, command.person);
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
    if (command.type === "meta.save")
      await validateSemesterLink(command.meta.semesterId, command.meta.teamId);
    else if (command.access.active) {
      const accounts = await praiseAccounts();
      requireValue(
        accounts.some((account) => account.uid === command.access.uid),
        "찬양팀을 이용할 수 있는 승인 계정을 선택해 주세요.",
      );
      const user = await getPraiseFirebaseAdmin()
        .auth.getUser(command.access.uid)
        .catch(() => null);
      requireValue(
        user && !user.disabled,
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
    : await transactWorkspace(workspaceId, updateWorkspace);
  requireValue(
    result,
    "저장 결과를 확인하지 못했습니다. 같은 작업을 다시 시도해 주세요.",
    "unavailable",
    503,
  );
  const logPending = await projectPraiseAudit(result);
  return { view: await resolvedPraiseView(result, actor), logPending };
}
