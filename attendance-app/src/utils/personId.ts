export type PersonKind = 'student' | 'teacher' | 'staff';

export function createPersonId(kind: PersonKind, randomUUID = () => globalThis.crypto.randomUUID()): string {
  return `person_${kind}_${randomUUID().replace(/-/g, '').toLowerCase()}`;
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const digits = (value: unknown) => text(value).replace(/\D/g, '');
export const normalizeName = (value: unknown) => text(value).replace(/^\d+/, '').replace(/\s+/g, '').replace(/^(.+[가-힣])[A-Z]$/, '$1');

type HistoricalRecord = { name?: unknown; birth?: unknown; phone?: unknown; personId?: unknown };
type HistoricalStudentRecord = HistoricalRecord & { year: number; classKey: string; bu: number; grade: number };
export type HistoricalStudentContext = { year: number | string; classKey: string; allowSameYearClassMatch?: boolean };

function collectNamedRecords(value: unknown, output: HistoricalRecord[]) {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (text(record.name)) {
    output.push(record);
    return;
  }
  Object.values(record).forEach((child) => collectNamedRecords(child, output));
}

export function findHistoricalPersonId(kind: Exclude<PersonKind, 'student'>, input: HistoricalRecord, roots: unknown[]): string | null {
  const name = normalizeName(input.name);
  const birth = digits(input.birth);
  const phone = digits(input.phone);
  if (name.length < 2 || (birth.length < 6 && phone.length < 8)) return null;

  const records: HistoricalRecord[] = [];
  roots.forEach((root) => collectNamedRecords(root, records));
  const ids = new Set<string>();
  for (const record of records) {
    const personId = text(record.personId);
    if (!personId.startsWith(`person_${kind}_`) || normalizeName(record.name) !== name) continue;
    const otherBirth = digits(record.birth);
    const otherPhone = digits(record.phone);
    const birthConflict = birth.length >= 6 && otherBirth.length >= 6 && birth !== otherBirth;
    const phoneMatches = phone.length >= 8 && otherPhone.length >= 8 && phone === otherPhone;
    const birthMatches = birth.length >= 6 && otherBirth.length >= 6 && birth === otherBirth;
    if ((phoneMatches && !birthConflict) || birthMatches) ids.add(personId);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

function collectHistoricalStudents(value: unknown, output: HistoricalStudentRecord[]) {
  if (!value || typeof value !== 'object') return;
  for (const [yearKey, yearValue] of Object.entries(value as Record<string, unknown>)) {
    const year = Number(yearKey);
    if (!Number.isInteger(year) || !yearValue || typeof yearValue !== 'object') continue;
    for (const [classKey, classValue] of Object.entries(yearValue as Record<string, unknown>)) {
      const parsed = classKey.match(/^(1|2)-(\d+)-(\d+)$/);
      if (!parsed || !classValue || typeof classValue !== 'object') continue;
      const students = (classValue as Record<string, unknown>).students;
      if (!students || typeof students !== 'object') continue;
      for (const record of Object.values(students as Record<string, unknown>)) {
        if (!record || typeof record !== 'object') continue;
        output.push({
          ...(record as HistoricalRecord),
          year,
          classKey,
          bu: Number(parsed[1]),
          grade: Number(parsed[2]),
        });
      }
    }
  }
}

export function findHistoricalStudentPersonId(
  input: HistoricalRecord,
  roots: unknown[],
  context: HistoricalStudentContext,
): string | null {
  const name = normalizeName(input.name);
  const birth = digits(input.birth);
  const targetYear = Number(context.year);
  const targetClass = context.classKey.match(/^(1|2)-(\d+)-(\d+)$/);
  if (name.length < 2 || birth.length < 6 || !Number.isInteger(targetYear) || !targetClass) return null;

  const records: HistoricalStudentRecord[] = [];
  roots.forEach((root) => collectHistoricalStudents(root, records));
  const candidates = records.filter((record) => normalizeName(record.name) === name && digits(record.birth) === birth);
  const byYear = new Map<number, HistoricalStudentRecord[]>();
  candidates.forEach((record) => byYear.set(record.year, [...(byYear.get(record.year) ?? []), record]));
  if ([...byYear.values()].some((sameYear) => sameYear.length > 1)) return null;

  const sameYear = byYear.get(targetYear) ?? [];
  if (sameYear.length > 0) {
    if (!context.allowSameYearClassMatch || sameYear[0].classKey !== context.classKey) return null;
    const currentId = text(sameYear[0].personId);
    return currentId.startsWith('person_student_') ? currentId : null;
  }

  const targetBu = Number(targetClass[1]);
  const targetGrade = Number(targetClass[2]);
  const ids = new Set(candidates
    .filter((record) => record.bu === targetBu && targetGrade - record.grade === targetYear - record.year)
    .map((record) => text(record.personId))
    .filter((personId) => personId.startsWith('person_student_')));
  return ids.size === 1 ? [...ids][0] : null;
}
