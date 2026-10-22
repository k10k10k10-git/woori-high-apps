import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { studentMoveCommitPath, type StudentMoveLockIdentity } from '@/utils/studentMoveLock';

const m = vi.hoisted(() => ({ data: {} as Record<string, unknown>, connected: true, read: vi.fn(), patch: vi.fn(), token: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: { uid: 'synthetic-admin', getIdToken: m.token } } }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_db: unknown, path: string) => path,
  onValue: (path: string, callback: (snapshot: { val: () => unknown }) => void) => {
    callback({ val: () => path === '.info/connected' ? m.connected : 0 }); return () => {};
  },
}));
vi.mock('@/utils/studentMoveRequest', () => ({ readStudentMoveValue: m.read, patchStudentMoveOnce: m.patch }));
import { permanentDeleteRosterCopy, restoreRoster } from '@/lib/rosterRestore';

const student = { id: 'S11_01', name: '합성 학생', personId: 'person_student_A', birth: '2008-01-01' };
const copy = { ...student, ck: '1-1-1', deletedAt: 1234 };
const input = { year: 2026, kind: 'students' as const, key: 'copy-a', value: copy, actor: '합성 관리자' };
const current = () => true;
function get(path: string): unknown {
  let value: unknown = m.data;
  for (const key of path.split('/')) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : null;
  return value ?? null;
}
function put(path: string, value: unknown) {
  const keys = path.split('/');
  let target = m.data;
  for (const key of keys.slice(0, -1)) target = target[key] && typeof target[key] === 'object'
    ? target[key] as Record<string, unknown> : target[key] = {};
  if (value === null) delete target[keys.at(-1)!];
  else target[keys.at(-1)!] = structuredClone(value);
  // Firebase는 비어 있는 부모를 null로 읽는다.
  const prune = (value: Record<string, unknown>) => {
    for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object' && !Array.isArray(child)) {
      prune(child as Record<string, unknown>);
      if (!Object.keys(child).length) delete value[key];
    }
  };
  prune(m.data);
}
function apply(payload: Record<string, unknown>) { for (const [path, value] of Object.entries(payload)) put(path, value); }
function olderLock(): StudentMoveLockIdentity {
  return { ownerUid: 'previous-admin', operationId: 'roster_restore_old',
    record: { fromCk: '__roster_restore__', toCk: '2-1-1', sid: 'old-id', phase: 'pending', startedAt: Date.now() - 11 * 60_000 } };
}
function installLock(lock: StudentMoveLockIdentity) {
  for (const ck of [lock.record.fromCk, lock.record.toCk]) put(`config/studentMoveLocks/2026/${ck}`, { [lock.ownerUid]: { [lock.operationId]: lock.record } });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.connected = true;
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_DATABASE_URL', 'https://synthetic.firebaseio.test');
  m.data = { classes: { 2026: { '1-1-1': { teacher: '원래 담임' }, '1-1-2': { teacher: '다른 담임' } } },
    trash: { 2026: { students: { 'copy-a': structuredClone(copy) } } },
    attendance: { 2026: { '1-1-1': { [student.id]: { '0-0': 'O', '0-1': 'X' } } } } };
  m.token.mockResolvedValue('synthetic-token');
  m.read.mockImplementation(async ({ path, isCurrent }: { path: string; isCurrent: () => boolean }) => {
    if (!isCurrent()) throw new Error('stale scope'); return structuredClone(get(path));
  });
  m.patch.mockImplementation(async ({ payload }: { payload: Record<string, unknown> }) => { apply(payload); return { status: 'committed' }; });
  m.fetch.mockImplementation(async (address: string, init: RequestInit) => {
    const path = decodeURIComponent(new URL(address).pathname.slice(1, -5));
    const value = get(path), etag = JSON.stringify(JSON.stringify(value));
    if (init.method === 'GET') return new Response(JSON.stringify(value), { headers: { etag } });
    if ((init.headers as Record<string, string>)['If-Match'] !== etag) return new Response('null', { status: 412 });
    const next = JSON.parse(init.body as string); put(path, next);
    return new Response(JSON.stringify(next));
  });
  vi.stubGlobal('fetch', m.fetch);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('삭제본 원자 복원', () => {
  it('학생·감사·사본 제거·불변 표식·잠금 해제를 한 PATCH로 저장하고 출석을 쓰지 않는다', async () => {
    const beforeAttendance = structuredClone(get('attendance'));
    await restoreRoster(input, current);
    expect(get(`classes/2026/1-1-1/students/${student.id}`)).toEqual(student);
    expect(get('trash/2026/students/copy-a')).toBeNull();
    expect(get('attendance')).toEqual(beforeAttendance);
    expect(get('config/studentMoveLocks/2026')).toBeNull();
    expect(m.patch).toHaveBeenCalledOnce();
    const payload = m.patch.mock.calls[0][0].payload as Record<string, unknown>;
    expect(Object.keys(payload).filter(path => path.startsWith('attendance/'))).toEqual([]);
    expect(Object.keys(payload).filter(path => path.startsWith('config/studentMoveCommits/2026/__roster_restore__/1-1-1/'))).toHaveLength(1);
    expect(Object.entries(payload).filter(([path]) => path.startsWith('config/studentMoveLocks/'))).toHaveLength(2);
    expect(Object.values(get('classes/2026/1-1-1/adminChanges') as object)[0]).toMatchObject({ action: '학생 복원', personId: student.personId });
  });

  it('복원 후 학생이 다른 반으로 이동·삭제되어도 오래된 화면의 같은 사본을 다시 복원하지 않는다', async () => {
    await restoreRoster(input, current);
    put(`classes/2026/1-1-1/students/${student.id}`, null);
    put(`classes/2026/1-1-2/students/new-id`, { ...student, id: 'new-id' });
    put('classes/2026/1-1-2/students/new-id', null);
    await expect(restoreRoster(input, current)).rejects.toThrow('이미 처리');
    expect(get(`classes/2026/1-1-1/students/${student.id}`)).toBeNull();
    expect(m.patch).toHaveBeenCalledOnce();
  });

  it('과거 사본 정리 실패 뒤 재시작한 경우에도 다른 반의 동일 PID를 발견하면 복원하지 않는다', async () => {
    put('classes/2026/1-1-2/students/moved-id', { ...student, id: 'moved-id' });
    const original = structuredClone(m.data);
    await expect(restoreRoster(input, current)).rejects.toThrow('같은 학생이 현재 명단에 이미 있습니다');
    expect(get('classes')).toEqual(original.classes);
    expect(get('trash')).toEqual(original.trash);
    expect(get('attendance')).toEqual(original.attendance);
    expect(m.patch).not.toHaveBeenCalled();
    expect(get('config/studentMoveLocks/2026')).toBeNull();
  });

  it.each([
    { birth: '2008. 1. 1' },
    { birth: undefined, phone: '010-1234-5678' },
  ])('서로 다른 영구 ID라도 %j로 동일인이 확인되면 삭제본·현재 명단·출석을 모두 보존한다', async identity => {
    const savedCopy = { ...copy, phone: '01012345678' };
    put('trash/2026/students/copy-a', savedCopy);
    put('classes/2026/1-1-2/students/current-id', { id: 'current-id', name: student.name, personId: 'person_student_B', ...identity });
    const original = structuredClone(m.data);
    await expect(restoreRoster({ ...input, value: savedCopy }, current)).rejects.toThrow('이미 있습니다');
    expect(get('classes')).toEqual(original.classes);
    expect(get('trash')).toEqual(original.trash);
    expect(get('attendance')).toEqual(original.attendance);
    expect(m.patch).not.toHaveBeenCalled();
    expect(get('config/studentMoveLocks/2026')).toBeNull();
  });

  it('영구 ID가 있는 동명이인만으로 복원을 막지 않고 출석도 변경하지 않는다', async () => {
    put('classes/2026/1-1-2/students/other', { id: 'other', name: student.name, personId: 'person_student_B', birth: '2008-02-02' });
    const otherClass = structuredClone(get('classes/2026/1-1-2'));
    const attendance = structuredClone(get('attendance'));
    await restoreRoster(input, current);
    expect(get(`classes/2026/1-1-1/students/${student.id}`)).toEqual(student);
    expect(get('classes/2026/1-1-2')).toEqual(otherClass);
    expect(get('attendance')).toEqual(attendance);
  });

  it.each([student.personId, 'person_student_B'])('같은 인물의 서로 다른 반 사본(PID %s)을 동시에 복원해도 한 명만 복원한다', async personId => {
    const otherCopy = { ...copy, personId, ck: '1-1-2', id: 'other-id' };
    put('trash/2026/students/copy-b', otherCopy);
    const outcomes = await Promise.allSettled([restoreRoster(input, current), restoreRoster({ ...input, key: 'copy-b', value: otherCopy }, current)]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(m.patch).toHaveBeenCalledOnce();
    const restored = Object.values(get('classes/2026') as Record<string, { students?: Record<string, unknown> }>).flatMap(value => Object.values(value.students ?? {}));
    expect(restored).toHaveLength(1);
  });

  it('학생 삭제본 복원과 그 학생이 포함된 반 삭제본 복원이 경합해도 중복을 만들지 않는다', async () => {
    const classCopy = { ck: '2-1-1', deletedAt: 2345, teacher: '합성 담임', students: { alias: { ...student, id: 'alias' } } };
    put('trash/2026/classes/class-a', classCopy);
    await restoreRoster(input, current);
    await expect(restoreRoster({ ...input, kind: 'classes', key: 'class-a', value: classCopy }, current)).rejects.toThrow('이미 있습니다');
    expect(get('classes/2026/2-1-1')).toBeNull();
    expect(get('trash/2026/classes/class-a')).toEqual(classCopy);
  });

  it('영구 ID가 없는 사본의 동명 학생이 다른 반에 있으면 자동 복원하지 않는다', async () => {
    const legacy: Partial<typeof copy> = { ...copy }; delete legacy.personId;
    put('trash/2026/students/copy-a', legacy);
    put('classes/2026/1-1-2/students/other', { id: 'other', name: student.name });
    await expect(restoreRoster({ ...input, value: legacy }, current)).rejects.toThrow('동명 학생');
    expect(m.patch).not.toHaveBeenCalled();
  });

  it('반 복원은 원본 필드와 학생 ID를 보존하고 기존 출석을 갱신하지 않는다', async () => {
    const classCopy = { ck: '2-1-1', deletedAt: 2345, teacher: '복원 담임', teacherPhoto: 'kept-photo', students: { [student.id]: student }, adminChanges: { previous: { action: '이전 기록' } } };
    put('trash/2026/classes/class-a', classCopy);
    const attendance = structuredClone(get('attendance'));
    await restoreRoster({ ...input, kind: 'classes', key: 'class-a', value: classCopy }, current);
    expect(get('classes/2026/2-1-1')).toMatchObject({ teacher: '복원 담임', teacherPhoto: 'kept-photo', students: { [student.id]: student }, adminChanges: { previous: { action: '이전 기록' } } });
    expect(get('attendance')).toEqual(attendance);
    expect(get('trash/2026/classes/class-a')).toBeNull();
  });

  it.each(['copy', 'classes'])('%s 조회 실패는 빈 데이터로 바꾸지 않고 사본과 명단을 보존한다', async failure => {
    const normal = m.read.getMockImplementation()!;
    m.read.mockImplementation((request: { path: string }) => request.path === (failure === 'copy' ? 'trash/2026/students/copy-a' : 'classes/2026') ? Promise.reject(new Error('조회 실패')) : normal(request));
    const original = structuredClone(m.data);
    await expect(restoreRoster(input, current)).rejects.toThrow('조회 실패');
    expect(get('classes')).toEqual(original.classes); expect(get('trash')).toEqual(original.trash);
    expect(m.patch).not.toHaveBeenCalled();
  });

  it('명시 거절은 잠금을 정리하되 사본·명단·출석을 보존한다', async () => {
    m.patch.mockResolvedValue({ status: 'rejected' });
    const original = structuredClone(m.data);
    await expect(restoreRoster(input, current)).rejects.toThrow('거절');
    expect(get('classes')).toEqual(original.classes); expect(get('trash')).toEqual(original.trash); expect(get('attendance')).toEqual(original.attendance);
    expect(get('config/studentMoveLocks/2026')).toBeNull();
  });

  it('대상 반의 같은 SID가 다른 학생이면 보존하고 복원을 중단한다', async () => {
    const occupant = { ...student, personId: 'person_student_B', name: '다른 학생' };
    put(`classes/2026/1-1-1/students/${student.id}`, occupant);
    await expect(restoreRoster(input, current)).rejects.toThrow('같은 학생 ID');
    expect(get(`classes/2026/1-1-1/students/${student.id}`)).toEqual(occupant);
    expect(m.patch).not.toHaveBeenCalled();
  });

  it('반 삭제본 안에 같은 PID가 두 번 있으면 일부만 복원하지 않는다', async () => {
    const classCopy = { ck: '2-1-1', deletedAt: 2345, students: { first: student, second: { ...student, id: 'second' } } };
    put('trash/2026/classes/class-a', classCopy);
    await expect(restoreRoster({ ...input, kind: 'classes', key: 'class-a', value: classCopy }, current)).rejects.toThrow('이미 있습니다');
    expect(get('classes/2026/2-1-1')).toBeNull();
    expect(get('trash/2026/classes/class-a')).toEqual(classCopy);
    expect(m.patch).not.toHaveBeenCalled();
  });

  it('반 삭제본 안의 서로 다른 PID도 같은 이름·생일이면 일부만 복원하지 않는다', async () => {
    const classCopy = { ck: '2-1-1', deletedAt: 2345, students: {
      first: student,
      second: { ...student, id: 'second', personId: 'person_student_B', birth: '2008. 1. 1' },
    } };
    put('trash/2026/classes/class-a', classCopy);
    const original = structuredClone(m.data);
    await expect(restoreRoster({ ...input, kind: 'classes', key: 'class-a', value: classCopy }, current)).rejects.toThrow('이미 있습니다');
    expect(get('classes')).toEqual(original.classes);
    expect(get('attendance')).toEqual(original.attendance);
    expect(get('trash')).toEqual(original.trash);
    expect(m.patch).not.toHaveBeenCalled();
  });

  it('PATCH 응답이 유실되어도 서버 표식이 확인되면 중복 요청 없이 완료한다', async () => {
    m.patch.mockImplementation(async ({ payload }: { payload: Record<string, unknown> }) => { apply(payload); return { status: 'unknown' }; });
    await restoreRoster(input, current);
    expect(m.patch).toHaveBeenCalledOnce();
    expect(get(`classes/2026/1-1-1/students/${student.id}`)).toEqual(student);
    expect(get('trash/2026/students/copy-a')).toBeNull();
  });

  it('불명확한 PATCH의 표식도 없으면 pending을 보존하고 즉시 재적용을 막는다', async () => {
    m.patch.mockResolvedValue({ status: 'unknown' });
    await expect(restoreRoster(input, current)).rejects.toThrow('잠금을 보존');
    const locks = structuredClone(get('config/studentMoveLocks/2026'));
    expect(locks).not.toBeNull();
    await expect(restoreRoster(input, current)).rejects.toThrow('다른 작업');
    expect(get('config/studentMoveLocks/2026')).toEqual(locks);
    expect(get('trash/2026/students/copy-a')).toEqual(copy);
    expect(m.patch).toHaveBeenCalledOnce();
  });

  it('불명확한 PATCH의 표식 조회가 실패해도 원장을 실패로 추측하거나 잠금을 해제하지 않는다', async () => {
    m.patch.mockResolvedValue({ status: 'unknown' });
    const normal = m.read.getMockImplementation()!;
    m.read.mockImplementation((request: { path: string }) => request.path.startsWith('config/studentMoveCommits/') ? Promise.reject(new Error('증거 없음')) : normal(request));
    await expect(restoreRoster(input, current)).rejects.toThrow('잠금을 보존');
    expect(get('config/studentMoveLocks/2026')).not.toBeNull();
    expect(get('trash/2026/students/copy-a')).toEqual(copy);
    expect(m.patch).toHaveBeenCalledOnce();
  });

  it.each([null, true])('10분 지난 복원 잠금은 marker=%s를 확인하고 exact 잠금만 정리한 뒤 실행한다', async marker => {
    const old = olderLock(); installLock(old);
    if (marker) put(studentMoveCommitPath(2026, old), marker);
    await restoreRoster(input, current);
    expect(get('config/studentMoveLocks/2026')).toBeNull();
    expect(get(`classes/2026/1-1-1/students/${student.id}`)).toEqual(student);
    if (marker) expect(get(studentMoveCommitPath(2026, old))).toBe(true);
  });

  it('만료 복원 표식 조회가 실패하면 이전 잠금을 정리하지 않는다', async () => {
    const old = olderLock(); installLock(old);
    const locks = structuredClone(get('config/studentMoveLocks/2026'));
    const normal = m.read.getMockImplementation()!;
    m.read.mockImplementation((request: { path: string }) => request.path === studentMoveCommitPath(2026, old) ? Promise.reject(new Error('증거 조회 실패')) : normal(request));
    await expect(restoreRoster(input, current)).rejects.toThrow('증거 조회 실패');
    expect(get('config/studentMoveLocks/2026')).toEqual(locks);
    expect(m.patch).not.toHaveBeenCalled();
  });

  it('토큰 대기 중 화면이 바뀌면 잠금과 원장 요청을 시작하지 않는다', async () => {
    let deliver!: (value: string) => void, active = true;
    m.token.mockReturnValue(new Promise<string>(resolve => { deliver = resolve; }));
    const result = restoreRoster(input, () => active);
    active = false; deliver('synthetic-token');
    await expect(result).rejects.toThrow('조회 상태');
    expect(m.fetch).not.toHaveBeenCalled(); expect(m.patch).not.toHaveBeenCalled();
  });

  it('최신 사본을 읽는 중 화면이 바뀌면 원장 PATCH를 보내지 않고 자기 잠금만 정리한다', async () => {
    let active = true;
    const normal = m.read.getMockImplementation()!;
    m.read.mockImplementation(async (request: { path: string }) => {
      const value = await normal(request);
      if (request.path.startsWith('trash/')) active = false;
      return value;
    });
    await expect(restoreRoster(input, () => active)).rejects.toThrow('stale scope');
    expect(m.patch).not.toHaveBeenCalled();
    expect(get('config/studentMoveLocks/2026')).toBeNull();
    expect(get('trash/2026/students/copy-a')).toEqual(copy);
  });

  it('서버 연결이 없으면 기기 시각으로 잠금을 만들지 않는다', async () => {
    m.connected = false;
    await expect(restoreRoster(input, current)).rejects.toThrow('서버 시간');
    expect(m.fetch).not.toHaveBeenCalled(); expect(m.patch).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'unknown' }, { key: '../copy-a' }, { value: { ...copy, ck: '__roster_restore__' } },
    { kind: 'classes', value: { ck: '1-1-1', deletedAt: 1234, students: ['손상된 학생'] } },
  ])('잘못된 입력 %j은 서버 요청 전에 중단한다', async change => {
    await expect(restoreRoster({ ...input, ...change } as typeof input, current)).rejects.toThrow();
    expect(m.token).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled(); expect(m.patch).not.toHaveBeenCalled();
  });

  it('멈춘 토큰은 15초 뒤 종료하고 나중에 완료되어도 쓰지 않는다', async () => {
    vi.useFakeTimers(); let deliver!: (value: string) => void;
    m.token.mockReturnValue(new Promise<string>(resolve => { deliver = resolve; }));
    const result = restoreRoster(input, current), rejected = expect(result).rejects.toThrow('시간');
    await vi.advanceTimersByTimeAsync(15_000); await rejected;
    deliver('synthetic-token'); await vi.advanceTimersByTimeAsync(0);
    expect(m.fetch).not.toHaveBeenCalled(); expect(m.patch).not.toHaveBeenCalled();
  });

  it('영구 삭제도 같은 잠금·완료 표식으로 사본만 원자 제거한다', async () => {
    const original = structuredClone(get('classes')), attendance = structuredClone(get('attendance'));
    await permanentDeleteRosterCopy(input, current);
    expect(get('classes')).toEqual(original); expect(get('attendance')).toEqual(attendance);
    expect(get('trash/2026/students/copy-a')).toBeNull();
    const payload = m.patch.mock.calls[0][0].payload as Record<string, unknown>;
    expect(Object.keys(payload).some(path => path.startsWith('classes/') || path.startsWith('attendance/'))).toBe(false);
    expect(Object.keys(payload).some(path => path.includes('/__delete__/'))).toBe(true);
  });

  it('오래된 화면의 영구 삭제도 현재 다른 사본을 지우지 않는다', async () => {
    const changed = { ...copy, deletedAt: 9999 }; put('trash/2026/students/copy-a', changed);
    await expect(permanentDeleteRosterCopy(input, current)).rejects.toThrow('변경');
    expect(get('trash/2026/students/copy-a')).toEqual(changed);
    expect(m.patch).not.toHaveBeenCalled();
  });
});
