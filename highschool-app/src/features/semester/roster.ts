import type { Application } from "./types";

export type SemesterRosterScope = "team" | "trainingOnly";

/**
 * 출석·수료 화면이 같은 명단 계약을 쓰게 하는 단일 지점.
 * - 사역팀: 취소되지 않았고 팀에 배치된 신청자
 * - 훈련만: 취소되지 않았고 훈련만 신청한 신청자
 */
export function semesterRoster(
  applications: Application[],
  scope: SemesterRosterScope,
): Application[] {
  return applications.filter((application) => {
    if (application.status === "취소") return false;
    if (scope === "trainingOnly") return application.trainingOnly === true;
    return application.trainingOnly !== true && Boolean(application.teamId);
  });
}
