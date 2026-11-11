import { beforeEach, expect, it, vi } from 'vitest';
import type { NewFriend } from '@/features/semester/types';

const mocks = vi.hoisted(() => ({ update: vi.fn(), get: vi.fn(), seq: 0 }));
vi.mock('@/lib/rtdb', () => ({
  ref: (_db: unknown, path = '') => path, get: mocks.get, onValue: vi.fn(),
  push: () => ({ key: `generated-${++mocks.seq}` }),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/features/activityLog/write', () => ({ auditedUpdate: mocks.update, auditedSet: vi.fn(), auditedRemove: vi.fn(), auditedRunTransaction: vi.fn() }));
import { replaceRetreatProgramCompetitionAssignments } from './programs';
import { syncIguardScheduleOwner } from '@/features/iguard/lib/db';
import { saveNewFriend } from '@/features/semester/db';

beforeEach(() => { vi.clearAllMocks(); });
it('팀 배정은 조 맵의 최종값만 보내 부모·자식 중첩 경로를 만들지 않는다', async () => {
  await replaceRetreatProgramCompetitionAssignments('r', 'p', ['a', 'b'], { g: 'a', ignored: 'unknown' });
  const payload = mocks.update.mock.calls[0][1];
  expect(payload['retreats/r/programs/p/competitionTeams/a/groupIds']).toEqual({ g: true });
  expect(payload['retreats/r/programs/p/competitionTeams/b/groupIds']).toBeNull();
  const keys = Object.keys(payload);
  expect(keys.some(key => keys.some(other => other.startsWith(`${key}/`)))).toBe(false);
});
it('시트 구간 이름 수정은 블록·순서·출처 필드를 교체하지 않는다', async () => {
  const block = { id: 'block', day: 1, start: '10:00', end: '11:00', label: '일정', owner: '* 본관 → 새 장소\n입구: sf' };
  await syncIguardScheduleOwner('r', block, [block], [], [{ id: 'post', name: '입구', area: '수련회장', source: 'sheet' }], [
    { id: 'default', blockId: 'block', order: 0, label: '전체', source: 'manual' },
    { id: 'sheet', blockId: 'block', order: 1, label: '본관 → 이전 장소', source: 'sheet' },
  ], []);
  const payload = mocks.update.mock.calls[0][1];
  expect(payload['retreats/r/iguard/segments/sheet/label']).toBe('본관 → 새 장소');
  expect(payload).not.toHaveProperty('retreats/r/iguard/segments/sheet');
});
it('일반 편집은 연결 표식을 제외하고 공개·비공개 변경을 한 번에 보낸다', async () => {
  const opened: NewFriend = { id: 'f', name: '학생', part: '1부', grade: 1, decision: '등록', createdAt: 'old', updatedAt: 'old' };
  mocks.get.mockResolvedValueOnce({ val: () => opened }).mockResolvedValueOnce({ val: () => ({ phone: 'old' }) });
  await saveNewFriend('2026-sunday', { ...opened, name: '수정', updatedAt: 'new' }, { phone: 'new' }, { friend: opened, privateValue: { phone: 'old' } });
  expect(mocks.update).toHaveBeenCalledTimes(1);
  const payload = mocks.update.mock.calls[0][1];
  expect(payload['semesters/2026-sunday/newFriends/f/name']).toBe('수정');
  expect(payload['semestersPrivate/2026-sunday/newFriendsPrivate/f/phone']).toBe('new');
  expect(Object.keys(payload).some(key => key.endsWith('/rosterSync') || key.endsWith('/createdAt'))).toBe(false);
});
it('편집 중 새 출석부 연결이 생기면 오래된 화면 저장을 중단한다', async () => {
  const opened: NewFriend = { id: 'f', name: '학생', part: '1부', grade: 1, decision: '등록', createdAt: 'old' };
  mocks.get.mockResolvedValueOnce({ val: () => ({ ...opened, rosterSync: { studentId: 'nf_f' } }) }).mockResolvedValueOnce({ val: () => null });
  await expect(saveNewFriend('2026-sunday', opened, {}, { friend: opened, privateValue: {} })).rejects.toThrow('변경');
  expect(mocks.update).not.toHaveBeenCalled();
});
