import { parseCSV } from '@/lib/sheetSync';
import type { Student } from '@/types';

export type RosterInput = Pick<Student, 'name' | 'birth' | 'phone'>;
const digits = (value?: string) => (value ?? '').replace(/\D/g, '');

export function parseRosterInput(text: string): RosterInput[] {
  const normalized = text.replace(/^\uFEFF/, '');
  const rows = normalized.includes('\t') && !normalized.includes(',')
    ? normalized.split(/\r?\n/).map(line => line.split('\t')) : parseCSV(normalized);
  if (['이름', '성명', 'name'].includes(rows[0]?.[0]?.trim().toLowerCase())) rows.shift();
  const entries = rows.filter(row => row.some(value => value.trim())).map((row, index) => {
    if (!row[0]?.trim()) throw new Error(`${index + 1}번째 행에 학생 이름이 없습니다.`);
    return { name: row[0].trim(), birth: row[1]?.trim() ?? '', phone: row[2]?.trim() ?? '' };
  });
  if (entries.length > 500) throw new Error('한 번에 500명까지 입력할 수 있습니다. 반별로 나누어 주세요.');
  return entries;
}

/** 확인된 기존 학생의 ID·출석 연결·편집 필드를 유지한다. 이름만 같은 학생은 합치지 않는다. */
export function planRosterImport(rows: RosterInput[], current: Record<string, Student>, mode: 'append' | 'replace', operationId: string) {
  const students: Record<string, Student> = mode === 'append' ? { ...current } : {};
  const seen = new Set<string>(), matched = new Set<string>();
  let added = 0, retained = 0;
  rows.forEach((row, index) => {
    const identity = JSON.stringify([row.name, digits(row.birth), digits(row.phone)]);
    if (seen.has(identity)) throw new Error(`${index + 1}번째 행의 ${row.name} 학생이 입력에 중복되어 있습니다.`);
    seen.add(identity);
    const sameName = Object.entries(current).filter(([, student]) => student.name.trim() === row.name);
    const candidates = sameName.filter(([, student]) => {
      const comparable = [[digits(row.birth), digits(student.birth)], [digits(row.phone), digits(student.phone)]]
        .filter(([a, b]) => a && b);
      return comparable.length > 0 && comparable.every(([a, b]) => a === b);
    });
    if (sameName.length && candidates.length !== 1) throw new Error(`${row.name} 학생을 기존 명단과 구분할 수 없습니다. 생년월일·연락처를 확인하거나 개별 등록해 주세요.`);
    if (candidates.length === 1) {
      const [id, student] = candidates[0];
      if (matched.has(id)) throw new Error(`${row.name} 학생이 같은 기존 학생에 두 번 연결됩니다.`);
      students[id] = student; matched.add(id); retained++;
    } else {
      const id = `s_${operationId}_${index}`;
      if (current[id] || students[id]) throw new Error('새 학생 ID가 중복되었습니다. 미리보기를 다시 만들어 주세요.');
      students[id] = { id, ...row }; added++;
    }
  });
  return { students, added, retained, removed: mode === 'replace' ? Object.keys(current).filter(id => !matched.has(id)).length : 0 };
}
