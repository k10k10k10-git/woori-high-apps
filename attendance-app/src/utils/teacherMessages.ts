export type TeacherMessageKind = 'note' | 'visit';
export type VisitRequestStatus = 'open' | 'done';

export type TeacherMessage = {
  id: string;
  text: string;
  createdAt: number;
  author: string;
  kind: TeacherMessageKind;
  studentId?: string;
  studentName?: string;
  status?: VisitRequestStatus;
  resolvedAt?: number;
};

type MessageRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MessageRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** kind가 없던 기존 건의사항은 특이사항으로 계속 읽는다. */
export function parseTeacherMessages(value: unknown, kind: TeacherMessageKind): TeacherMessage[] {
  if (!isRecord(value)) return [];
  const items: TeacherMessage[] = [];
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw) || typeof raw.text !== 'string') continue;
    const entryKind: TeacherMessageKind = raw.kind === 'visit' ? 'visit' : 'note';
    if (entryKind !== kind) continue;
    if (entryKind === 'visit' && (typeof raw.studentId !== 'string' || typeof raw.studentName !== 'string')) continue;
    items.push({
      id,
      text: raw.text,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
      author: typeof raw.author === 'string' ? raw.author : '',
      kind: entryKind,
      studentId: typeof raw.studentId === 'string' ? raw.studentId : undefined,
      studentName: typeof raw.studentName === 'string' ? raw.studentName : undefined,
      status: raw.status === 'done' ? 'done' : entryKind === 'visit' ? 'open' : undefined,
      resolvedAt: typeof raw.resolvedAt === 'number' ? raw.resolvedAt : undefined,
    });
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export function parseYearTeacherMessages(value: unknown, kind: TeacherMessageKind): Record<string, TeacherMessage[]> {
  if (!isRecord(value)) return {};
  const result: Record<string, TeacherMessage[]> = {};
  for (const [classKey, raw] of Object.entries(value)) {
    const items = parseTeacherMessages(raw, kind);
    if (items.length) result[classKey] = items;
  }
  return result;
}

export function countOpenVisitRequests(value: unknown): number {
  return Object.values(parseYearTeacherMessages(value, 'visit'))
    .flat()
    .filter(item => item.status !== 'done').length;
}
