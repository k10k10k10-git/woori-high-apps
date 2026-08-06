// 훈련 반 삭제의 참조 정리 — 순수 함수 (teamRemoval과 같은 패턴).
// 반만 지우면 신청자에 유령 훈련 반 id가 남아 명단·집계가 어긋난다.

import { paths } from "./paths";
import type { Application } from "./types";

export interface TrainingClassRemovalImpact {
  enrolled: number;
}

export function trainingClassRemovalImpact(
  applications: Application[],
  trainingClassId: string,
): TrainingClassRemovalImpact {
  return {
    enrolled: applications.filter((app) => app.trainingClassId === trainingClassId).length,
  };
}

/** 훈련 반 삭제를 위한 루트 다중 경로 update payload */
export function buildTrainingClassRemovalUpdates(
  sid: string,
  trainingClassId: string,
  applications: Record<string, Omit<Application, "id">>,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    [paths.trainingClass(sid, trainingClassId)]: null,
  };

  for (const [appKey, app] of Object.entries(applications)) {
    if (app.trainingClassId !== trainingClassId) continue;
    // 반 배정만 비운다. 훈련 신청 사실(trainingOnly)은 사용자가 다시 판단할 몫이라 건드리지 않는다.
    updates[`${paths.application(sid, appKey)}/trainingClassId`] = null;
  }

  return updates;
}
