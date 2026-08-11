export type PersonKind = 'student' | 'teacher' | 'staff';

export function createPersonId(kind: PersonKind, randomUUID = () => globalThis.crypto.randomUUID()): string {
  return `person_${kind}_${randomUUID().replace(/-/g, '').toLowerCase()}`;
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const digits = (value: unknown) => text(value).replace(/\D/g, '');
const normalizeName = (value: unknown) => text(value).replace(/^\d+/, '').replace(/\s+/g, '').replace(/^(.+[가-힣])[A-Z]$/, '$1');

type HistoricalRecord = { name?: unknown; birth?: unknown; phone?: unknown; personId?: unknown };

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

export function findHistoricalStudentPersonId(input: HistoricalRecord, roots: unknown[]): string | null {
  const name = normalizeName(input.name);
  const birth = digits(input.birth);
  const phone = digits(input.phone);
  if (name.length < 2 || birth.length < 6 || phone.length < 8) return null;

  const records: HistoricalRecord[] = [];
  roots.forEach((root) => collectNamedRecords(root, records));
  const ids = new Set<string>();
  for (const record of records) {
    const personId = text(record.personId);
    if (!personId.startsWith('person_student_') || normalizeName(record.name) !== name) continue;
    if (digits(record.birth) === birth && digits(record.phone) === phone) ids.add(personId);
  }
  return ids.size === 1 ? [...ids][0] : null;
}
