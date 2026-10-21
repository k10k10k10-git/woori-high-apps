import { runManagementSave, ManagementSaveError } from '@/lib/managementSave';
import { mergeStudentEdit, sameStoredValue } from '@/utils/studentPersistence';
import { trashRecordKey } from '@/utils/trash';
import { buildAdminChangeEntry } from '@/utils/adminChange';
import type { Student } from '@/types';

type ArchiveRosterInput = {
  year: number; classKey: string;
  actor: ReturnType<typeof import('@/utils/adminChange').adminActor>;
} & ({ studentId: string; openedStudent: Student } | { studentId?: undefined; openedStudent?: undefined });

/** 확인한 학생의 사본을 먼저 확정한 뒤 최신 명단이 그대로일 때만 제거한다. 출석 원장은 쓰지 않는다. */
export async function archiveRoster(input: ArchiveRosterInput, isCurrent: () => boolean = () => true) {
  const { year, classKey, studentId } = input;
  type StoredClass = { students?: Record<string, Student>; teacher?: string; adminChanges?: Record<string, unknown> };
  const progress: { stage: 'reading' | 'backup' | 'deleting' } = { stage: 'reading' };
  try {
    await runManagementSave(isCurrent, async session => {
      const path = `classes/${year}/${classKey}`;
      const { value: opened } = await session.read<StoredClass | null>(path);
      const value = studentId ? opened?.students?.[studentId] : opened;
      if (!value) throw new ManagementSaveError('conflict', '명단이 이미 변경되었습니다. 현재 반을 다시 확인해 주세요.');
      if (studentId !== undefined && (!studentId || !input.openedStudent || input.openedStudent.id !== studentId
        || !mergeStudentEdit({ ...value, id: studentId } as Student, input.openedStudent, input.openedStudent))) {
        throw new ManagementSaveError('conflict', '학생 연결이 변경되었습니다. 현재 명단을 다시 확인해 주세요.');
      }
      const operation = crypto.randomUUID();
      const copy = { ...value, ...(studentId ? { id: studentId } : {}), ck: classKey, deletedAt: Date.now() };
      const backupPath = `trash/${year}/${studentId ? 'students' : 'classes'}/${trashRecordKey(classKey, studentId ?? 'class', operation)}`;
      const backup = await session.read(backupPath);
      if (backup.value !== null) throw new ManagementSaveError('conflict', '같은 복구 사본이 이미 있습니다. 명단을 다시 확인해 주세요.');
      progress.stage = 'backup';
      await session.write(backupPath, backup.etag, copy);
      progress.stage = 'reading';
      const latest = await session.read<StoredClass | null>(path);
      const current = latest.value;
      let next: StoredClass | null;
      if (!studentId) {
        if (!sameStoredValue(current, opened)) throw new ManagementSaveError('conflict', '다른 담당자가 명단을 변경했습니다. 삭제하지 않았습니다. 복구 사본을 보존했습니다.');
        next = null;
      } else {
        if (!current || !sameStoredValue(current.students?.[studentId], value)) throw new ManagementSaveError('conflict', '다른 담당자가 학생 정보를 변경했습니다. 삭제하지 않았습니다. 복구 사본을 보존했습니다.');
        const students = { ...current.students };
        delete students[studentId];
        const change = buildAdminChangeEntry({ classKey, teacher: current.teacher, student: { ...value, id: studentId } as Student,
          action: '학생 삭제', changeSummary: '학생 명단을 복구 사본으로 보관 · 출석 기록 유지', actor: input.actor });
        next = { ...current, students, adminChanges: { ...current.adminChanges, [operation]: change } };
      }
      progress.stage = 'deleting';
      await session.write(path, latest.etag, next);
    });
  } catch (cause) {
    const kind = cause instanceof ManagementSaveError ? cause.kind : 'unknown';
    if (progress.stage === 'backup') throw new ManagementSaveError(kind, '복구 사본 저장을 확인하지 못해 명단을 삭제하지 않았습니다. 연결 후 명단과 삭제 목록을 확인해 주세요.');
    if (progress.stage === 'deleting' && kind === 'unknown') throw new ManagementSaveError(kind, '삭제 결과를 확인하지 못했습니다. 복구 사본은 보존했습니다. 현재 명단을 먼저 확인해 주세요.');
    throw cause;
  }
}
