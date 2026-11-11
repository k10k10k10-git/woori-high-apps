import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: null } }));
import { createRtdbRestFetch, RTDB_REST_URL } from '@/lib/rtdbRest';
import { FakeSupabase } from '@/lib/rtdb/testing/fakeSupabase';
import { compareAndSaveAttendance, AttendanceSaveError } from '@/lib/attendanceSave';
import { compareManagementSave } from '@/lib/managementSave';
import { createStudentMoveLockTransaction } from '@/utils/studentMoveLockRequest';
import { patchStudentMoveOnce, readStudentMoveValue } from '@/utils/studentMoveRequest';

const url = (path: string) => `${RTDB_REST_URL}/${path}.json?auth=synthetic-token`;
const student = { id: 's', name: '합성 학생', personId: 'person-s' };

function setup(initial?: unknown) {
  const fake = new FakeSupabase(initial ?? {
    classes: { 2026: { '1-1-1': { teacher: '담임', students: { s: student } } } },
    attendance: { 2026: { '1-1-1': { s: { '8-0': 'X' } } } },
    config: { list: { 0: 'a', 1: 'b' } },
  });
  return { fake, fetch: createRtdbRestFetch(() => fake) };
}

describe('Firebase REST 요청을 Supabase rtdb 함수로 옮기기', () => {
  it('GET 은 rtdb_get 값(배열 변환 포함)을, 없는 위치는 null 을 준다', async () => {
    const { fake, fetch } = setup();
    expect(await (await fetch(url('classes/2026/1-1-1/students/s'))).json()).toEqual(student);
    expect(await (await fetch(new URL(url('config/list')))).json()).toEqual(['a', 'b']);
    expect(await (await fetch(url('nothing/here'))).json()).toBeNull();
    expect(fake.callsOf('rtdb_get').map(call => call.args.p_path)).toEqual(['classes/2026/1-1-1/students/s', 'config/list', 'nothing/here']);
  });

  it('주소의 퍼센트 인코딩 키를 풀어 경로로 쓴다', async () => {
    const { fake, fetch } = setup({ semesters: { '2026-1': { '새 친구': 1 } } });
    const address = `${RTDB_REST_URL}/semesters/2026-1/${encodeURIComponent('새 친구')}.json`;
    expect(await (await fetch(address)).json()).toBe(1);
    expect(fake.callsOf('rtdb_get')[0].args.p_path).toBe('semesters/2026-1/새 친구');
  });

  it('읽기 거부는 Firebase REST 처럼 401', async () => {
    const { fake, fetch } = setup();
    fake.denyRead = path => path.startsWith('classes');
    const response = await fetch(url('classes/2026'));
    expect(response.status).toBe(401);
    expect(response.ok).toBe(false);
  });

  it('ETag GET → If-Match PUT: 같으면 저장, 그 사이 바뀌었으면 412 와 지금 값·새 ETag 를 준다', async () => {
    const { fake, fetch } = setup();
    const first = await fetch(url('classes/2026/1-1-1/teacher'), { headers: { 'X-Firebase-ETag': 'true' } });
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();
    expect(await first.json()).toBe('담임');
    fake.externalWrite({ 'classes/2026/1-1-1/teacher': '다른 담임' });
    const stale = await fetch(url('classes/2026/1-1-1/teacher'), { method: 'PUT', headers: { 'If-Match': etag }, body: JSON.stringify('새 담임') });
    expect(stale.status).toBe(412);
    expect(await stale.json()).toBe('다른 담임');
    expect(fake.value('classes/2026/1-1-1/teacher')).toBe('다른 담임');
    const fresh = await fetch(url('classes/2026/1-1-1/teacher'), { method: 'PUT', headers: { 'If-Match': stale.headers.get('etag')! }, body: JSON.stringify('새 담임') });
    expect(fresh.status).toBe(200);
    expect(fake.value('classes/2026/1-1-1/teacher')).toBe('새 담임');
    expect(fake.callsOf('rtdb_cas').map(call => call.args.p_path)).toEqual(['classes/2026/1-1-1/teacher', 'classes/2026/1-1-1/teacher']);
  });

  it('빈 위치의 ETag 로 조건부 생성하면, 그 사이 누가 만들었을 때 덮지 않는다', async () => {
    const { fake, fetch } = setup();
    const empty = await fetch(url('suggestions/2026/1-1-1/req'), { headers: { 'X-Firebase-ETag': 'true' } });
    expect(await empty.json()).toBeNull();
    fake.externalWrite({ 'suggestions/2026/1-1-1/req': { text: '먼저 등록' } });
    const result = await fetch(url('suggestions/2026/1-1-1/req'), { method: 'PUT', headers: { 'If-Match': empty.headers.get('etag')! }, body: JSON.stringify({ text: '나중 등록' }) });
    expect(result.status).toBe(412);
    expect(fake.value('suggestions/2026/1-1-1/req')).toEqual({ text: '먼저 등록' });
  });

  it('루트 PATCH 는 다중 경로 rtdb_update 한 번(서버 시각 포함), 하위 PATCH 는 키를 그 아래로 잇는다', async () => {
    const { fake, fetch } = setup();
    const patch = { 'attendance/2026/1-1-1/s/8-0': 'O', 'attendanceCellWrites/2026/1-1-1/s/8-0': { revision: 1, updatedAt: { '.sv': 'timestamp' } } };
    const response = await fetch(url(''), { method: 'PATCH', body: JSON.stringify(patch) });
    expect(response.status).toBe(200);
    expect(fake.callsOf('rtdb_update').map(call => call.args.p_patch)).toEqual([patch]);
    expect(fake.value('attendanceCellWrites/2026/1-1-1/s/8-0')).toEqual({ revision: 1, updatedAt: fake.serverNow });
    await fetch(url('classes/2026/1-1-1'), { method: 'PATCH', body: JSON.stringify({ teacher: '바뀐 담임', 'students/s/phone': '010' }) });
    expect(fake.callsOf('rtdb_update')[1].args.p_patch).toEqual({ 'classes/2026/1-1-1/teacher': '바뀐 담임', 'classes/2026/1-1-1/students/s/phone': '010' });
  });

  it('쓰기 거부·검증 실패는 401 이고 일부만 쓰이지 않는다', async () => {
    const { fake, fetch } = setup();
    fake.denyWrite = path => path.startsWith('attendance/');
    const denied = await fetch(url(''), { method: 'PATCH', body: JSON.stringify({ 'config/x': 1, 'attendance/2026/1-1-1/s/8-0': 'O' }) });
    expect(denied.status).toBe(401);
    expect(fake.value('config/x')).toBeNull();
    fake.denyWrite = () => false;
    fake.invalidWrite = () => true;
    expect((await fetch(url('config/x'), { method: 'PUT', body: '1' })).status).toBe(401);
  });

  it('PUT·DELETE 는 그 경로를 통째로 바꾸거나 지운다', async () => {
    const { fake, fetch } = setup();
    await fetch(url('classes/2026/1-1-1/students/s'), { method: 'PUT', body: JSON.stringify({ id: 's', name: '새 이름' }) });
    expect(fake.value('classes/2026/1-1-1/students/s')).toEqual({ id: 's', name: '새 이름' });
    await fetch(url('attendance/2026/1-1-1/s/8-0'), { method: 'DELETE' });
    expect(fake.value('attendance')).toBeNull();
  });

  it('연결이 끊기면 fetch 처럼 예외(서버 반영 불명), 중단 신호는 AbortError', async () => {
    const { fake, fetch } = setup();
    fake.online = false;
    await expect(fetch(url(''), { method: 'PATCH', body: '{"a":1}' })).rejects.toBeInstanceOf(TypeError);
    fake.online = true;
    const controller = new AbortController();
    controller.abort();
    await expect(fetch(url('a'), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.calls).toHaveLength(1);
  });

  it('지원하지 않는 요청(쿼리·루트 덮어쓰기·POST)은 보내지 않고 거절한다', async () => {
    const { fake, fetch } = setup();
    expect((await fetch(`${RTDB_REST_URL}/classes.json?orderBy="$key"`)).status).toBe(400);
    expect((await fetch(url(''), { method: 'PUT', body: '{}' })).status).toBe(400);
    expect((await fetch(url('a'), { method: 'POST', body: '{}' })).status).toBe(405);
    expect((await fetch(url('a'), { method: 'PUT', body: 'not json' })).status).toBe(400);
    expect(fake.calls).toEqual([]);
  });

  it('공개 설정이 없으면 연결 실패로 끝나 저장하지 않는다', async () => {
    const fetch = createRtdbRestFetch(() => { throw new Error('Supabase 공개 설정이 없습니다.'); });
    await expect(fetch(url('a'))).rejects.toBeInstanceOf(TypeError);
  });
});

describe('업무 모듈을 그대로 두고 Supabase 로 저장하기', () => {
  const save = { year: 2026, target: { ck: '1-1-1', sid: 's', k: '8-0' }, student, expected: 'X' as const, value: 'O' as const };

  it('출석 셀 저장: 학생·셀·영수증을 확인하고 셀과 영수증을 한 번에 쓴다', async () => {
    const { fake, fetch } = setup();
    await compareAndSaveAttendance(save, { databaseUrl: RTDB_REST_URL, uid: 'teacher', token: 'synthetic', isCurrent: () => true, fetch });
    expect(fake.value('attendance/2026/1-1-1/s/8-0')).toBe('O');
    expect(fake.value('attendanceCellWrites/2026/1-1-1/s/8-0')).toMatchObject({ revision: 1, expected: 'X', value: 'O', updatedBy: 'teacher', updatedAt: fake.serverNow });
    expect(fake.callsOf('rtdb_update')).toHaveLength(1);
  });

  it('출석 셀 저장: 다른 담당자가 먼저 바꿨으면 쓰지 않고, 연결이 없으면 저장하지 않은 것으로 끝난다', async () => {
    const { fake, fetch } = setup();
    fake.externalWrite({ 'attendance/2026/1-1-1/s/8-0': 'O' });
    const conflict = await compareAndSaveAttendance({ ...save, value: 'X', expected: '' }, { databaseUrl: RTDB_REST_URL, uid: 'teacher', token: 'synthetic', isCurrent: () => true, fetch })
      .catch((error: AttendanceSaveError) => error);
    expect(conflict).toMatchObject({ kind: 'conflict' });
    fake.online = false;
    const offline = await compareAndSaveAttendance(save, { databaseUrl: RTDB_REST_URL, uid: 'teacher', token: 'synthetic', isCurrent: () => true, fetch })
      .catch((error: AttendanceSaveError) => error);
    expect(offline).toMatchObject({ kind: 'unavailable' });
    expect(fake.callsOf('rtdb_update')).toHaveLength(0);
  });

  it('출석 셀 저장: 규칙이 PATCH 를 거부하면 충돌로 끝내고 재전송하지 않는다', async () => {
    const { fake, fetch } = setup();
    fake.denyWrite = () => true;
    const denied = await compareAndSaveAttendance(save, { databaseUrl: RTDB_REST_URL, uid: 'teacher', token: 'synthetic', isCurrent: () => true, fetch })
      .catch((error: AttendanceSaveError) => error);
    expect(denied).toMatchObject({ kind: 'conflict' });
    expect(fake.value('attendance/2026/1-1-1/s/8-0')).toBe('X');
  });

  it('학생 이동 잠금: 조건부 저장이 경합(412)이면 최신 값으로 다시 계산해 저장한다', async () => {
    const { fake, fetch } = setup({ config: { studentMoveLocks: { 2026: { '2-1-1': { other: { op: { phase: 'pending' } } } } } } });
    fake.casConflicts = 1;
    fake.casConflictValue = { '2-1-1': { other: { op: { phase: 'pending' } } }, '3-1-1': { late: { op: { phase: 'preparing' } } } };
    const transact = createStudentMoveLockTransaction({ databaseUrl: RTDB_REST_URL, idToken: 'synthetic', path: 'config/studentMoveLocks/2026', isCurrent: () => true, fetchOnce: fetch });
    const result = await transact(current => ({ ...(current as Record<string, unknown>), '1-1-1': { me: { op: { phase: 'preparing' } } } }));
    expect(result.committed).toBe(true);
    expect(fake.value('config/studentMoveLocks/2026')).toEqual({
      '1-1-1': { me: { op: { phase: 'preparing' } } }, '2-1-1': { other: { op: { phase: 'pending' } } }, '3-1-1': { late: { op: { phase: 'preparing' } } },
    });
    expect(fake.callsOf('rtdb_cas')).toHaveLength(2);
  });

  it('학생 이동 PATCH·확인 읽기: 성공·거절·불명을 구분한다', async () => {
    const { fake, fetch } = setup();
    expect(await patchStudentMoveOnce({ databaseUrl: RTDB_REST_URL, idToken: 'synthetic', payload: { 'config/studentMoveCommits/2026/x': true }, fetchOnce: fetch }))
      .toEqual({ status: 'committed' });
    expect(await readStudentMoveValue({ databaseUrl: RTDB_REST_URL, idToken: 'synthetic', path: 'config/studentMoveCommits/2026/x', isCurrent: () => true, fetchOnce: fetch })).toBe(true);
    fake.denyWrite = () => true;
    expect(await patchStudentMoveOnce({ databaseUrl: RTDB_REST_URL, idToken: 'synthetic', payload: { 'a/b': 1 }, fetchOnce: fetch })).toEqual({ status: 'rejected', httpStatus: 401 });
    fake.online = false;
    expect(await patchStudentMoveOnce({ databaseUrl: RTDB_REST_URL, idToken: 'synthetic', payload: { 'a/b': 1 }, fetchOnce: fetch })).toEqual({ status: 'unknown' });
  });

  it('관리 저장: 읽은 ETag 로만 반을 바꾸고, 그 사이 바뀌면 덮지 않고 충돌로 끝낸다', async () => {
    const { fake, fetch } = setup();
    const connection = { databaseUrl: RTDB_REST_URL, getToken: async () => 'synthetic', isCurrent: () => true, fetch };
    await compareManagementSave(connection, async session => {
      const current = await session.read<{ teacher: string }>('classes/2026/1-1-1');
      await session.write('classes/2026/1-1-1', current.etag, { ...current.value, teacher: '바뀐 담임' });
    });
    expect(fake.value('classes/2026/1-1-1/teacher')).toBe('바뀐 담임');
    const conflict = await compareManagementSave(connection, async session => {
      const current = await session.read('classes/2026/1-1-1');
      fake.externalWrite({ 'classes/2026/1-1-1/teacher': '동시 수정' });
      await session.write('classes/2026/1-1-1', current.etag, { teacher: '덮어쓰기' });
    }).catch((error: { kind: string }) => error);
    expect(conflict).toMatchObject({ kind: 'conflict' });
    expect(fake.value('classes/2026/1-1-1/teacher')).toBe('동시 수정');
  });
});
