import { createHash } from "node:crypto";
import {
  generateStageService,
  generateStaffOnlyService,
  type StageAssignment,
  type StageHistory,
  type StageOverride,
} from "../domain/stage";
import { buildStageHistory } from "../domain/stage-history";
import { latestConfirmedPraiseStages } from "../stageHistoryModel";
import { groupVersionForMeeting } from "../permissions";
import type {
  PraiseMeeting,
  PraiseStageConfig,
  PraiseStageInput,
  PraiseStageVersion,
  PraiseState,
} from "../types";
import { requireValue } from "./validation";

export function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
    .join(",")}}`;
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
export function stageInputRevision(
  state: PraiseState,
  meeting: PraiseMeeting,
): string {
  return fingerprint({
    meeting,
    people: state.people,
    attendance: state.attendance[meeting.id] ?? {},
    availability: state.availability[meeting.id] ?? {},
    grouping: groupVersionForMeeting(state, meeting),
    policy: state.policy,
    history: Object.values(state.stageVersions)
      .filter(
        (v) => v.kind === "CONFIRMED" && v.worshipDate < meeting.worshipDate,
      )
      .map((v) => ({ id: v.id, at: v.createdAt }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export function stageHistory(
  state: PraiseState,
  date: string,
): Map<string, StageHistory> {
  const versions = latestConfirmedPraiseStages(Object.values(state.stageVersions), date);
  const plans = [
    ...new Map(
      versions.map((v) => [
        v.meetingId,
        { id: v.meetingId, sunday_date: v.worshipDate },
      ]),
    ).values(),
  ];
  const history = buildStageHistory({
    plans,
    sundayDate: date,
    versions: versions.map((v) => ({
      id: v.id,
      plan_id: v.meetingId,
      version_no: v.number,
      kind: v.kind,
      leader_type: v.config.leaderType,
      leader_term_student_id:
        v.config.leaderType === "STUDENT" ? v.config.leaderId : null,
    })),
    services: versions.flatMap((v) =>
      v.services.map((s) => ({
        id: `${v.id}_${s.department}`,
        version_id: v.id,
      })),
    ),
    assignments: versions.flatMap((v) =>
      v.services.flatMap((s) =>
        s.assignments.map((a) => ({
          service_id: `${v.id}_${s.department}`,
          term_student_id: a.personType === "STUDENT" ? a.personId : null,
          person_type: a.personType,
          role: a.role,
        })),
      ),
    ),
    candidates: versions.flatMap((v) =>
      v.candidates.map((c) => ({
        version_id: v.id,
        term_student_id:
          state.people[c.personId]?.kind === "STUDENT" ? c.personId : null,
        person_type: state.people[c.personId]?.kind ?? "STAFF",
        eligible: c.eligible,
      })),
    ),
  });
  return new Map(Object.entries(history));
}
export function stageContext(
  state: PraiseState,
  meeting: PraiseMeeting,
  config: PraiseStageConfig,
  overrides: StageOverride[],
) {
  const people = Object.values(state.people).filter((p) => p.active),
    students = people.filter((p) => p.kind === "STUDENT"),
    staff = people.filter((p) => p.kind === "STAFF");
  const leader = state.people[config.leaderId];
  requireValue(
    leader?.active && leader.kind === config.leaderType,
    "활동 중인 인도자를 선택해 주세요.",
  );
  requireValue(
    !config.staffOnly || config.leaderType === "STAFF",
    "스탭만 등단할 때에는 스탭 인도자를 선택해 주세요.",
  );
  const eligibleIds = new Set(
    meeting.cancelled
      ? []
      : students
          .filter(
            (p) => state.attendance[meeting.id]?.[p.id]?.status === "PRESENT",
          )
          .map((p) => p.id),
  );
  const presentStaff = new Set(
    staff
      .filter(
        (p) =>
          state.availability[meeting.id]?.[p.id]?.present &&
          state.availability[meeting.id]?.[p.id]?.role === "SINGER",
      )
      .map((p) => p.id),
  );
  if (config.leaderType === "STUDENT")
    requireValue(
      eligibleIds.has(leader.id),
      "학생 인도자는 선택한 토요모임에 출석해야 합니다.",
    );
  const seen = new Set<string>();
  for (const o of overrides) {
    requireValue(
      students.some((p) => p.id === o.termStudentId),
      "현재 학기의 학생만 특이사항으로 지정할 수 있습니다.",
    );
    const key = `${o.termStudentId}_${o.kind}`;
    requireValue(!seen.has(key), "같은 특이사항이 중복되었습니다.");
    seen.add(key);
    requireValue(
      !(
        o.kind === "EXCLUDE_STAGE" &&
        config.leaderType === "STUDENT" &&
        o.termStudentId === leader.id
      ),
      "인도자는 등단 제외로 지정할 수 없습니다.",
    );
    requireValue(
      !(
        o.kind === "FORCE_STAGE" &&
        overrides.some(
          (x) =>
            x.termStudentId === o.termStudentId && x.kind === "EXCLUDE_STAGE",
        )
      ),
      "강제 등단과 등단 제외는 함께 지정할 수 없습니다.",
    );
  }
  const excluded = new Set(
    overrides
      .filter((o) => o.kind === "EXCLUDE_STAGE")
      .map((o) => o.termStudentId),
  );
  const candidates = people.map((p) => ({
    personId: p.id,
    eligible:
      p.kind === "STUDENT"
        ? eligibleIds.has(p.id) && p.team === "SINGER" && !excluded.has(p.id)
        : presentStaff.has(p.id) && p.singerCapable,
    reason:
      p.kind === "STAFF"
        ? presentStaff.has(p.id)
          ? "참석 싱어 스탭"
          : "불참·미입력 또는 세션 역할"
        : excluded.has(p.id)
          ? "등단 제외"
          : p.team === "SESSION"
            ? "세션팀"
            : meeting.cancelled
              ? "휴강"
              : eligibleIds.has(p.id)
                ? "출석 후보"
                : "출결 미입력 또는 결석",
  }));
  return {
    students,
    staff,
    leader,
    eligibleIds,
    presentStaff,
    candidates,
    excluded,
    histories: stageHistory(state, meeting.worshipDate),
  };
}
export function generatePraiseStage(
  state: PraiseState,
  meeting: PraiseMeeting,
  config: PraiseStageConfig,
  overrides: StageOverride[],
): Pick<
  PraiseStageVersion,
  "services" | "candidates" | "warnings" | "leaderName"
> {
  const c = stageContext(state, meeting, config, overrides),
    used = new Set<string>(),
    warnings: string[] = [];
  const services = (["FIRST", "SECOND"] as const).map((department) => {
    const target = department === "FIRST" ? config.first : config.second;
    const result = config.staffOnly
      ? {
          assignments: generateStaffOnlyService(
            c.staff,
            c.presentStaff,
            config.leaderId,
          ),
          warnings: [],
        }
      : generateStageService({
          department,
          students: c.students,
          staff: c.staff,
          eligibleStudentIds: c.eligibleIds,
          presentSingerStaffIds: c.presentStaff,
          histories: c.histories,
          ...target,
          leaderType: config.leaderType,
          leaderId: config.leaderId,
          overrides,
          usedStaffIds: used,
          studentRatio: config.studentRatio,
          minimumFemaleSingers: config.minimumFemaleSingers,
        });
    warnings.push(
      ...result.warnings.map(
        (w) => `${department === "FIRST" ? "1부" : "2부"}: ${w}`,
      ),
    );
    return { department, assignments: result.assignments };
  });
  return {
    services,
    candidates: c.candidates,
    warnings: [...new Set(warnings)],
    leaderName: c.leader.name,
  };
}
export function validateManualStage(
  state: PraiseState,
  meeting: PraiseMeeting,
  draft: PraiseStageInput,
) {
  const c = stageContext(state, meeting, draft.config, draft.overrides),
    warnings: string[] = [];
  requireValue(
    draft.services.length === 2 &&
      new Set(draft.services.map((s) => s.department)).size === 2,
    "1부와 2부 배치를 각각 포함해 주세요.",
  );
  const services = draft.services.map((service) => {
    const used = new Set<string>();
    const positions = new Set<string>();
    const assignments: StageAssignment[] = service.assignments.map((a) => {
      const person = state.people[a.personId];
      requireValue(
        person?.active && person.kind === a.personType,
        "현재 활동하는 팀원만 배치할 수 있습니다.",
      );
      requireValue(
        person.id !== draft.config.leaderId,
        "인도자는 싱어·콰이어와 중복 배치할 수 없습니다.",
      );
      requireValue(
        !used.has(person.id),
        "같은 예배에 한 사람을 두 번 배치할 수 없습니다.",
      );
      used.add(person.id);
      const position = `${a.role}_${a.side}_${a.positionOrder}`;
      requireValue(
        !positions.has(position),
        "같은 위치에 두 사람을 배치할 수 없습니다.",
      );
      positions.add(position);
      if (person.kind === "STUDENT") {
        requireValue(
          !draft.config.staffOnly &&
            person.team === "SINGER" &&
            c.eligibleIds.has(person.id) &&
            !c.excluded.has(person.id),
          "출석한 싱어 학생 중 등단 제외가 아닌 학생만 배치할 수 있습니다.",
        );
        const department =
          draft.overrides.find(
            (o) =>
              o.termStudentId === person.id && o.kind === "MOVE_DEPARTMENT",
          )?.department ?? person.department;
        requireValue(
          department === service.department,
          "다른 부 학생은 먼저 부서 이동 특이사항을 지정해 주세요.",
        );
        const history = c.histories.get(person.id);
        if (history?.stagedPreviousTwo)
          warnings.push(`${person.name}: 3주 연속 등단입니다.`);
        if (a.role === "SINGER" && history?.singerPreviousTwo)
          warnings.push(`${person.name}: 3주 연속 싱어입니다.`);
      } else
        requireValue(
          c.presentStaff.has(person.id) && person.singerCapable,
          "참석한 싱어 스탭만 배치할 수 있습니다.",
        );
      return {
        ...a,
        name: person.name,
        gender: person.gender,
        reason: a.reason || "수동 배정",
        isManual: true,
      };
    });
    const target =
      service.department === "FIRST" ? draft.config.first : draft.config.second;
    if (!draft.config.staffOnly) {
      requireValue(
        assignments.filter((a) => a.personType === "STAFF").length <= 3,
        "인도자를 제외한 지원 스탭은 예배당 최대 3명입니다.",
      );
      for (const role of ["SINGER", "CHOIR"] as const) {
        const actual = assignments.filter((a) => a.role === role).length,
          wanted = role === "SINGER" ? target.singerTarget : target.choirTarget;
        if (actual !== wanted)
          warnings.push(
            `${service.department === "FIRST" ? "1부" : "2부"} ${role === "SINGER" ? "싱어" : "콰이어"} ${actual}명 / 목표 ${wanted}명`,
          );
      }
      const female = assignments.filter(
        (a) => a.role === "SINGER" && a.gender === "FEMALE",
      ).length;
      if (
        female <
        Math.min(target.singerTarget, draft.config.minimumFemaleSingers)
      )
        warnings.push(
          `${service.department === "FIRST" ? "1부" : "2부"}: 권장 여자 싱어 수가 부족합니다.`,
        );
      const candidates = c.students.filter(
        (p) =>
          p.team === "SINGER" &&
          c.eligibleIds.has(p.id) &&
          !c.excluded.has(p.id) &&
          p.id !== draft.config.leaderId &&
          (draft.overrides.find(
            (o) => o.termStudentId === p.id && o.kind === "MOVE_DEPARTMENT",
          )?.department ?? p.department) === service.department,
      );
      const count = assignments.filter(
        (a) => a.personType === "STUDENT",
      ).length;
      if (
        candidates.length &&
        (count / candidates.length < 0.7 || count / candidates.length > 0.8)
      )
        warnings.push(
          `${service.department === "FIRST" ? "1부" : "2부"}: 학생 후보 중 등단 비율이 권장 70~80%와 다릅니다.`,
        );
      for (const forced of draft.overrides.filter(
        (o) => o.kind === "FORCE_STAGE" && o.department === service.department,
      ))
        if (
          !assignments.some(
            (a) =>
              a.personId === forced.termStudentId &&
              (forced.role === "RANDOM" || a.role === forced.role),
          )
        )
          warnings.push("강제 등단 조건 중 배치되지 않은 학생이 있습니다.");
    }
    return { ...service, assignments };
  });
  return {
    services,
    candidates: c.candidates,
    warnings: [...new Set(warnings)],
    leaderName: c.leader.name,
  };
}
