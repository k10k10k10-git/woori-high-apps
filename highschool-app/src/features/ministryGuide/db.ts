import { onValue, ref } from "firebase/database";
import { auditedUpdate as update } from "@/features/activityLog/write";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { snapToList } from "@/lib/db/core";
import type { Milestone } from "@/lib/types";
import type { MinistryGuideSection, MonthlyMinistry } from "./ministryGuideContent";
import {
  ministryGuideSectionRecords,
  monthlyMinistryRecord,
  parseMinistryGuideOverrides,
  type MinistryGuideOverrides,
} from "./ministryGuidePersistence";

export function subscribeToMinistryGuideOverrides(
  callback: (value: MinistryGuideOverrides) => void,
  onError?: (error: Error) => void,
) {
  return onValue(
    ref(db, paths.prepMilestones()),
    (snapshot) => callback(parseMinistryGuideOverrides(snapToList<Milestone>(snapshot))),
    (error) => { callback({ monthly: {}, sections: {} }); onError?.(error); },
  );
}

export async function saveMonthlyMinistry(year: number, item: MonthlyMinistry) {
  const record = monthlyMinistryRecord(year, item);
  await update(ref(db), { [paths.prepMilestone(record.id)]: record.value });
}

export async function saveMinistryGuideSection(section: MinistryGuideSection) {
  const updates = Object.fromEntries(
    ministryGuideSectionRecords(section).map((record) => [paths.prepMilestone(record.id), record.value]),
  );
  await update(ref(db), updates);
}
