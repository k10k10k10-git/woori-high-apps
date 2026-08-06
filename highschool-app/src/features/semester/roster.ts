import type { Application } from "./types";

export type SemesterRosterScope = "team" | "training";

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
