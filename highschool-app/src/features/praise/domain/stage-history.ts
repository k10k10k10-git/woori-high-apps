/** 원본 lib/stage-history.ts의 집계만 분리. DB 조회는 호출자가 수행한다. 원본 커밋은 THIRD_PARTY.md 참조. */
import type { StageHistory } from "./stage";
import { latestConfirmedVersions, type RecordVersion } from "./stage-records";

export type StageHistoryInput = {
  plans: { id: string; sunday_date: string }[];
  versions: (RecordVersion & { kind?: "AUTO_DRAFT" | "MANUAL_DRAFT" | "CONFIRMED" })[];
  services: { id: string; version_id: string }[];
  assignments: { service_id: string; term_student_id: string | null; person_type: string; role: string }[];
  candidates: { version_id: string; term_student_id: string | null; eligible: boolean; person_type: string }[];
  sundayDate: string;
};

/** 날짜별 최신 확정본만 합산한다. 같은 날 1·2부 중복 등단은 한 번으로 센다. */
export function buildStageHistory(input: StageHistoryInput): Record<string, StageHistory> {
  const plans = input.plans.filter((plan) => plan.sunday_date < input.sundayDate)
    .sort((left, right) => right.sunday_date.localeCompare(left.sunday_date) || left.id.localeCompare(right.id));
  const planIds = new Set(plans.map((plan) => plan.id));
  const latest = latestConfirmedVersions(input.versions.filter((version) => planIds.has(version.plan_id) && (!version.kind || version.kind === "CONFIRMED")));
  const versions = plans.map((plan) => latest.get(plan.id)).filter((version): version is RecordVersion => Boolean(version));
  if (!versions.length) return {};
  const versionIds = new Set(versions.map((version) => version.id));
  const versionByService = new Map(input.services.filter((service) => versionIds.has(service.version_id)).map((service) => [service.id, service.version_id]));
  const stageSets = new Map<string, Set<string>>();
  const singerSets = new Map<string, Set<string>>();
  for (const version of versions) {
    stageSets.set(version.id, new Set(version.leader_type === "STUDENT" && version.leader_term_student_id ? [version.leader_term_student_id] : []));
    singerSets.set(version.id, new Set());
  }
  for (const row of input.assignments) {
    if (row.person_type !== "STUDENT" || !row.term_student_id) continue;
    const versionId = versionByService.get(row.service_id);
    if (!versionId) continue;
    stageSets.get(versionId)?.add(row.term_student_id);
    if (row.role === "SINGER") singerSets.get(versionId)?.add(row.term_student_id);
  }
  const previousId = versions[0].id;
  const eligible = new Set(input.candidates.filter((row) => row.version_id === previousId && row.person_type === "STUDENT" && row.eligible && row.term_student_id).map((row) => row.term_student_id as string));
  const allIds = new Set<string>(eligible);
  for (const set of stageSets.values()) for (const id of set) allIds.add(id);
  return Object.fromEntries([...allIds].map((id) => [id, {
    totalCount: [...stageSets.values()].filter((set) => set.has(id)).length,
    singerCount: [...singerSets.values()].filter((set) => set.has(id)).length,
    stagedPreviousTwo: versions.length >= 2 && versions.slice(0, 2).every((version) => stageSets.get(version.id)?.has(id)),
    singerPreviousTwo: versions.length >= 2 && versions.slice(0, 2).every((version) => singerSets.get(version.id)?.has(id)),
    missedPrevious: eligible.has(id) && !stageSets.get(previousId)?.has(id),
  }]));
}
