import { isPraiseHistoricalReadOnly } from "../domain/operatingBoundary";
import { generateGrouping, evaluateGrouping } from "../domain/grouping";
import { saturdayDates } from "../domain/terms";
import { createFirstMeetingGuide } from "../content/templates";
import { defaultPraisePolicy } from "../defaults";
import {
  canAdministerPraise,
  canWritePraiseAttendance,
  groupVersionForMeeting,
  praisePermissions,
} from "../permissions";
import type {
  PraiseActor,
  PraiseAuditEvent,
  PraiseCommand,
  PraiseCreateRequest,
  PraiseGroupInput,
  PraiseGroupVersion,
  PraiseMeeting,
  PraiseStageVersion,
  PraiseState,
} from "../types";
import {
  fingerprint,
  generatePraiseStage,
  stageInputRevision,
  validateManualStage,
} from "./stageModel";
import { requireValue, revision } from "./validation";

function stamp(
  previous: { revision: number } | undefined,
  actor: PraiseActor,
  at: number,
) {
  return {
    revision: (previous?.revision ?? 0) + 1,
    updatedAt: at,
    updatedBy: actor.uid,
  };
}
const entryId = (operationId: string) => `v_${operationId}`;
function audit(
  state: PraiseState,
  actor: PraiseActor,
  at: number,
  operationId: string,
  action: string,
  label: string,
  targetId?: string,
  changes: PraiseAuditEvent["changes"] = [],
  changedCount = changes.length,
) {
  state.audit[operationId] = {
    id: operationId,
    at,
    actor: { uid: actor.uid, ...(actor.name ? { name: actor.name } : {}) },
    action,
    label,
    ...(targetId ? { targetId } : {}),
    changes,
    ...(changedCount !== changes.length ? { changedCount } : {}),
  };
}
const personKindLabel = (value: string) =>
  value === "STUDENT" ? "학생" : "스탭";
const genderLabel = (value: string) =>
  value === "FEMALE" ? "여" : value === "MALE" ? "남" : "미입력";
const departmentLabel = (value: string) =>
  value === "SECOND" ? "2부" : "1부";
const teamLabel = (value: string) =>
  value === "SESSION" ? "세션" : "싱어";
const preferredServiceLabel = (value: string) =>
  value === "BOTH" ? "1·2부 모두" : departmentLabel(value);
const activeLabel = (value: boolean) => (value ? "사용" : "사용 안 함");
function personChanges(
  before: PraiseState["people"][string] | undefined,
  after: PraiseState["people"][string],
): PraiseAuditEvent["changes"] {
  const changes: PraiseAuditEvent["changes"] = [];
  const add = (field: string, previous: string, next: string) => {
    if (previous !== next) changes.push({ field, before: previous, after: next });
  };
  add("이름", before?.name ?? "등록 전", after.name);
  add("구분", before ? personKindLabel(before.kind) : "등록 전", personKindLabel(after.kind));
  add("학년", before?.kind === "STUDENT" ? `${before.grade}학년` : "해당 없음", after.kind === "STUDENT" ? `${after.grade}학년` : "해당 없음");
  add("성별", before ? genderLabel(before.gender) : "등록 전", genderLabel(after.gender));
  add("예배 부서", before ? departmentLabel(before.department) : "등록 전", departmentLabel(after.department));
  add("파트", before ? teamLabel(before.team) : "등록 전", teamLabel(after.team));
  add("활동 상태", before?.active ? "활동 중" : before ? "비활성" : "등록 전", after.active ? "활동 중" : "비활성");
  add("통합 명단 연결", before?.rosterLink?.applicationKey ? "연결됨" : "미연결", after.rosterLink?.applicationKey ? "연결됨" : "미연결");
  add("학생 인도자", before ? activeLabel(before.isStudentLeader) : "등록 전", activeLabel(after.isStudentLeader));
  add("싱어 가능", before ? activeLabel(before.singerCapable) : "등록 전", activeLabel(after.singerCapable));
  add("조 담당 가능", before ? activeLabel(before.groupStaffCapable) : "등록 전", activeLabel(after.groupStaffCapable));
  add("선호 예배", before ? preferredServiceLabel(before.preferredService) : "등록 전", preferredServiceLabel(after.preferredService));
  add("자동 싱어 배정 제외", before ? activeLabel(before.excludeFromAutoSinger) : "등록 전", activeLabel(after.excludeFromAutoSinger));
  return changes;
}
function sameExistingRosterIdentity(
  before: PraiseState["people"][string]["rosterLink"],
  after: PraiseState["people"][string]["rosterLink"],
) {
  if (!before) return true;
  if (!after || before.applicationKey !== after.applicationKey) return false;
  return (["studentId", "staffId", "personId"] as const).every(
    (field) => !before[field] || before[field] === after[field],
  );
}
export function createPraiseState(
  request: PraiseCreateRequest,
  actor: PraiseActor,
  at: number,
): PraiseState {
  requireValue(
    canAdministerPraise(actor.roles),
    "찬양팀 운영 공간 개설 권한이 없습니다.",
    "forbidden",
    403,
  );
  const w = request.workspace;
  const state: PraiseState = {
    schemaVersion: 1,
    meta: {
      ...w,
      ...stamp(undefined, actor, at),
      status: "active",
      mode: "setup",
    },
    people: {},
    meetings: {},
    groupVersions: {},
    attendance: {},
    availability: {},
    stageVersions: {},
    access: {},
    guides: {},
    policy: defaultPraisePolicy(at, actor.uid),
    audit: {},
    operations: {},
    imports: {},
  };
  saturdayDates(w.startDate, w.endDate).forEach((date, index) => {
    const meetingId = `m_${date.replaceAll("-", "")}`,
      next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    state.meetings[meetingId] = {
      id: meetingId,
      date,
      worshipDate: next.toISOString().slice(0, 10),
      sequence: index + 1,
      title: `${index + 1}주 모임`,
      cancelled: false,
      temporary: false,
      ...stamp(undefined, actor, at),
    };
    if (index === 0)
      state.guides[meetingId] = {
        meetingId,
        published: false,
        content: createFirstMeetingGuide(),
        ...stamp(undefined, actor, at),
      };
  });
  state.operations[request.operationId] = {
    at,
    actorUid: actor.uid,
    fingerprint: fingerprint(request.workspace),
  };
  audit(
    state,
    actor,
    at,
    request.operationId,
    "workspace.create",
    "찬양팀 운영 공간 개설",
    w.id,
  );
  return state;
}
function meetingOf(state: PraiseState, id: string): PraiseMeeting {
  const m = state.meetings[id];
  requireValue(m, "모임 기록을 찾지 못했습니다.", "not_found", 404);
  return m;
}
function latestGroup(state: PraiseState) {
  return Object.values(state.groupVersions).sort(
    (a, b) => b.number - a.number,
  )[0];
}
function validateGroups(state: PraiseState, draft: PraiseGroupInput): string[] {
  const students = Object.values(state.people).filter(
      (p) => p.kind === "STUDENT" && p.active,
    ),
    activeIds = new Set(students.map((p) => p.id)),
    placed = draft.groups.flatMap((g) => g.studentIds);
  requireValue(
    draft.groups.length === draft.settings.groupCount,
    "조 개수와 편성 설정이 다릅니다.",
  );
  requireValue(
    new Set(draft.groups.map((g) => g.id)).size === draft.groups.length,
    "조 번호가 중복되었습니다.",
  );
  requireValue(
    placed.length === activeIds.size &&
      new Set(placed).size === placed.length &&
      placed.every((id) => activeIds.has(id)),
    "활동 중인 학생을 빠짐없이 한 조씩 배정해 주세요.",
  );
  const assignedStaff = new Set<string>();
  for (const group of draft.groups)
    for (const staffId of group.staffIds) {
      requireValue(
        state.people[staffId]?.kind === "STAFF" &&
          state.people[staffId]?.active,
        "활동 중인 스탭을 선택해 주세요.",
      );
      requireValue(
        !assignedStaff.has(staffId),
        "한 스탭이 여러 조에 중복 배정되었습니다.",
      );
      assignedStaff.add(staffId);
    }
  for (const rule of draft.rules)
    requireValue(
      rule.memberIds.every((id) => activeIds.has(id)),
      "조 조건에 현재 명단에 없는 학생이 있습니다.",
    );
  const assignments = draft.groups.flatMap((g, groupIndex) =>
    g.studentIds.map((termStudentId) => ({ termStudentId, groupIndex })),
  );
  const warnings = evaluateGrouping({
    students: students.map((p) => ({ ...p, serviceDepartment: p.department })),
    settings: draft.settings,
    rules: draft.rules,
    assignments,
  });
  for (const group of draft.groups)
    if (
      group.staffIds.length < draft.settings.staffMin ||
      group.staffIds.length > draft.settings.staffMax
    )
      warnings.push(
        `${group.name}: 담당 스탭은 ${draft.settings.staffMin}~${draft.settings.staffMax}명이 필요합니다.`,
      );
  return [...new Set(warnings)];
}
function writeGroupVersion(
  state: PraiseState,
  draft: PraiseGroupInput,
  kind: PraiseGroupVersion["kind"],
  actor: PraiseActor,
  at: number,
  operationId: string,
  warnings: string[],
  acknowledgedWarnings: boolean,
  sourceVersionId?: string,
) {
  const id = entryId(operationId),
    number = (latestGroup(state)?.number ?? 0) + 1;
  state.groupVersions[id] = {
    id,
    number,
    kind,
    ...draft,
    createdAt: at,
    createdBy: actor.uid,
    warnings,
    acknowledgedWarnings,
    ...(sourceVersionId ? { sourceVersionId } : {}),
  };
  if (kind === "CONFIRMED") state.meta.activeGroupVersionId = id;
  return id;
}
/** 원장과 작업 이력은 같은 workspace transaction에서 갱신한다. callback 안에는 외부 부수효과가 없다. */
export function applyPraiseCommand(
  previous: PraiseState,
  command: PraiseCommand,
  actor: PraiseActor,
  at: number,
  operationId: string,
  serverContext: { sharedWrite?: boolean; stageAttendance?: PraiseState["attendance"] } = {},
): PraiseState {
  const permissions = praisePermissions(actor, previous);
  requireValue(
    permissions.read,
    "찬양팀 접근 권한이 없습니다.",
    "forbidden",
    403,
  );
  const known = previous.operations[operationId],
    signature = fingerprint(command);
  if (known) {
    requireValue(
      known.actorUid === actor.uid && known.fingerprint === signature,
      "다른 내용에 사용된 작업 번호입니다. 새로 확인해 주세요.",
      "operation_conflict",
      409,
    );
    requireValue(!known.sharedAttendance || known.sharedAttendance.phase === "complete", "공통 출석 저장 결과를 확인 중입니다. 같은 작업으로 다시 확인해 주세요.", "shared_write_pending", 409);
    return previous;
  }
  const pending = Object.values(previous.operations).flatMap(op => op.sharedAttendance && ["prepared", "attempting"].includes(op.sharedAttendance.phase) ? [op.sharedAttendance] : []);
  const changesAttendanceMapping =
    ((command.type === "person.save" || command.type === "person.reconcile") && pending.some(receipt => receipt.personId === command.person.id)) ||
    (command.type === "people.reconcile" && command.people.some((entry) => pending.some((receipt) => receipt.personId === entry.person.id))) ||
    (command.type === "meeting.save" && pending.some(receipt => receipt.meetingId === command.meeting.id)) ||
    (command.type.startsWith("groups.") && pending.length > 0) ||
    (command.type === "meta.save" && pending.length > 0 && (command.meta.semesterId !== previous.meta.semesterId || command.meta.teamId !== previous.meta.teamId || command.meta.mode !== previous.meta.mode || command.meta.status !== previous.meta.status));
  requireValue(!changesAttendanceMapping,
    "해당 출석 요청의 저장 결과를 먼저 확인해 주세요. 관리자가 요청을 검토·종료하면 연결을 바꿀 수 있습니다.", "shared_write_pending", 409);
  requireValue(
    !previous.audit[operationId] &&
      !previous.groupVersions[entryId(operationId)] &&
      !previous.stageVersions[entryId(operationId)],
    "이미 기록에 사용된 작업 번호입니다. 새 작업으로 다시 확인해 주세요.",
    "operation_conflict",
    409,
  );
  const manage = () =>
    requireValue(
      permissions.manage,
      "찬양팀 운영 관리 권한이 없습니다.",
      "forbidden",
      403,
    );
  if (command.type !== "meta.save") {
    const shadowPersonReconcile = (command.type === "person.reconcile" || command.type === "people.reconcile") && previous.meta.mode === "shadow";
    requireValue(
      previous.meta.status !== "archived",
      "보관된 운영 기간은 수정할 수 없습니다. 운영 설정에서 먼저 다시 열어 주세요.",
      "read_only",
      409,
    );
    requireValue(
      previous.meta.mode !== "shadow" || shadowPersonReconcile,
      "원본 대조 중에는 기존 팀원 연결·세부 정보만 수정할 수 있습니다.",
      "read_only",
      409,
    );
    requireValue(
      previous.meta.mode === "live" || permissions.manage,
      "운영 준비 중입니다. 담당자가 입력을 열면 기록할 수 있습니다.",
      "read_only",
      409,
    );
  }
  const operationMeeting = "meetingId" in command ? previous.meetings[command.meetingId] : command.type === "meeting.save" ? previous.meetings[command.meeting.id] ?? command.meeting : null;
  requireValue(!operationMeeting || !isPraiseHistoricalReadOnly(previous.meta, operationMeeting.date), "운영 전환 이전의 회차는 과거 기록으로 보관되어 있습니다.", "historical_read_only", 409);
  const state = structuredClone(previous);
  let label = "찬양팀 기록 수정",
    targetId: string | undefined;
  let changes: PraiseAuditEvent["changes"] = [];
  let changedCount: number | undefined;
  switch (command.type) {
    case "attendance.resolve":
      requireValue(false, "공통 출석 검토 서비스에서 처리해 주세요.", "invalid_request", 400);
      break;
    case "meta.save": {
      manage();
      revision(state.meta.revision, command.expectedRevision);
      requireValue(
        command.meta.mode !== "live" || !state.meta.importBlockers?.length,
        "원본 이관 검증이 끝나지 않았습니다. 대조 보고서의 미해결 항목부터 확인해 주세요.",
        "migration_incomplete",
        409,
      );
      requireValue(
        state.meta.mode !== "shadow" ||
          !state.meta.importBlockers?.length ||
          command.meta.mode === "shadow",
        "가져온 기록의 대조가 끝날 때까지 읽기 전용으로 유지됩니다.",
        "migration_incomplete",
        409,
      );
      const linkedAttendance = Object.values(state.meetings).some(
        (m) => m.linkedSessionId,
      );
      requireValue(
        !linkedAttendance ||
          (command.meta.semesterId === state.meta.semesterId &&
            command.meta.teamId === state.meta.teamId),
        "연결된 회차가 있어 학기·팀 연결을 바로 바꿀 수 없습니다. 회차 연결부터 확인해 주세요.",
      );
      state.meta = { ...state.meta, ...command.meta };
      if (!command.meta.semesterId) delete state.meta.semesterId;
      if (!command.meta.teamId) delete state.meta.teamId;
      label = "찬양팀 운영 설정 변경";
      targetId = state.meta.id;
      break;
    }
    case "person.save":
    case "person.reconcile": {
      manage();
      const p = command.person;
      const previousPerson = state.people[p.id];
      revision(previousPerson?.revision, command.expectedRevision);
      requireValue(
        command.type !== "person.reconcile" || (previous.meta.mode === "shadow" && previousPerson),
        "원본 대조 중에는 기존 팀원만 수정할 수 있습니다.",
        "read_only",
        409,
      );
      if (previousPerson) {
        requireValue(
          previousPerson.kind === p.kind,
          "기록이 있는 학생·스탭 구분은 바꿀 수 없습니다.",
        );
        requireValue(
          previousPerson.sourceId === p.sourceId,
          "가져온 기록의 원본 식별자는 바꿀 수 없습니다.",
          "immutable_source",
          409,
        );
        requireValue(
          sameExistingRosterIdentity(previousPerson.rosterLink, p.rosterLink),
          "기존 통합 명단 연결은 이 화면에서 해제하거나 다른 인물로 바꿀 수 없습니다.",
          "immutable_roster_link",
          409,
        );
      } else {
        requireValue(!p.sourceId, "직접 등록한 팀원에는 원본 식별자를 지정할 수 없습니다.");
      }
      if (p.rosterLink?.applicationKey)
        requireValue(
          !Object.values(state.people).some(
            (other) =>
              other.id !== p.id &&
              other.rosterLink?.applicationKey === p.rosterLink?.applicationKey,
          ),
          "같은 학기 인물이 이미 연결되어 있습니다.",
          "duplicate_person",
          409,
        );
      if (p.rosterLink?.personId)
        requireValue(
          !Object.values(state.people).some(
            (other) =>
              other.id !== p.id &&
              other.rosterLink?.personId === p.rosterLink?.personId,
          ),
          "같은 원장 인물이 이미 연결되어 있습니다.",
          "duplicate_person",
          409,
        );
      if (!state.people[p.id])
        requireValue(
          Object.keys(state.people).length < 2000,
          "현재 학기 명단의 등록 한도를 초과했습니다.",
        );
      if (previousPerson) {
        const { revision: _revision, updatedAt: _updatedAt, updatedBy: _updatedBy, ...previousInput } = previousPerson;
        void _revision; void _updatedAt; void _updatedBy;
        requireValue(
          fingerprint(previousInput) !== fingerprint(p),
          "변경된 팀원 정보가 없습니다.",
          "no_changes",
          409,
        );
      }
      state.people[p.id] = { ...p, ...stamp(state.people[p.id], actor, at) };
      changes = personChanges(previousPerson, state.people[p.id]);
      label = command.type === "person.reconcile"
        ? "찬양팀 팀원 정보 대조"
        : command.expectedRevision
          ? "찬양팀 팀원 정보 수정"
          : "찬양팀 팀원 등록";
      targetId = p.id;
      break;
    }
    case "people.reconcile": {
      manage();
      requireValue(previous.meta.mode === "shadow", "일괄 명단 대조는 원본 대조 중에만 실행할 수 있습니다.", "read_only", 409);
      requireValue(command.people.length > 0, "대조할 팀원을 선택해 주세요.");
      const personIds = new Set<string>();
      const applicationKeys = new Set(Object.values(state.people).flatMap((person) => person.rosterLink?.applicationKey ? [person.rosterLink.applicationKey] : []));
      const rosterPersonIds = new Set(Object.values(state.people).flatMap((person) => person.rosterLink?.personId ? [person.rosterLink.personId] : []));
      for (const entry of command.people) {
        const p = entry.person, previousPerson = state.people[p.id];
        requireValue(previousPerson, "대조할 기존 팀원을 찾을 수 없습니다.", "not_found", 404);
        requireValue(!personIds.has(p.id), "같은 팀원이 대조 목록에 두 번 포함되어 있습니다.", "duplicate_person", 409);
        personIds.add(p.id);
        revision(previousPerson.revision, entry.expectedRevision);
        requireValue(previousPerson.kind === p.kind, "기록이 있는 학생·스탭 구분은 바꿀 수 없습니다.");
        requireValue(previousPerson.sourceId === p.sourceId, "가져온 기록의 원본 식별자는 바꿀 수 없습니다.", "immutable_source", 409);
        const { revision: _revision, updatedAt: _updatedAt, updatedBy: _updatedBy, rosterLink: _oldLink, ...previousInput } = previousPerson;
        const { rosterLink: nextLink, ...requestedInput } = p;
        void _revision; void _updatedAt; void _updatedBy; void _oldLink;
        requireValue(
          fingerprint(previousInput) === fingerprint(requestedInput),
          "일괄 명단 대조에서는 기존 팀원 정보를 함께 바꿀 수 없습니다. 세부 정보는 팀원 편집에서 따로 저장해 주세요.",
          "reconcile_scope",
          409,
        );
        requireValue(!previousPerson.rosterLink || !Object.keys(previousPerson.rosterLink).length, "이미 연결된 팀원이 포함되어 있습니다.", "immutable_roster_link", 409);
        requireValue(nextLink?.applicationKey && nextLink.personId, "검증된 학기 배치와 원장 인물을 모두 선택해 주세요.");
        requireValue(!applicationKeys.has(nextLink.applicationKey) && !rosterPersonIds.has(nextLink.personId), "같은 학기 또는 원장 인물이 이미 연결되어 있습니다.", "duplicate_person", 409);
        applicationKeys.add(nextLink.applicationKey); rosterPersonIds.add(nextLink.personId);
        state.people[p.id] = { ...previousPerson, rosterLink: nextLink, ...stamp(previousPerson, actor, at) };
      }
      label = `찬양팀 통합 명단 ${command.people.length}명 연결`;
      const names = command.people.map((entry) => state.people[entry.person.id].name);
      const visibleNames = names.slice(0, 8).join(", ");
      changes = [{
        field: "연결된 팀원",
        before: `미연결 ${command.people.length}명`,
        after: `${visibleNames}${names.length > 8 ? ` 외 ${names.length - 8}명` : ""}`,
      }];
      changedCount = command.people.length;
      break;
    }
    case "meeting.save": {
      manage();
      requireValue(!isPraiseHistoricalReadOnly(state.meta, command.meeting.date), "보관 기간 안으로 회차를 이동하거나 추가할 수 없습니다.", "historical_read_only", 409);
      const m = command.meeting,
        current = state.meetings[m.id];
      revision(current?.revision, command.expectedRevision);
      if (
        current &&
        (Object.keys(state.attendance[m.id] ?? {}).length ||
          Object.values(state.stageVersions).some((v) => v.meetingId === m.id))
      )
        requireValue(
          (current.groupVersionId ?? "") === (m.groupVersionId ?? "") &&
            current.date === m.date &&
            (current.linkedSessionId ?? "") === (m.linkedSessionId ?? ""),
          "기록이 있는 모임의 날짜·조 기준·출석 연결은 직접 변경할 수 없습니다. 이력을 보존한 별도 회차를 사용해 주세요.",
        );
      if (m.groupVersionId)
        requireValue(
          state.groupVersions[m.groupVersionId]?.kind === "CONFIRMED",
          "확정된 조 편성만 회차에 연결할 수 있습니다.",
        );
      // 공통 회차 연결은 양쪽 원장 대조·전환 도구에서만 확정한다. 화면 저장으로 이중 원장을 만들지 않는다.
      requireValue(
        (m.linkedSessionId ?? "") === (current?.linkedSessionId ?? ""),
        "공통 출석 회차 연결은 이관 대조를 완료한 뒤 적용할 수 있습니다.",
        "migration_required",
        409,
      );
      state.meetings[m.id] = { ...m, ...(current?.sourceDate ? { sourceDate: current.sourceDate } : {}), ...stamp(current, actor, at) };
      label = m.cancelled ? "찬양팀 모임 휴강" : "찬양팀 모임 일정 저장";
      targetId = m.id;
      break;
    }
    case "groups.generate": {
      manage();
      revision(state.meta.revision, command.expectedRevision);
      const students = Object.values(state.people).filter(
        (p) => p.kind === "STUDENT" && p.active,
      );
      requireValue(
        students.length > 0,
        "먼저 찬양팀 학생 명단을 연결하거나 등록해 주세요.",
      );
      for (const rule of command.rules)
        requireValue(
          rule.memberIds.every((id) => students.some((p) => p.id === id)),
          "조 조건의 학생 명단을 확인해 주세요.",
        );
      const result = generateGrouping(
        students.map((p) => ({ ...p, serviceDepartment: p.department })),
        command.settings,
        command.rules,
        command.seed,
      );
      requireValue(
        !result.error,
        result.error ?? "조 편성을 만들지 못했습니다.",
        "grouping_impossible",
        409,
      );
      const groups = Array.from(
        { length: command.settings.groupCount },
        (_, index) => ({
          id: `g_${index + 1}`,
          name: `${index + 1}조`,
          studentIds: result.assignments
            .filter((a) => a.groupIndex === index)
            .map((a) => a.termStudentId),
          staffIds: [] as string[],
        }),
      );
      targetId = writeGroupVersion(
        state,
        {
          settings: command.settings,
          rules: command.rules,
          seed: command.seed,
          groups,
        },
        "AUTO_DRAFT",
        actor,
        at,
        operationId,
        result.warnings,
        false,
      );
      label = "찬양팀 자동 조 편성";
      break;
    }
    case "groups.save":
    case "groups.confirm": {
      manage();
      revision(state.meta.revision, command.expectedRevision);
      requireValue(
        latestGroup(state)?.id === command.sourceVersionId,
        "다른 조 편성 버전이 먼저 저장됐습니다. 최신 편성안을 확인해 주세요.",
        "revision_conflict",
        409,
      );
      const warnings = validateGroups(state, command.draft);
      requireValue(
        command.type !== "groups.confirm" ||
          warnings.length === 0 ||
          command.acknowledgeWarnings,
        "조 편성 경고를 확인한 뒤 확정해 주세요.",
        "warnings_required",
        409,
      );
      targetId = writeGroupVersion(
        state,
        command.draft,
        command.type === "groups.confirm" ? "CONFIRMED" : "MANUAL_DRAFT",
        actor,
        at,
        operationId,
        warnings,
        command.acknowledgeWarnings,
        command.sourceVersionId,
      );
      label =
        command.type === "groups.confirm"
          ? "찬양팀 조 편성 확정"
          : "찬양팀 조 편성 초안 저장";
      break;
    }
    case "attendance.set": {
      const m = meetingOf(state, command.meetingId),
        p = state.people[command.personId];
      requireValue(
        p?.kind === "STUDENT" && p.active,
        "활동 중인 학생을 선택해 주세요.",
      );
      requireValue(!m.cancelled, "휴강 모임에는 출결을 입력할 수 없습니다.");
      requireValue(
        !m.linkedSessionId || serverContext.sharedWrite,
        "이 모임은 학기 출석 원장과 연결되어 있습니다. 공통 출석 화면에서 입력해 주세요.",
        "linked_attendance",
        409,
      );
      requireValue(
        canWritePraiseAttendance(actor, state, m, p.id),
        "담당 조의 출결만 수정할 수 있습니다.",
        "forbidden",
        403,
      );
      const group = groupVersionForMeeting(state, m);
      requireValue(
        group && group.groups.some((g) => g.studentIds.includes(p.id)),
        "먼저 학생이 포함된 조 편성을 확정해 주세요.",
      );
      const current = state.attendance[m.id]?.[p.id];
      revision(current?.revision, command.expectedRevision);
      if (!m.groupVersionId)
        state.meetings[m.id] = {
          ...m,
          groupVersionId: group.id,
          ...stamp(m, actor, at),
        };
      state.attendance[m.id] ??= {};
      state.attendance[m.id][p.id] = {
        status: command.status,
        groupVersionId: group.id,
        ...stamp(current, actor, at),
      };
      label = `${m.date} ${p.name} 출결 변경`;
      targetId = p.id;
      const statusLabel = (s: string | null | undefined) =>
        s === "PRESENT" ? "출석" : s === "ABSENT" ? "결석" : "미입력";
      changes = [
        {
          field: "출결",
          before: statusLabel(current?.status),
          after: statusLabel(command.status),
        },
      ];
      break;
    }
    case "availability.set": {
      const m = meetingOf(state, command.meetingId),
        p = state.people[command.personId];
      requireValue(
        p?.kind === "STAFF" && p.active,
        "활동 중인 스탭을 선택해 주세요.",
      );
      requireValue(
        permissions.stageEdit || permissions.staffId === p.id,
        "본인 참석 여부만 수정할 수 있습니다.",
        "forbidden",
        403,
      );
      const current = state.availability[m.id]?.[p.id];
      revision(current?.revision, command.expectedRevision);
      state.availability[m.id] ??= {};
      state.availability[m.id][p.id] = {
        present: command.present,
        role: command.role,
        ...stamp(current, actor, at),
      };
      label = `${m.worshipDate} ${p.name} 주일 참석·역할 변경`;
      targetId = p.id;
      const presentLabel = (present: boolean | null | undefined) =>
        present == null ? "미입력" : present ? "참석" : "불참";
      const roleLabel = (role: string | undefined) =>
        role === "SINGER" ? "싱어" : role === "SESSION" ? "세션" : "미입력";
      changes = [
        { field: "주일 참석", before: presentLabel(current?.present), after: presentLabel(command.present) },
        { field: "참석 역할", before: roleLabel(current?.role), after: roleLabel(command.role) },
      ];
      break;
    }
    case "stage.generate":
    case "stage.save":
    case "stage.confirm": {
      requireValue(
        permissions.stageEdit,
        "등단 편성 권한이 없습니다.",
        "forbidden",
        403,
      );
      const m = meetingOf(state, command.meetingId);
      const stageState = serverContext.stageAttendance ? { ...state, attendance: serverContext.stageAttendance } : state;
      requireValue(
        stageInputRevision(stageState, m) === command.inputRevision,
        "출결·명단·등단 이력 또는 정책이 변경되었습니다. 최신 기준으로 다시 검토해 주세요.",
        "input_conflict",
        409,
      );
      const latest = Object.values(state.stageVersions)
        .filter((v) => v.meetingId === m.id)
        .sort((a, b) => b.number - a.number)[0];
      if (command.type !== "stage.generate")
        requireValue(
          latest?.id === command.sourceVersionId,
          "다른 등단 버전이 먼저 저장됐습니다. 최신 편성안을 확인해 주세요.",
          "revision_conflict",
          409,
        );
      const config =
          command.type === "stage.generate"
            ? command.config
            : command.draft.config,
        overrides =
          command.type === "stage.generate"
            ? command.overrides
            : command.draft.overrides;
      const result =
        command.type === "stage.generate"
          ? generatePraiseStage(stageState, m, config, overrides)
          : validateManualStage(stageState, m, command.draft);
      const acknowledged =
        command.type !== "stage.generate" && command.acknowledgeWarnings;
      requireValue(
        command.type !== "stage.confirm" ||
          result.warnings.length === 0 ||
          acknowledged,
        "등단 편성 경고를 확인한 뒤 확정해 주세요.",
        "warnings_required",
        409,
      );
      const id = entryId(operationId);
      const version: PraiseStageVersion = {
        id,
        meetingId: m.id,
        number: (latest?.number ?? 0) + 1,
        kind:
          command.type === "stage.generate"
            ? "AUTO_DRAFT"
            : command.type === "stage.confirm"
              ? "CONFIRMED"
              : "MANUAL_DRAFT",
        ...(command.type !== "stage.generate"
          ? { sourceVersionId: command.sourceVersionId }
          : {}),
        createdAt: at,
        createdBy: actor.uid,
        inputRevision: command.inputRevision,
        worshipDate: m.worshipDate,
        config,
        overrides,
        ...result,
        acknowledgedWarnings: acknowledged,
      };
      state.stageVersions[id] = version;
      targetId = id;
      label =
        command.type === "stage.confirm"
          ? "찬양팀 등단표 확정"
          : command.type === "stage.generate"
            ? "찬양팀 등단 자동 편성"
            : "찬양팀 등단 초안 저장";
      break;
    }
    case "policy.save": {
      manage();
      revision(state.policy.revision, command.expectedRevision);
      state.policy = { ...command.policy, ...stamp(state.policy, actor, at) };
      label = "찬양팀 편성 정책 변경";
      break;
    }
    case "access.save": {
      manage();
      const a = command.access;
      revision(state.access[a.uid]?.revision, command.expectedRevision);
      requireValue(
        state.people[a.staffId]?.kind === "STAFF" &&
          state.people[a.staffId]?.active,
        "로그인 계정과 연결할 활동 스탭을 선택해 주세요.",
      );
      if (a.active)
        requireValue(
          !Object.values(state.access).some(
            (other) =>
              other.uid !== a.uid &&
              other.active &&
              other.staffId === a.staffId,
          ),
          "이 스탭에는 이미 다른 로그인 계정이 연결되어 있습니다.",
          "duplicate_account",
          409,
        );
      state.access[a.uid] = { ...a, ...stamp(state.access[a.uid], actor, at) };
      label = "찬양팀 담당 계정·권한 변경";
      targetId = a.uid;
      changes = [
        {
          field: "찬양팀 권한",
          before: previous.access[a.uid]?.role ?? "미연결",
          after: a.active ? a.role : "사용 중지",
        },
      ];
      break;
    }
    case "guide.save": {
      manage();
      const g = command.guide;
      meetingOf(state, g.meetingId);
      revision(state.guides[g.meetingId]?.revision, command.expectedRevision);
      if (g.published)
        requireValue(
          g.content.title && g.content.location && g.content.steps.length > 0,
          "게시 전에 제목·장소·진행 순서를 입력해 주세요.",
        );
      state.guides[g.meetingId] = {
        ...g,
        ...stamp(state.guides[g.meetingId], actor, at),
      };
      label = g.published
        ? "찬양팀 모임 가이드 게시"
        : "찬양팀 모임 가이드 초안 저장";
      targetId = g.meetingId;
      break;
    }
    case "people.import": {
      manage();
      requireValue(command.people.length > 0, "가져올 명단이 없습니다.");
      requireValue(
        !Object.values(state.imports).some(
          (batch) => batch.checksum === command.checksum,
        ),
        "이미 반영한 원본입니다. 중복 가져오기를 중단했습니다.",
        "already_imported",
        409,
      );
      const ids = new Set<string>(),
        names = new Set(
          Object.values(state.people).map(
            (p) => `${p.kind}:${p.name.replaceAll(/\s/g, "")}`,
          ),
        );
      for (const p of command.people) {
        requireValue(
          !ids.has(p.id) && !state.people[p.id],
          "이미 사용 중인 학생·스탭 번호가 있습니다.",
          "duplicate_person",
          409,
        );
        ids.add(p.id);
        const name = `${p.kind}:${p.name.replaceAll(/\s/g, "")}`;
        requireValue(
          !names.has(name),
          "동명이인 또는 기존 명단과 같은 이름이 있습니다. 가져오기 대신 인물을 확인하고 개별 연결해 주세요.",
          "duplicate_review_required",
          409,
        );
        names.add(name);
      }
      requireValue(
        Object.keys(state.people).length + command.people.length <= 2000,
        "학기 명단 등록 한도를 초과했습니다.",
      );
      for (const p of command.people)
        state.people[p.id] = { ...p, ...stamp(undefined, actor, at) };
      state.imports[operationId] = {
        id: operationId,
        at,
        by: actor.uid,
        source: command.source,
        checksum: command.checksum,
        counts: { people: command.people.length },
      };
      label = `찬양팀 명단 ${command.people.length}명 가져오기`;
      break;
    }
  }
  state.meta = { ...state.meta, ...stamp(previous.meta, actor, at) };
  state.operations[operationId] = {
    at,
    actorUid: actor.uid,
    fingerprint: signature,
  };
  audit(state, actor, at, operationId, command.type, label, targetId, changes, changedCount);
  return state;
}
