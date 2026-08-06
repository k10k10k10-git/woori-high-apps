// 접수 원칙 — 순수 함수 (firebase 의존 없음).
//
// 고등부 사역팀 원칙: **훈련을 신청해야 사역팀을 신청할 수 있다.**
//   훈련 O + 사역팀 O  → 허용
//   훈련 O + 사역팀 X  → 허용 (훈련만 신청)
//   훈련 X + 사역팀 X  → 신청 자체가 없음(거부)
//   훈련 X + 사역팀 O  → 거부
//
// 예외: **고3은 2학기에 훈련 없이도 사역팀을 신청할 수 있다**(훈련도 하면 가장 좋다).
// 스탭은 학생 훈련 과정 대상이 아니므로 같은 예외로 둔다.

import { STAFF_BU } from "./applicant";

export type IntakeSelection = {
  /** 훈련 반 id — 빈 문자열이면 훈련 미신청 */
  trainingClassId: string;
  /** 사역팀 1지망 id — 빈 문자열이면 사역팀 미지원 */
  ministryChoice1: string;
};

export type IntakePerson = {
  grade: number;
  bu: string;
};

export type IntakeCheck =
  | { ok: true; hint?: string }
  | { ok: false; message: string };

/** 학기 id "2026-2" → 2학기 */
export function isSecondSemester(semesterId: string): boolean {
  return /-2$/.test(semesterId.trim());
}

/** 훈련 없이 사역팀만 신청할 수 있는 대상인가 (고3 2학기 / 스탭) */
export function canApplyMinistryWithoutTraining(person: IntakePerson, semesterId: string): boolean {
  if (person.bu === STAFF_BU) return true;
  return person.grade === 3 && isSecondSemester(semesterId);
}

export function validateIntake(
  selection: IntakeSelection,
  person: IntakePerson,
  semesterId: string,
): IntakeCheck {
  const wantsTraining = selection.trainingClassId.trim() !== "";
  const wantsMinistry = selection.ministryChoice1.trim() !== "";

  if (!wantsTraining && !wantsMinistry) {
    return { ok: false, message: "훈련 반 또는 사역팀 1지망 중 하나는 선택해야 합니다." };
  }

  if (wantsMinistry && !wantsTraining) {
    if (!canApplyMinistryWithoutTraining(person, semesterId)) {
      return {
        ok: false,
        message: "훈련을 신청해야 사역팀에 지원할 수 있습니다. (고3 2학기·스탭만 예외)",
      };
    }
    return {
      ok: true,
      hint: person.bu === STAFF_BU
        ? "스탭은 훈련 없이 사역팀만 신청할 수 있습니다."
        : "고3 2학기라 훈련 없이 사역팀만 신청할 수 있습니다. 훈련도 함께 하면 가장 좋아요.",
    };
  }

  return { ok: true };
}

/**
 * 저장할 `trainingOnly` 값 — 출석·수료 명단이 계속 쓰는 기존 계약이라 파생해서 유지한다.
 * (훈련은 신청했지만 사역팀에는 지원하지 않은 사람)
 */
export function deriveTrainingOnly(selection: IntakeSelection): boolean {
  return selection.trainingClassId.trim() !== "" && selection.ministryChoice1.trim() === "";
}
