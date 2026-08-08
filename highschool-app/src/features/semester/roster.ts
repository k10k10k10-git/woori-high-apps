import { STAFF_BU } from "./applicant";
import type { Application } from "./types";

export type SemesterRosterScope = "team" | "training";

/** 교사·스탭 신청인가 — 학생과 화면에서 분리하거나 수료 대상에서 빼는 판정의 단일 지점. */
export function isStaffApplication(application: { bu: string }): boolean {
  return application.bu === STAFF_BU;
}

/** 학생 먼저, 스탭 나중 — 두 묶음으로 나눈다(순서는 호출부의 정렬을 그대로 유지). */
export function splitStudentsAndStaff<T extends { bu: string }>(people: T[]): { students: T[]; staff: T[] } {
  return {
    students: people.filter((person) => !isStaffApplication(person)),
    staff: people.filter((person) => isStaffApplication(person)),
  };
}

/** 훈련 신청자인가 — 훈련 반이 배정됐거나, 훈련 반 도입 전의 "훈련만 신청"(레거시) */
export function isTrainingApplicant(application: Application): boolean {
  return Boolean(application.trainingClassId) || application.trainingOnly === true;
}

/**
 * 출석·수료 화면이 같은 명단 계약을 쓰게 하는 단일 지점.
 * - 사역팀: 취소되지 않았고 팀에 배치된 신청자
 * - 훈련: 취소되지 않은 훈련 신청자 전원 (사역팀을 함께 하는 사람도 훈련 출석 대상이다)
 */
export function semesterRoster(
  applications: Application[],
  scope: SemesterRosterScope,
): Application[] {
  return applications.filter((application) => {
    if (application.status === "취소") return false;
    if (scope === "training") return isTrainingApplicant(application);
    return application.trainingOnly !== true && Boolean(application.teamId);
  });
}

/**
 * 수료 대상 명단 — 출석 명단에서 **교사·스탭을 뺀다**.
 * 스탭은 훈련·사역팀 수료의 대상이 아니라 운영 인력이므로 수료율에 섞이면 분모가 틀어진다.
 * 출석부는 스탭도 함께 기록하되 화면에서 학생과 구분해 보여준다(semesterRoster는 그대로 쓴다).
 */
export function completionRoster(
  applications: Application[],
  scope: SemesterRosterScope,
): Application[] {
  return semesterRoster(applications, scope).filter((application) => !isStaffApplication(application));
}
