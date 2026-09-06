import { canWritePraiseAttendance, praisePermissions } from "../permissions";
import type {
  PraiseActor,
  PraiseGroupVersion,
  PraiseState,
  PraiseView,
} from "../types";
import { stageInputRevision } from "./stageModel";
import { requireValue } from "./validation";

/** 조 담당자의 원본 출결 범위는 서버에서 제한한다. UI 필터는 보안 경계가 아니다. */
export function praiseView(state: PraiseState, actor: PraiseActor): PraiseView {
  const permissions = praisePermissions(actor, state);
  requireValue(
    permissions.read,
    "찬양팀 조회 권한이 없습니다.",
    "forbidden",
    403,
  );
  const groupStaff = permissions.staffId;
  const allGroups = Object.values(state.groupVersions);
  const groups: PraiseGroupVersion[] = permissions.manage
    ? allGroups
    : allGroups
        .filter((v) => v.kind === "CONFIRMED")
        .map((v) => ({
          ...v,
          rules: [],
          warnings: [],
          groups: permissions.stageEdit
            ? v.groups
            : v.groups.filter(
                (g) => groupStaff && g.staffIds.includes(groupStaff),
              ),
        }))
        .filter((v) => v.groups.length > 0);
  const personIds = new Set(
    groups.flatMap((v) =>
      v.groups.flatMap((g) => [...g.studentIds, ...g.staffIds]),
    ),
  );
  if (groupStaff) personIds.add(groupStaff);
  const people = Object.values(state.people)
    .filter((p) => permissions.stageEdit || personIds.has(p.id))
    .map((p) =>
      permissions.manage
        ? p
        : { ...p, rosterLink: undefined, sourceId: undefined },
    );
  const attendance: PraiseView["attendance"] = {},
    availability: PraiseView["availability"] = {};
  for (const [meetingId, entries] of Object.entries(state.attendance)) {
    const meeting = state.meetings[meetingId];
    if (!meeting) continue;
    const rows = Object.entries(entries).filter(
      ([personId, entry]) =>
        permissions.manage ||
        (entry.groupVersionId !== "import-unresolved" &&
          Boolean(state.groupVersions[entry.groupVersionId]) &&
          canWritePraiseAttendance(
            actor,
            state,
            { ...meeting, groupVersionId: entry.groupVersionId },
            personId,
          )),
    );
    if (rows.length) attendance[meetingId] = Object.fromEntries(rows);
  }
  for (const [meetingId, entries] of Object.entries(state.availability)) {
    const rows = Object.entries(entries).filter(
      ([personId]) => permissions.stageEdit || personId === groupStaff,
    );
    if (rows.length) availability[meetingId] = Object.fromEntries(rows);
  }
  const stages = Object.values(state.stageVersions)
    .filter((v) => permissions.stageEdit || v.kind === "CONFIRMED")
    .map((v) =>
      permissions.stageEdit
        ? v
        : {
            ...v,
            overrides: [],
            candidates: [],
            warnings: [],
            services: v.services.map((s) => ({
              ...s,
              assignments: s.assignments.map((a) => ({ ...a, reason: "" })),
            })),
          },
    );
  return {
    meta: state.meta,
    permissions,
    people,
    meetings: Object.values(state.meetings).sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    ),
    groups: groups.sort((a, b) => b.number - a.number),
    attendance,
    availability,
    stages: stages.sort(
      (a, b) =>
        b.worshipDate.localeCompare(a.worshipDate) || b.number - a.number,
    ),
    access: permissions.manage ? Object.values(state.access) : [],
    guides: Object.values(state.guides).filter(
      (g) => permissions.manage || g.published,
    ),
    policy: permissions.manage
      ? state.policy
      : permissions.stageEdit
        ? { ...state.policy, rules: [] }
        : null,
    audit: Object.values(state.audit)
      .filter(
        (e) =>
          permissions.manage || (!e.historical && e.actor.uid === actor.uid),
      )
      .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id))
      .slice(0, 100),
    imports: permissions.manage ? Object.values(state.imports) : [],
    inputRevisions: permissions.stageEdit
      ? Object.fromEntries(
          Object.values(state.meetings).map((m) => [
            m.id,
            stageInputRevision(state, m),
          ]),
        )
      : {},
  };
}
