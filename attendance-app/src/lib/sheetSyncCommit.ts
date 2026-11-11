import { RTDB_REST_URL } from '@/lib/rtdbRest';
import { auth } from '@/lib/firebase/client';
import { db, get, ref, syncProtocolDb, onDisconnect } from '@/lib/db';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';
import { sameStoredValue } from '@/utils/studentPersistence';
import { patchStudentMoveOnce, readStudentMoveValue } from '@/utils/studentMoveRequest';

/** 기존 반 이동 잠금 계약을 재사용한다. 소유 UID의 일반 쓰기도 Rules에서 차단한다. */
export function claimSyncLocks(current: Record<string, unknown> | null, keys: string[], uid: string, operation: string, startedAt: number) {
  if (keys.some(key => current?.[key] != null)) return undefined;
  const next = { ...current };
  for (const key of keys) next[key] = { [uid]: { [operation]: {
    phase: 'preparing', startedAt, fromCk: key,
    toCk: keys.find(other => other !== key) ?? `${key}:sheet-sync`, sid: '__sheet_sync__',
  } } };
  return next;
}

export async function commitSheetSync(input: {
  year: number; classKeys: string[]; classes: unknown; attendance: unknown;
  payload: Record<string, unknown>;
}) {
  return withBrowserWriteLock('exclusive', () => commitLockedSheetSync(input));
}
async function commitLockedSheetSync(input: {
  year: number; classKeys: string[]; classes: unknown; attendance: unknown; payload: Record<string, unknown>;
}) {
  const { runTransaction } = syncProtocolDb;
  const user = auth.currentUser;
  if (!user) throw new Error('다시 로그인해 주세요.');
  const token = await user.getIdToken();
  const keys = [...new Set(input.classKeys)];
  const operation = `sheet_${crypto.randomUUID()}`;
  const lockRef = ref(db, `config/studentMoveLocks/${input.year}`);
  const cleanup = Object.fromEntries(keys.map(key => [`${key}/${user.uid}/${operation}`, null]));
  const disconnect = onDisconnect(lockRef);
  let acquired = false, uncertain = false;
  async function checkFresh() {
    const read = (path: string) => readStudentMoveValue({
      databaseUrl: RTDB_REST_URL, idToken: token,
      path, isCurrent: () => auth.currentUser === user,
    });
    const [classes, attendance] = await Promise.all([
      read('classes'), read(`attendance/${input.year}`),
    ]);
    if (!sameStoredValue(classes ?? {}, input.classes)
      || !sameStoredValue(attendance ?? {}, input.attendance)) {
      throw new Error('미리보기 이후 명단·출석이 변경되었습니다. 다시 미리보기해 주세요.');
    }
  }
  try {
    await disconnect.update(cleanup);
    await get(lockRef);
    const result = await runTransaction(lockRef,
      current => claimSyncLocks(current, keys, user.uid, operation, Date.now()), { applyLocally: false });
    if (!result.committed) throw new Error('관련 반에서 다른 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.');
    acquired = true;
    await disconnect.update(cleanup);
    await checkFresh();
    // 전송 이후에는 지연 요청과 잠금 해제가 경합하지 않도록 종료 예약을 취소한다.
    await disconnect.cancel();
    await checkFresh();
    if (auth.currentUser !== user) throw new Error('로그인 계정이 변경되었습니다. 다시 시도해 주세요.');
    const resultPatch = await patchStudentMoveOnce({
      databaseUrl: RTDB_REST_URL, idToken: token,
      payload: { ...input.payload, ...Object.fromEntries(Object.entries(cleanup)
        .map(([path, value]) => [`config/studentMoveLocks/${input.year}/${path}`, value])),
        ...Object.fromEntries(keys.map(key => [`config/rosterBatchCommits/${input.year}/${key}/${user.uid}/${operation}`, true])),
      },
    });
    if (resultPatch.status === 'unknown') {
      uncertain = true;
      throw new Error('동기화 반영 여부가 불명확해 잠금을 보존했습니다. 재적용하지 말고 관리자에게 원장·잠금 확인을 요청해 주세요.');
    }
    if (resultPatch.status === 'rejected') throw new Error('서버가 동기화 요청을 거절했습니다. 권한과 최신 명단을 확인해 주세요.');
    acquired = false;
  } finally {
    if (acquired && !uncertain) {
      await runTransaction(lockRef, current => {
        if (!current) return current;
        for (const key of keys) {
          if (!current[key]?.[user.uid]?.[operation]) continue;
          delete current[key][user.uid][operation];
          if (!Object.keys(current[key][user.uid]).length) delete current[key][user.uid];
          if (!Object.keys(current[key]).length) delete current[key];
        }
        return current;
      }, { applyLocally: false });
    }
    await disconnect.cancel().catch(() => { /* 원장 반영 결과를 예약 취소 오류로 바꾸지 않는다. */ });
  }
}
