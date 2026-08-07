import { describe, expect, it } from "vitest";
import {
  canApplyMinistryWithoutTraining,
  deriveTrainingOnly,
  isSecondSemester,
  validateIntake,
} from "./intakeRule";

const student = (grade: number) => ({ grade, bu: "1부" });
const staff = { grade: 0, bu: "스탭" };

describe("isSecondSemester", () => {
  it("학기 id 끝자리로 판정한다", () => {
    expect(isSecondSemester("2026-2")).toBe(true);
    expect(isSecondSemester("2026-1")).toBe(false);
  });
});

describe("validateIntake — 사역팀은 훈련이 전제", () => {
  it("훈련 O + 사역팀 O 은 허용한다", () => {
    expect(validateIntake({ trainingClassId: "t1", ministryChoice1: "m1" }, student(1), "2026-1"))
      .toEqual({ ok: true });
  });

  it("훈련 O + 사역팀 X (훈련만 신청) 은 허용한다", () => {
    expect(validateIntake({ trainingClassId: "t1", ministryChoice1: "" }, student(2), "2026-1"))
      .toEqual({ ok: true });
  });

  it("훈련 X + 사역팀 X 는 신청 자체를 막는다", () => {
    const result = validateIntake({ trainingClassId: "", ministryChoice1: "" }, student(1), "2026-1");
    expect(result.ok).toBe(false);
  });

  it("훈련 X + 사역팀 O 는 원칙 위반으로 막는다", () => {
    const result = validateIntake({ trainingClassId: "", ministryChoice1: "m1" }, student(1), "2026-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("훈련을 신청해야");
  });
});

describe("고3 2학기 예외", () => {
  it("고3 2학기는 훈련 없이 사역팀만 신청할 수 있다", () => {
    const result = validateIntake({ trainingClassId: "", ministryChoice1: "m1" }, student(3), "2026-2");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.hint).toContain("고3 2학기");
  });

  it("고3이라도 1학기에는 예외가 아니다", () => {
    expect(canApplyMinistryWithoutTraining(student(3), "2026-1")).toBe(false);
    expect(validateIntake({ trainingClassId: "", ministryChoice1: "m1" }, student(3), "2026-1").ok).toBe(false);
  });

  it("2학기라도 고1·고2는 예외가 아니다", () => {
    expect(canApplyMinistryWithoutTraining(student(1), "2026-2")).toBe(false);
    expect(canApplyMinistryWithoutTraining(student(2), "2026-2")).toBe(false);
  });

  it("고3 2학기도 훈련을 함께 신청할 수 있다", () => {
    expect(validateIntake({ trainingClassId: "t1", ministryChoice1: "m1" }, student(3), "2026-2"))
      .toEqual({ ok: true });
  });

  it("스탭은 학기와 무관하게 훈련 없이 사역팀에 들어간다", () => {
    expect(canApplyMinistryWithoutTraining(staff, "2026-1")).toBe(true);
  });
});

describe("스탭(교사)은 지망 없이 팀 배정만 받는다", () => {
  it("팀을 고르면 통과한다", () => {
    expect(validateIntake({ trainingClassId: "", ministryChoice1: "", assignedTeamId: "team-a" }, staff, "2026-1"))
      .toEqual({ ok: true });
  });

  it("팀을 고르지 않으면 막는다", () => {
    const result = validateIntake({ trainingClassId: "", ministryChoice1: "", assignedTeamId: "" }, staff, "2026-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("사역팀을 선택");
  });

  it("팀 배정은 훈련만 신청으로 저장되지 않는다", () => {
    expect(deriveTrainingOnly({ trainingClassId: "", ministryChoice1: "", assignedTeamId: "team-a" })).toBe(false);
    expect(deriveTrainingOnly({ trainingClassId: "t1", ministryChoice1: "", assignedTeamId: "team-a" })).toBe(false);
  });
});

describe("deriveTrainingOnly", () => {
  it("훈련만 신청한 경우에만 참이다 (기존 출석·수료 명단 계약 유지)", () => {
    expect(deriveTrainingOnly({ trainingClassId: "t1", ministryChoice1: "" })).toBe(true);
    expect(deriveTrainingOnly({ trainingClassId: "t1", ministryChoice1: "m1" })).toBe(false);
    expect(deriveTrainingOnly({ trainingClassId: "", ministryChoice1: "m1" })).toBe(false);
  });
});
