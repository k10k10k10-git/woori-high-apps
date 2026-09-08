/** 삭제본 키와 학생 ID를 분리한다. 기존 ID 키도 조회 시 그대로 보존한다. */
export function trashRecordKey(classKey: string, studentId: string, operationId: string): string {
  return [classKey, studentId, operationId].map(encodeURIComponent).join('__');
}

export type TrashEntry<T> = { key: string; value: T };
export function trashEntries<T extends { deletedAt: number }>(raw: Record<string, T> | null | undefined): TrashEntry<T>[] {
  return Object.entries(raw ?? {}).map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value.deletedAt - a.value.deletedAt);
}
