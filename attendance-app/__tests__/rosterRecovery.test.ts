import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_: unknown, path: string) => path, get: m.get, set: m.set, runTransaction: m.transaction }));
import { archiveRoster } from '@/lib/rosterRecovery';
const student = { id: 's', name: '합성 학생', personId: 'person', future: '보존' };
const roster = { teacher: '합성 교사', students: { s: student, other: { id: 'other', name: '다른 학생' } } };
const input = { year: 2026, classKey: '1-1-1', studentId: 's', openedStudent: student, actor: '합성 관리자' };
beforeEach(() => {
  vi.clearAllMocks();
  m.get.mockResolvedValue({ val: () => structuredClone(roster) });
  m.set.mockResolvedValue(undefined);
  m.transaction.mockImplementation(async (path: string, change: (value: unknown) => unknown) => ({ committed: change(path.startsWith('classes/') ? structuredClone(roster) : null) !== undefined }));
});
it('사본을 먼저 저장하고 출석 경로 없이 해당 학생과 감사만 변경한다', async () => {
  await archiveRoster(input);
  expect(m.set.mock.calls[0][0]).toMatch(/^trash\/2026\/students\//);
  expect(m.set.mock.calls[0][1]).toMatchObject({ ...student, ck: '1-1-1' });
  expect(m.set.mock.invocationCallOrder[0]).toBeLessThan(m.transaction.mock.invocationCallOrder[0]);
  const next = m.transaction.mock.calls[0][1](structuredClone(roster));
  expect(next.students).toEqual({ other: roster.students.other });
  expect(next.teacher).toBe(roster.teacher);
  expect(Object.values(next.adminChanges)).toEqual([expect.objectContaining({ action: '학생 삭제' })]);
  expect([...m.set.mock.calls, ...m.transaction.mock.calls].some(([path]) => path.startsWith('attendance/'))).toBe(false);
});
it('사본 저장 실패는 명단 삭제를 실행하지 않는다', async () => {
  m.set.mockRejectedValue(new Error('단절'));
  await expect(archiveRoster(input)).rejects.toThrow('명단을 삭제하지 않았습니다');
  expect(m.transaction).not.toHaveBeenCalled();
});
it('사본 저장 뒤 학생 변경은 중단하며 다른 학생의 수정은 보존한다', async () => {
  await archiveRoster(input);
  const change = m.transaction.mock.calls[0][1];
  expect(change({ ...roster, students: { ...roster.students, s: { ...student, phone: '새 정보' } } })).toBeUndefined();
  expect(change({ ...roster, students: { ...roster.students, other: { name: '동시 수정' } } }).students.other.name).toBe('동시 수정');
});
it('반 삭제는 반 전체의 최신 값이 일치할 때만 허용한다', async () => {
  await archiveRoster({ year: input.year, classKey: input.classKey, actor: input.actor });
  const change = m.transaction.mock.calls[0][1];
  expect(change(roster)).toBeNull();
  expect(change({ ...roster, teacher: '새 교사' })).toBeUndefined();
});
it('삭제 응답 유실은 사본을 지우거나 삭제를 자동 재시도하지 않는다', async () => {
  m.transaction.mockRejectedValue(new Error('응답 유실'));
  await expect(archiveRoster(input)).rejects.toThrow('복구 사본은 보존');
  expect(m.transaction).toHaveBeenCalledTimes(1);
  expect(m.set).toHaveBeenCalledTimes(1);
});
it.each([
  { name: '다른 학생' },
  { birth: '2010-02-02' },
  { phone: '010-2222-3333' },
  { personId: 'person_replacement' },
])('영구 ID 없는 학생이 첫 서버 조회 전에 $name $birth $phone $personId로 변경되면 사본·삭제를 시작하지 않는다', async replacement => {
  const legacy = { id: 's', name: '합성 학생', birth: '2010-01-01' };
  m.get.mockResolvedValue({ val: () => ({ ...roster, students: { ...roster.students, s: { ...legacy, ...replacement } } }) });
  await expect(archiveRoster({ ...input, openedStudent: legacy })).rejects.toThrow('학생 연결이 변경');
  expect(m.set).not.toHaveBeenCalled();
  expect(m.transaction).not.toHaveBeenCalled();
});
it('원래 학생 SID나 영구 ID가 다르면 삭제를 시작하지 않는다', async () => {
  for (const openedStudent of [{ ...student, id: 'other' }, { ...student, personId: 'person_other' }]) {
    await expect(archiveRoster({ ...input, openedStudent })).rejects.toThrow('학생 연결이 변경');
  }
  expect(m.set).not.toHaveBeenCalled();
  expect(m.transaction).not.toHaveBeenCalled();
});
it('비어 있는 학생 SID를 반 전체 삭제로 해석하지 않는다', async () => {
  await expect(archiveRoster({ ...input, studentId: '' })).rejects.toThrow('학생 연결이 변경');
  expect(m.set).not.toHaveBeenCalled();
  expect(m.transaction).not.toHaveBeenCalled();
});
it('영구 ID 없는 원래 학생이 그대로면 삭제하고 보관 출석은 쓰지 않는다', async () => {
  const legacy = { id: 's', name: '합성 학생', birth: '2010-01-01' };
  const latest = { ...roster, students: { ...roster.students, s: legacy } };
  m.get.mockResolvedValue({ val: () => structuredClone(latest) });
  m.transaction.mockImplementation(async (_path, change) => ({ committed: change(structuredClone(latest)) !== undefined }));
  await archiveRoster({ ...input, openedStudent: legacy });
  expect(m.set).toHaveBeenCalledOnce();
  expect(m.set.mock.calls[0][1]).toMatchObject(legacy);
  const next = m.transaction.mock.calls[0][1](structuredClone(latest));
  expect(next.students).toEqual({ other: roster.students.other });
  expect([...m.set.mock.calls, ...m.transaction.mock.calls].some(([path]) => path.startsWith('attendance/'))).toBe(false);
});
it('같은 영구 ID의 원격 정보 수정은 최신 사본으로 보관하고 삭제한다', async () => {
  const latest = { ...roster, students: { ...roster.students, s: { ...student, phone: '원격 수정' } } };
  m.get.mockResolvedValue({ val: () => structuredClone(latest) });
  m.transaction.mockImplementation(async (_path, change) => ({ committed: change(structuredClone(latest)) !== undefined }));
  await archiveRoster(input);
  expect(m.set.mock.calls[0][1]).toMatchObject({ ...student, phone: '원격 수정' });
});
