import {
  reorderStage,
  type StageAssignment,
  type StageOverride,
} from "./stage";
import type {
  PraiseMeeting,
  PraisePerson,
  PraiseStageConfig,
  PraiseView,
} from "../types";

export const stagePersonKey = (p: Pick<PraisePerson, "kind" | "id">) =>
  `${p.kind}:${p.id}`;
/** 서버의 최종 검증과 별개로 화면에서도 출석·파트·예외·인도자 조건을 적용한다. */
export function canPlaceOnStage(
  person: PraisePerson,
  department: "FIRST" | "SECOND",
  view: PraiseView,
  meeting: PraiseMeeting,
  config: PraiseStageConfig,
  overrides: StageOverride[],
): boolean {
  if (
    !person.active ||
    (config.leaderType === person.kind && config.leaderId === person.id)
  )
    return false;
  if (person.kind === "STAFF")
    return Boolean(
      person.singerCapable &&
      view.availability[meeting.id]?.[person.id]?.present &&
      view.availability[meeting.id]?.[person.id]?.role === "SINGER",
    );
  if (
    config.staffOnly ||
    meeting.cancelled ||
    person.team !== "SINGER" ||
    view.attendance[meeting.id]?.[person.id]?.status !== "PRESENT"
  )
    return false;
  if (
    overrides.some(
      (o) => o.termStudentId === person.id && o.kind === "EXCLUDE_STAGE",
    )
  )
    return false;
  const assignedDepartment =
    overrides.find(
      (o) => o.termStudentId === person.id && o.kind === "MOVE_DEPARTMENT",
    )?.department ?? person.department;
  return assignedDepartment === department;
}
export function normalizeStagePositions(
  assignments: StageAssignment[],
): StageAssignment[] {
  return (["CHOIR", "SINGER"] as const).flatMap((role) =>
    (["LEFT", "RIGHT"] as const).flatMap((side) =>
      assignments
        .filter((a) => a.role === role && a.side === side)
        .sort((a, b) => a.positionOrder - b.positionOrder)
        .map((a, positionOrder) => ({ ...a, positionOrder })),
    ),
  );
}
export function placeStagePerson(
  assignments: StageAssignment[],
  person: PraisePerson,
  role: "SINGER" | "CHOIR",
  side: "LEFT" | "RIGHT",
  position: number,
) {
  const key = stagePersonKey(person);
  const existing = assignments.some(
    (a) => `${a.personType}:${a.personId}` === key,
  );
  const source = existing
    ? assignments
    : [
        ...assignments,
        {
          personId: person.id,
          personType: person.kind,
          name: person.name,
          gender: person.gender,
          role,
          side,
          positionOrder: 0,
          reason: "수동 배치",
          isManual: true,
        },
      ];
  return normalizeStagePositions(
    reorderStage(source, key, role, side, position),
  );
}
