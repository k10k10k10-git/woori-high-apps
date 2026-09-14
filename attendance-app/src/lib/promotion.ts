import type { Student } from '@/types';
import type { AttendanceYear } from './sheetSync';
import { trashRecordKey } from '@/utils/trash';
import { buildAdminChangeEntry } from '@/utils/adminChange';

type RosterClass = { students?: Record<string, Student>; [key: string]: unknown };
export type PromotionSnapshot = {
  year: number;
  classes: Record<string, Record<string, RosterClass>>;
  attendance: AttendanceYear;
};

/** 미리보기 원본만 사용한다. 최신 여부는 commitSheetSync의 서버 잠금 안에서 검사한다. */
export function buildPromotionPayload(snapshot: PromotionSnapshot, overwrite: boolean, operation: string, actor = '출석부 관리자') {
  const { year, classes, attendance } = snapshot;
  const payload: Record<string, unknown> = {};
  const classKeys: string[] = [];
  let count = 0;
  for (const [fromCk, source] of Object.entries(classes[year - 1] ?? {})) {
    const match = /^(1|2)-([12])-(\d+)$/.exec(fromCk);
    if (!match || !Object.keys(source.students ?? {}).length) continue;
    const toCk = `${match[1]}-${Number(match[2]) + 1}-${match[3]}`;
    const target = classes[year]?.[toCk];
    if (!overwrite && Object.keys(target?.students ?? {}).length) continue;
    for (const [sid, student] of Object.entries(source.students!)) {
      const existing = target?.students?.[sid];
      if ((existing || attendance[toCk]?.[sid] != null)
        && (!existing?.personId || existing.personId !== student.personId)) {
        throw new Error(`${toCk}반의 학생 ID 또는 보관 출석이 다른 인물과 겹칩니다. 기존 기록을 보호하기 위해 진급을 중단했습니다.`);
      }
    }
    if (target) payload[`trash/${year}/classes/${trashRecordKey(toCk, 'roster', operation)}`] = {
      ...target, teacher: typeof target.teacher === 'string' ? target.teacher : '', ck: toCk, deletedAt: Date.now(),
    };
    payload[`classes/${year}/${toCk}/students`] = Object.fromEntries(Object.entries(source.students!).map(([id, student]) => [id, { ...student, id }]));
    payload[`classes/${year}/${toCk}/adminChanges/${operation}`] = buildAdminChangeEntry({
      classKey: toCk, teacher: typeof target?.teacher === 'string' ? target.teacher : '', actor,
      action: '명단 일괄 반영', studentName: `진급 ${Object.keys(source.students!).length}명`,
      changeSummary: `${year - 1}년 ${fromCk}반에서 진급${target ? ' · 기존 명단 사본 보존' : ''}`,
    });
    classKeys.push(toCk);
    count += Object.keys(source.students!).length;
  }
  if (!classKeys.length) throw new Error('진급할 빈 반이 없습니다. 기존 명단 교체가 필요한지 확인해 주세요.');
  return { payload, classKeys, count };
}
