import { db, get, ref, runTransaction, set } from '@/lib/db';
import { sameStoredValue } from '@/utils/studentPersistence';
import { trashRecordKey } from '@/utils/trash';
import { buildAdminChangeEntry } from '@/utils/adminChange';
import type { Student } from '@/types';

/** 사본을 먼저 확정한 뒤 최신 명단이 그대로일 때만 제거한다. 출석 원장은 쓰지 않는다. */
export async function archiveRoster(input: {
  year: number; classKey: string; studentId?: string; personId?: string;
  actor: ReturnType<typeof import('@/utils/adminChange').adminActor>;
}) {
  const { year, classKey, studentId } = input;
  const target = ref(db, `classes/${year}/${classKey}`);
  const snapshot = await get(target);
  const opened = snapshot.val();
  const value = studentId ? opened?.students?.[studentId] : opened;
  if (!value) throw new Error('명단이 이미 변경되었습니다. 현재 반을 다시 확인해 주세요.');
  if (input.personId && value.personId !== input.personId) throw new Error('학생 연결이 변경되었습니다. 현재 명단을 다시 확인해 주세요.');
  const operation = crypto.randomUUID();
  const copy = { ...value, ...(studentId ? { id: studentId } : {}), ck: classKey, deletedAt: Date.now() };
  const backup = ref(db, `trash/${year}/${studentId ? 'students' : 'classes'}/${trashRecordKey(classKey, studentId ?? 'class', operation)}`);
  await set(backup, copy).catch(() => { throw new Error('복구 사본 저장을 확인하지 못해 명단을 삭제하지 않았습니다. 연결을 확인해 주세요.'); });
  const change = studentId ? buildAdminChangeEntry({ classKey, teacher: opened.teacher,
    student: { ...value, id: studentId } as Student, action: '학생 삭제',
    changeSummary: '학생 명단을 복구 사본으로 보관 · 출석 기록 유지', actor: input.actor }) : null;
  const result = await runTransaction(target, current => {
    if (!studentId) return sameStoredValue(current, opened) ? null : undefined;
    if (!current || !sameStoredValue(current.students?.[studentId], value)) return undefined;
    const students = { ...current.students };
    delete students[studentId];
    return { ...current, students, adminChanges: { ...current.adminChanges, [operation]: change } };
  }, { applyLocally: false }).catch(() => { throw new Error('삭제 결과를 확인하지 못했습니다. 복구 사본은 보존했습니다. 현재 명단을 먼저 확인해 주세요.'); });
  if (!result.committed) {
    // 확실한 거절일 때만 이번 사본을 정리한다. 응답 유실·연결 실패는 복구 사본을 보존한다.
    await runTransaction(backup, current => sameStoredValue(current, copy) ? null : undefined, { applyLocally: false }).catch(() => {});
    throw new Error('다른 담당자가 명단을 변경했습니다. 삭제하지 않았습니다. 최신 명단을 확인해 주세요.');
  }
}
