import type { PraisePolicy, PraiseStageConfig } from "./types";
export const DEFAULT_GROUPING = { groupCount: 4, studentMin: 2, studentMax: 10, staffMin: 1, staffMax: 3, clusterGender: false, clusterGrade: false, splitTeam: false };
export const DEFAULT_STAGE: Omit<PraiseStageConfig, "leaderType" | "leaderId" | "staffOnly"> = {
  first: { singerTarget: 6, choirTarget: 6 }, second: { singerTarget: 6, choirTarget: 6 }, studentRatio: .75, minimumFemaleSingers: 3,
};
export function defaultPraisePolicy(at: number, uid: string): PraisePolicy {
  return { grouping: { ...DEFAULT_GROUPING }, rules: [], stage: structuredClone(DEFAULT_STAGE), revision: 1, updatedAt: at, updatedBy: uid };
}
