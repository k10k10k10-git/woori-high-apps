import { paths } from "./paths";
import { Application } from "./types";

export interface TeamRemovalImpact {
  assigned: number;
  firstChoice: number;
  secondChoice: number;
}

export function teamRemovalImpact(applications: Application[], teamId: string): TeamRemovalImpact {
  return applications.reduce<TeamRemovalImpact>(
    (impact, app) => ({
      assigned: impact.assigned + (app.teamId === teamId ? 1 : 0),
      firstChoice: impact.firstChoice + (app.choice1 === teamId ? 1 : 0),
      secondChoice: impact.secondChoice + (app.choice2 === teamId ? 1 : 0),
    }),
    { assigned: 0, firstChoice: 0, secondChoice: 0 },
  );
}

/**
 * 팀 삭제를 위한 루트 다중 경로 update payload.
 * 팀·커리큘럼·신청자 참조를 한 번에 적용해 중간 실패 시 유령 배치가 남지 않게 한다.
 */
export function buildTeamRemovalUpdates(
  sid: string,
  teamId: string,
  applications: Record<string, Omit<Application, "id">>,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    [paths.team(sid, teamId)]: null,
    [paths.curriculum(sid, teamId)]: null,
  };

  for (const [appKey, app] of Object.entries(applications)) {
    const appPath = paths.application(sid, appKey);
    if (app.teamId === teamId) {
      updates[`${appPath}/teamId`] = null;
      if (app.status === "배치") updates[`${appPath}/status`] = "접수";
    }
    if (app.choice1 === teamId) updates[`${appPath}/choice1`] = null;
    if (app.choice2 === teamId) updates[`${appPath}/choice2`] = null;
  }

  return updates;
}
