import { onValue, ref, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { snapToList } from "@/lib/db/core";
import type { Milestone } from "@/lib/types";
import {
  MAX_SECTIONS,
  parseSeatingPlans,
  seatingRecords,
  type SeatSection,
  type SeatingPlans,
  type WorshipService,
} from "./worshipSeating";

// Rules를 바꾸지 않기 위해 사역 가이드와 같은 공유 노드(prepMilestones)를 쓴다.
// 이 노드는 일정 화면도 읽으므로 sourceSite로 서로를 걸러낸다(worshipSeating.ts 참고).

export function subscribeToSeatingPlans(
  callback: (plans: SeatingPlans) => void,
  onError?: (error: Error) => void,
) {
  return onValue(
    ref(db, paths.prepMilestones()),
    (snapshot) => callback(parseSeatingPlans(snapToList<Milestone>(snapshot))),
    (error) => { callback({}); onError?.(error); },
  );
}

/**
 * 한 부의 배치를 저장한다. 분단이 줄었으면 남은 레코드도 같은 update에서 지워
 * 화면에 없는 분단이 DB에만 남는 상태를 만들지 않는다.
 */
export async function saveSeatingPlan(
  week: string,
  service: WorshipService,
  sections: SeatSection[],
) {
  const updates = Object.fromEntries(
    seatingRecords(week, service, sections, MAX_SECTIONS).map((record) => [
      paths.prepMilestone(record.id),
      record.value,
    ]),
  );
  await update(ref(db), updates);
}
