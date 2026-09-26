import { db, ref, onValue } from './db';
import type { PublicReportFriend } from './pastoralFriendProgress';
export type { PublicReportFriend } from './pastoralFriendProgress';

/** 기존 공개 새친구 원장만 투영한다. 비공개 연락처·심방 메모는 조회하지 않는다. */
export function subscribeReportFriends(year: number, receive: (friends: PublicReportFriend[]) => void, fail: (error: Error) => void) {
  // 통합 앱이 생성하는 학기 ID 계약은 YYYY-1/2이며 주일 작업공간은 YYYY-sunday다.
  const workspaces = [`${year}-1`, `${year}-2`, `${year}-sunday`];
  const results = new Map<string, PublicReportFriend[]>();
  let failed = false;
  const stops = workspaces.map(workspace => onValue(ref(db, `semesters/${workspace}/newFriends`), snapshot => {
    if (failed) return;
    const friends: PublicReportFriend[] = [];
    snapshot.forEach(child => {
        const value = child.val();
        if (!value || typeof value.name !== 'string') return;
        const created = typeof value.createdAt === 'string' ? Date.parse(value.createdAt) : NaN;
        friends.push({ key: `${workspace}/${child.key}`, name: value.name,
          part: String(value.part ?? '').replace('부', ''), grade: String(value.grade ?? ''),
          school: typeof value.school === 'string' ? value.school : undefined,
          owner: typeof value.owner === 'string' ? value.owner : undefined,
          createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
          registeredDate: typeof value.registeredDate === 'string' && value.registeredDate ? value.registeredDate
            : Number.isFinite(created) ? new Date(created + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
              : typeof value.createdAt === 'string' ? value.createdAt.slice(0, 10) : undefined,
          week1Date: typeof value.week1Date === 'string' ? value.week1Date : undefined,
          week2Date: typeof value.week2Date === 'string' ? value.week2Date : undefined,
          decision: typeof value.decision === 'string' ? value.decision : undefined,
          assignedClassKey: typeof value.assignedClassKey === 'string' ? value.assignedClassKey : undefined,
          giftDate: typeof value.giftDate === 'string' ? value.giftDate : undefined,
          rosterSync: value.rosterSync && typeof value.rosterSync.studentId === 'string' && typeof value.rosterSync.classKey === 'string'
            ? { studentId: value.rosterSync.studentId, classKey: value.rosterSync.classKey,
              personId: typeof value.rosterSync.personId === 'string' ? value.rosterSync.personId : undefined,
              syncedAt: typeof value.rosterSync.syncedAt === 'string' ? value.rosterSync.syncedAt : undefined } : undefined });
    });
    results.set(workspace, friends);
    if (results.size === workspaces.length) receive([...results.values()].flat());
  }, error => { failed = true; results.clear(); fail(error); }));
  return () => { failed = true; stops.forEach(stop => stop()); results.clear(); };
}
