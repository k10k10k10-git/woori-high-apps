import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ request: vi.fn<typeof fetch>() }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: { uid: 'synthetic-admin', getIdToken: async () => 'synthetic-token' } } }));
import { archiveRoster } from '@/lib/rosterRecovery';

const student = { id: 's', name: '합성 학생', personId: 'person', future: '보존' };
const roster = { teacher: '합성 교사', students: { s: student, other: { id: 'other', name: '다른 학생' } } };
const input = { year: 2026, classKey: '1-1-1', studentId: 's', openedStudent: student, actor: '합성 관리자' };
const classPath = 'classes/2026/1-1-1';
let values: Map<string, unknown>, beforeRequest: ((path: string, init: RequestInit) => void) | undefined;
function current(path: string) { return values.get(path) ?? null; }
function puts() { return m.request.mock.calls.filter(([, init]) => init?.method === 'PUT'); }
function pathOf(url: RequestInfo | URL) { return decodeURIComponent(new URL(String(url)).pathname.slice(1, -5)); }
beforeEach(() => {
  vi.clearAllMocks(); beforeRequest = undefined;
  values = new Map([[classPath, structuredClone(roster)]]);
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_DATABASE_URL', 'https://synthetic.firebaseio.test');
  vi.stubGlobal('fetch', m.request);
  m.request.mockImplementation(async (url, init = {}) => {
    const path = pathOf(url); beforeRequest?.(path, init);
    const value = current(path), etag = JSON.stringify(encodeURIComponent(JSON.stringify(value)));
    if (init.method === 'PUT') {
      if ((init.headers as Record<string, string>)['If-Match'] !== etag) return new Response('null', { status: 412 });
      values.set(path, JSON.parse(init.body as string));
    }
    return new Response(JSON.stringify(current(path)), { headers: { etag } });
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('사본을 먼저 조건부 확정한 뒤 학생·감사만 저장하고 출석은 읽거나 쓰지 않는다', async () => {
  await archiveRoster(input);
  const writes = puts();
  expect(writes).toHaveLength(2);
  expect(pathOf(writes[0][0])).toMatch(/^trash\/2026\/students\//);
  expect(JSON.parse(writes[0][1]!.body as string)).toMatchObject({ ...student, ck: '1-1-1' });
  const saved = current(classPath) as typeof roster & { adminChanges: Record<string, unknown> };
  expect(saved.students).toEqual({ other: roster.students.other });
  expect(saved.teacher).toBe(roster.teacher);
  expect(Object.values(saved.adminChanges)).toEqual([expect.objectContaining({ action: '학생 삭제' })]);
  expect(m.request.mock.calls.some(([url]) => pathOf(url).startsWith('attendance/'))).toBe(false);
});
it('사본 저장 실패는 명단 삭제를 시작하지 않는다', async () => {
  beforeRequest = (path, init) => { if (path.startsWith('trash/') && init.method === 'PUT') throw new TypeError('offline'); };
  await expect(archiveRoster(input)).rejects.toThrow('명단을 삭제하지 않았습니다');
  expect(puts()).toHaveLength(1); expect(current(classPath)).toEqual(roster);
});
it('사본 확정 뒤 학생이 바뀌면 삭제하지 않고 사본을 보존한다', async () => {
  let classReads = 0;
  beforeRequest = (path, init) => { if (path === classPath && init.method !== 'PUT' && ++classReads === 2) values.set(classPath, { ...roster, students: { ...roster.students, s: { ...student, phone: '새 정보' } } }); };
  await expect(archiveRoster(input)).rejects.toThrow('삭제하지 않았습니다');
  expect(puts()).toHaveLength(1);
  expect([...values.keys()].filter(path => path.startsWith('trash/'))).toHaveLength(1);
  expect(current(classPath)).toMatchObject({ students: { s: { phone: '새 정보' } } });
});
it('다른 학생의 동시 수정은 최신 반에 병합해 보존한다', async () => {
  let classReads = 0;
  beforeRequest = (path, init) => { if (path === classPath && init.method !== 'PUT' && ++classReads === 2) values.set(classPath, { ...roster, students: { ...roster.students, other: { id: 'other', name: '원격 수정' } } }); };
  await archiveRoster(input);
  expect(current(classPath)).toMatchObject({ students: { other: { name: '원격 수정' } } });
  expect((current(classPath) as typeof roster).students.s).toBeUndefined();
});
it('반 삭제는 사본 확정 뒤 반 전체가 그대로일 때만 허용한다', async () => {
  let classReads = 0;
  beforeRequest = (path, init) => { if (path === classPath && init.method !== 'PUT' && ++classReads === 2) values.set(classPath, { ...roster, teacher: '원격 담임' }); };
  await expect(archiveRoster({ year: input.year, classKey: input.classKey, actor: input.actor })).rejects.toThrow('삭제하지 않았습니다');
  expect(current(classPath)).toMatchObject({ teacher: '원격 담임' }); expect(puts()).toHaveLength(1);
});
it('반 삭제 성공도 출석을 건드리지 않고 정확한 원본 사본을 남긴다', async () => {
  await archiveRoster({ year: input.year, classKey: input.classKey, actor: input.actor });
  expect(current(classPath)).toBeNull();
  expect(JSON.parse(puts()[0][1]!.body as string)).toMatchObject({ ...roster, ck: input.classKey });
  expect(m.request.mock.calls.some(([url]) => pathOf(url).startsWith('attendance/'))).toBe(false);
});
it('삭제 응답 유실은 사본을 지우거나 자동 재전송하지 않는다', async () => {
  const normal = m.request.getMockImplementation()!;
  m.request.mockImplementation(async (url, init) => {
    const result = await normal(url, init);
    if (pathOf(url) === classPath && init?.method === 'PUT') throw new TypeError('response lost');
    return result;
  });
  await expect(archiveRoster(input)).rejects.toMatchObject({ kind: 'unknown', message: expect.stringContaining('복구 사본은 보존') });
  expect(puts()).toHaveLength(2);
  expect([...values.keys()].filter(path => path.startsWith('trash/'))).toHaveLength(1);
});
it.each([{ name: '다른 학생' }, { birth: '2010-02-02' }, { phone: '010-2222-3333' }, { personId: 'person_replacement' }])('legacy 학생의 첫 조회 전 교체를 사본 저장 전에 거절한다: %j', async replacement => {
  const legacy = { id: 's', name: '합성 학생', birth: '2010-01-01' };
  values.set(classPath, { ...roster, students: { ...roster.students, s: { ...legacy, ...replacement } } });
  await expect(archiveRoster({ ...input, openedStudent: legacy })).rejects.toThrow('학생 연결이 변경');
  expect(puts()).toHaveLength(0);
});
it('원래 학생 SID·영구 ID가 다르거나 SID가 비면 삭제하지 않는다', async () => {
  for (const openedStudent of [{ ...student, id: 'other' }, { ...student, personId: 'person_other' }]) await expect(archiveRoster({ ...input, openedStudent })).rejects.toThrow('학생 연결이 변경');
  await expect(archiveRoster({ ...input, studentId: '' })).rejects.toThrow('학생 연결이 변경');
  expect(puts()).toHaveLength(0);
});
it('영구 ID 없는 원래 학생은 그대로 삭제할 수 있다', async () => {
  const legacy = { id: 's', name: '합성 학생', birth: '2010-01-01' };
  values.set(classPath, { ...roster, students: { ...roster.students, s: legacy } });
  await archiveRoster({ ...input, openedStudent: legacy });
  expect(JSON.parse(puts()[0][1]!.body as string)).toMatchObject(legacy);
});
it('같은 영구 ID의 원격 정보 수정은 최신 사본으로 보존한다', async () => {
  values.set(classPath, { ...roster, students: { ...roster.students, s: { ...student, phone: '원격 수정' } } });
  await archiveRoster(input);
  expect(JSON.parse(puts()[0][1]!.body as string)).toMatchObject({ ...student, phone: '원격 수정' });
});
it('최신 반을 읽는 중 화면이 바뀌면 사본·삭제 요청을 시작하지 않는다', async () => {
  let active = true;
  beforeRequest = path => { if (path === classPath) active = false; };
  await expect(archiveRoster(input, () => active)).rejects.toMatchObject({ kind: 'session' });
  expect(puts()).toHaveLength(0);
});
