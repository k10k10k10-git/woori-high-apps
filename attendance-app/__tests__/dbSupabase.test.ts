// '@/lib/db'(화면·업무 코드가 쓰는 출구)가 실제 rtdb 모듈과 Supabase(가짜)로 끝까지 동작하는지 본다.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeSupabase as FakeSupabaseType } from '@/lib/rtdb/testing/fakeSupabase';

const holder = vi.hoisted(() => ({ fake: null as FakeSupabaseType | null }));
vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: () => true, getSupabase: () => holder.fake }));

import { FakeSupabase } from '@/lib/rtdb/testing/fakeSupabase';
import { db, get, onDisconnect, onValue, push, ref, remove, runTransaction, set, syncProtocolDb, update } from '@/lib/db';
import { claimSyncLocks } from '@/lib/sheetSyncCommit';

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
afterAll(() => (db as unknown as { _repo: { dispose(): void } })._repo.dispose());

beforeEach(async () => {
  await tick(50); // 앞 시험의 확인 읽기가 끝나기를 기다린다.
  holder.fake = new FakeSupabase({
    classes: { 2026: { '1-1-1': { teacher: '담임', students: { s: { id: 's', name: '합성 학생' } } } } },
    attendance: { 2026: { '1-1-1': { s: { '0-0': 'O' } } } },
    config: { studentMoveLocks: { 2026: { '2-1-1': { other: { op: { phase: 'pending' } } } } } },
  });
});

describe('@/lib/db → @/lib/rtdb → Supabase', () => {
  it('set·update·remove 는 루트 기준 경로로 rtdb_update 를 보내고 Firebase 처럼 그 위치만 바꾼다', async () => {
    const fake = holder.fake!;
    await set(ref(db, 'attendance/2026/1-1-1/s/0-1'), 'X');
    await update(ref(db, 'classes/2026/1-1-1'), { teacher: '새 담임', 'students/s/phone': '010' });
    await remove(ref(db, 'attendance/2026/1-1-1/s/0-0'));
    expect(fake.callsOf('rtdb_update').map(call => call.args.p_patch)).toEqual([
      { 'attendance/2026/1-1-1/s/0-1': 'X' },
      { 'classes/2026/1-1-1/teacher': '새 담임', 'classes/2026/1-1-1/students/s/phone': '010' },
      { 'attendance/2026/1-1-1/s/0-0': null },
    ]);
    expect(fake.value('attendance/2026/1-1-1/s')).toEqual({ '0-1': 'X' });
    expect(fake.value('classes/2026/1-1-1/students/s')).toEqual({ id: 's', name: '합성 학생', phone: '010' });
    expect((await get(ref(db, 'classes/2026/1-1-1/teacher'))).val()).toBe('새 담임');
  });

  it('push 는 시간 순 20자 키 아래에 쓴다', async () => {
    const pushed = push(ref(db, 'suggestions/2026/1-1-1'), { text: '특이사항' });
    await pushed;
    expect(pushed.key).toMatch(/^[-0-9A-Za-z_]{20}$/);
    expect(holder.fake!.value(`suggestions/2026/1-1-1/${pushed.key}`)).toEqual({ text: '특이사항' });
  });

  it('runTransaction 은 구독으로 첫 값을 확인한 뒤 hash 비교 저장(rtdb_cas)을 한다 — 진급 잠금 선점', async () => {
    const fake = holder.fake!;
    const lockRef = ref(db, 'config/studentMoveLocks/2026');
    const result = await runTransaction(lockRef, current => claimSyncLocks(current, ['1-1-1'], 'admin', 'sheet_x', 1), { applyLocally: false });
    expect(result.committed).toBe(true);
    expect(fake.callsOf('rtdb_get').length + fake.callsOf('rtdb_get_many').length).toBeGreaterThanOrEqual(1);
    expect(fake.callsOf('rtdb_cas')).toHaveLength(1);
    expect(fake.value('config/studentMoveLocks/2026/1-1-1/admin/sheet_x')).toMatchObject({ phase: 'preparing', sid: '__sheet_sync__' });
    expect(fake.value('config/studentMoveLocks/2026/2-1-1')).toEqual({ other: { op: { phase: 'pending' } } });
    // 이미 잠긴 반이면 콜백이 undefined 를 돌려 쓰지 않는다.
    const blocked = await runTransaction(lockRef, current => claimSyncLocks(current, ['2-1-1'], 'admin', 'sheet_y', 1));
    expect(blocked.committed).toBe(false);
    expect(fake.callsOf('rtdb_cas')).toHaveLength(1);
  });

  it('runTransaction 은 다른 사람이 먼저 쓰면 최신 값으로 다시 계산한다(동기화 프로토콜용 원본도 같다)', async () => {
    const fake = holder.fake!;
    fake.casConflicts = 1;
    fake.casConflictValue = 5;
    const result = await syncProtocolDb.runTransaction(ref(db, 'counter'), current => (typeof current === 'number' ? current : 0) + 1);
    expect(result.committed).toBe(true);
    expect(fake.value('counter')).toBe(6);
  });

  it('읽기 권한이 없으면 트랜잭션 쓰기를 시작하지 않는다', async () => {
    const fake = holder.fake!;
    fake.denyRead = path => path.startsWith('config');
    await expect(runTransaction(ref(db, 'config/studentMoveLocks/2026'), current => current)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(fake.callsOf('rtdb_cas')).toHaveLength(0);
    expect(fake.callsOf('rtdb_get_hashed')).toHaveLength(0);
  });

  it('출석 저장 거부는 화면 값을 되돌리고 PERMISSION_DENIED 로 끝난다', async () => {
    const fake = holder.fake!;
    const seen: unknown[] = [];
    const stop = onValue(ref(db, 'attendance/2026/1-1-1/s'), snapshot => seen.push(snapshot.val()));
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    fake.denyWrite = () => true;
    await expect(set(ref(db, 'attendance/2026/1-1-1/s/0-0'), 'X')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(seen.at(-1)).toEqual({ '0-0': 'O' });
    stop();
  });

  it('onDisconnect 도 같은 출구에서 쓸 수 있다(세션이 없으면 등록이 거부된다)', async () => {
    const reservation = onDisconnect(ref(db, 'config/studentMoveLocks/2026'));
    expect(Object.keys(reservation).sort()).toEqual(['cancel', 'remove', 'set', 'update']);
    // 가짜 클라이언트에는 로그인 세션이 없다.
    await expect(reservation.update({ '1-1-1/admin/op': null })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(reservation.cancel()).resolves.toBeUndefined();
  });
});
