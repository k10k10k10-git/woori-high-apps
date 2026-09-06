import { expect, it } from "vitest";
import { buildStageHistory, type StageHistoryInput } from "./stage-history";
import { latestConfirmedVersions } from "./stage-records";

const input: StageHistoryInput = {
  sundayDate: "2026-09-20",
  plans: [{ id: "p2", sunday_date: "2026-09-13" }, { id: "future", sunday_date: "2026-09-20" }, { id: "p1", sunday_date: "2026-09-06" }],
  versions: [
    { id: "v1", plan_id: "p1", version_no: 1, leader_type: "STUDENT", leader_term_student_id: "leader", kind: "CONFIRMED" },
    { id: "v2-old", plan_id: "p2", version_no: 1, leader_type: "STAFF", leader_term_student_id: null, kind: "CONFIRMED" },
    { id: "v2", plan_id: "p2", version_no: 2, leader_type: "STUDENT", leader_term_student_id: "leader", kind: "CONFIRMED" },
    { id: "draft", plan_id: "p2", version_no: 3, leader_type: "STUDENT", leader_term_student_id: "draft-leader", kind: "MANUAL_DRAFT" },
    { id: "future-v", plan_id: "future", version_no: 1, leader_type: "STUDENT", leader_term_student_id: "future-leader", kind: "CONFIRMED" },
  ],
  services: [{ id: "svc1", version_id: "v1" }, { id: "svc2-a", version_id: "v2" }, { id: "svc2-b", version_id: "v2" }, { id: "old", version_id: "v2-old" }],
  assignments: [
    { service_id: "svc1", term_student_id: "singer", person_type: "STUDENT", role: "SINGER" },
    { service_id: "svc2-a", term_student_id: "singer", person_type: "STUDENT", role: "SINGER" },
    { service_id: "svc2-b", term_student_id: "singer", person_type: "STUDENT", role: "SINGER" },
    { service_id: "old", term_student_id: "superseded", person_type: "STUDENT", role: "SINGER" },
    { service_id: "svc2-a", term_student_id: "staff-id", person_type: "STAFF", role: "SINGER" },
  ],
  candidates: [
    { version_id: "v2", term_student_id: "resting", eligible: true, person_type: "STUDENT" },
    { version_id: "v1", term_student_id: "only-old-candidate", eligible: true, person_type: "STUDENT" },
    { version_id: "v2", term_student_id: "ineligible", eligible: false, person_type: "STUDENT" },
  ],
};

it("최신 확정본만 세고 1·2부 중복·과거 재확정본·스탭·현재 주차를 제외한다", () => {
  const original = JSON.stringify(input);
  const history = buildStageHistory(input);
  expect(history.singer).toEqual({ totalCount: 2, singerCount: 2, stagedPreviousTwo: true, singerPreviousTwo: true, missedPrevious: false });
  expect(Object.keys(history).sort()).toEqual(["leader", "resting", "singer"]);
  expect(JSON.stringify(input)).toBe(original);
});

it("학생 인도자는 등단 횟수에 포함하고 지난 확정본 후보의 미등단만 식별한다", () => {
  const history = buildStageHistory(input);
  expect(history.leader).toEqual({ totalCount: 2, singerCount: 0, stagedPreviousTwo: true, singerPreviousTwo: false, missedPrevious: false });
  expect(history.resting).toEqual({ totalCount: 0, singerCount: 0, stagedPreviousTwo: false, singerPreviousTwo: false, missedPrevious: true });
  expect(buildStageHistory({ ...input, versions: [] })).toEqual({});
});

it("명시 초안은 최신 확정본을 대신하지 않고 한 주 기록만으로 연속 2주를 만들지 않는다", () => {
  expect(latestConfirmedVersions(input.versions).get("p2")?.id).toBe("v2");
  const history = buildStageHistory({ ...input, plans: input.plans.filter((plan) => plan.id === "p1") });
  expect(history.singer.totalCount).toBe(1);
  expect(history.singer.stagedPreviousTwo).toBe(false);
  expect(history.singer.singerPreviousTwo).toBe(false);
});
