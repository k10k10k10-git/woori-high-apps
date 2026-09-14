import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase, get, ref, set, update, type Database } from 'firebase/database';
const holder = vi.hoisted(() => ({ database: null as Database | null }));
vi.mock('@/lib/firebase/client', () => ({ get db() { return holder.database; } }));
import { archiveRoster } from '@/lib/rosterRecovery';
import { runTransaction } from '@/lib/db';
import { restoreMissingClass, restoreMissingStudent } from '@/utils/studentPersistence';
const suite = process.env.ATTENDANCE_CONTRACTS === '1' ? describe : describe.skip;
const base = 'http://127.0.0.1:19017';
const ns = 'demo-attendance-recovery-default-rtdb';
const student = { id: 's', personId: 'person-s', name: '합성 학생' };
const input = { year: 2026, classKey: '1-1-1', studentId: 's', personId: 'person-s', actor: '합성 관리자' };
let apps: FirebaseApp[] = [], admin: Database, teacher: Database, second: Database, demo: Database, stranger: Database;
suite('운영 Rules 사본을 사용하는 실제 Firebase 삭제·복원 계약', () => {
  beforeAll(() => {
    if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('합성 에뮬레이터 주소가 아닙니다.');
    const client = (uid: string) => {
      const app = initializeApp({ projectId: 'demo-attendance-recovery', databaseURL: `https://${ns}.firebaseio.com` }, uid);
      apps.push(app);
      const database = getDatabase(app);
      connectDatabaseEmulator(database, '127.0.0.1', 19017, { mockUserToken: { sub: uid, email: `${uid}@example.test` } });
      return database;
    };
    admin = client('admin'); second = client('admin2'); teacher = client('teacher'); demo = client('demo'); stranger = client('stranger'); holder.database = admin;
  });
  beforeEach(async () => {
    const response = await fetch(`${base}/.json?ns=${ns}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify({
      attendanceAdmins: { admin: true, admin2: true, demo: true },
      config: { pastoralReport: { blockedDemoUid: 'demo' } },
      semesters: { '2026-1': { newFriends: { f: { name: '합성 새친구' } }, applications: { privateScope: true } }, '2026-2': { newFriends: { f: { name: '합성 새친구' } } }, '2026-sunday': { newFriends: { f: { name: '합성 새친구' } } } },
      semestersPrivate: { '2026-sunday': { newFriendsPrivate: { f: { pastoralNotes: '비공개 합성 메모' } } } },
      userRoles: { teacher__at__example__dot__test: { email: 'teacher@example.test', role: 'teacher', part: '1', grade: '1', class: '1' } },
      classes: { 2026: { '1-1-1': { teacher: '합성 교사', students: { s: student } } } },
    }) });
    expect(response.ok).toBe(true);
  });
  afterAll(async () => { await Promise.all(apps.map(app => deleteApp(app))); apps = []; });
  it('이동 잠금은 같은 UID의 일반 쓰기도 거절하고 잠금 해제를 포함한 원자 확정만 허용한다', async () => {
    const destination = '1-1-2';
    await set(ref(admin, `classes/2026/${destination}`), { teacher: '목적지', students: { other: { id: 'other', name: '기존 합성 학생' } } });
    await set(ref(admin, 'attendance/2026/1-1-1/s/0906'), 'O');
    const operation = 'contract-move';
    const record = { phase: 'pending', startedAt: Date.now(), fromCk: '1-1-1', toCk: destination, sid: 's' };
    await set(ref(admin, 'config/studentMoveLocks/2026'), {
      '1-1-1': { admin: { [operation]: record } }, [destination]: { admin: { [operation]: record } },
    });
    for (const database of [admin, second, teacher]) {
      await expect(set(ref(database, 'attendance/2026/1-1-1/s/0906'), 'X')).rejects.toThrow();
      await expect(update(ref(database, 'classes/2026/1-1-1/students/s'), { school: '경쟁 수정' })).rejects.toThrow();
    }
    await update(ref(admin), {
      'classes/2026/1-1-1/students/s': null,
      [`classes/2026/${destination}/students/s`]: student,
      'attendance/2026/1-1-1/s': null,
      [`attendance/2026/${destination}/s`]: { '0906': 'O' },
      'config/studentMoveLocks/2026/1-1-1/admin/contract-move': null,
      [`config/studentMoveLocks/2026/${destination}/admin/contract-move`]: null,
      [`config/studentMoveCommits/2026/1-1-1/${destination}/s/admin/${operation}`]: true,
    });
    expect((await get(ref(admin, `attendance/2026/${destination}/s/0906`))).val()).toBe('O');
    expect((await get(ref(admin, `classes/2026/${destination}/students/other/name`))).val()).toBe('기존 합성 학생');
    expect((await get(ref(admin, 'config/studentMoveLocks/2026'))).exists()).toBe(false);
    await set(ref(admin, `attendance/2026/${destination}/s/0906`), 'X');
  });
  it('출석부 관리자는 세 공개 새친구 원장만 읽고 다른 학기 영역·비공개·수정 권한을 얻지 않는다', async () => {
    for (const sid of ['2026-1', '2026-2', '2026-sunday']) {
      expect((await get(ref(admin, `semesters/${sid}/newFriends`))).exists()).toBe(true);
      await expect(set(ref(admin, `semesters/${sid}/newFriends/f/name`), '수정 시도')).rejects.toThrow();
    }
    for (const path of ['semesters', 'semesters/2026-1', 'semesters/2026-1/applications', 'semestersPrivate/2026-sunday/newFriendsPrivate']) await expect(get(ref(admin, path))).rejects.toThrow();
    await expect(set(ref(admin, 'config/pastoralReport/blockedDemoUid'), '다른 UID')).rejects.toThrow();
  });
  it('공용 데모·교사·미등록 계정은 새친구 원장을 읽지 못하고 제외 설정도 바꾸지 못한다', async () => {
    for (const database of [demo, teacher, stranger]) {
      await expect(get(ref(database, 'semesters/2026-sunday/newFriends'))).rejects.toThrow();
      await expect(set(ref(database, 'config/pastoralReport/blockedDemoUid'), null)).rejects.toThrow();
    }
  });
  it('데모 제외 설정이 없으면 출석부 관리자의 새 읽기 권한도 닫힌다', async () => {
    const response = await fetch(`${base}/config/pastoralReport.json?ns=${ns}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    expect(response.ok).toBe(true);
    await expect(get(ref(admin, 'semesters/2026-2/newFriends'))).rejects.toThrow();
  });
  it('교사 출석 → 학생 삭제 → 복원에서 출석값과 원래 ID를 유지한다', async () => {
    await set(ref(teacher, 'attendance/2026/1-1-1/s/0906'), 'O');
    await archiveRoster(input);
    expect((await get(ref(admin, 'classes/2026/1-1-1/students/s'))).exists()).toBe(false);
    expect((await get(ref(admin, 'attendance/2026/1-1-1/s/0906'))).val()).toBe('O');
    await expect(set(ref(teacher, 'attendance/2026/1-1-1/s/0906'), 'X')).rejects.toThrow();
    const copies = (await get(ref(admin, 'trash/2026/students'))).val();
    expect(Object.values(copies)).toHaveLength(1);
    const copy = Object.values(copies)[0] as typeof student & { ck?: string; deletedAt?: number };
    delete copy.ck; delete copy.deletedAt;
    const result = await runTransaction(ref(admin, 'classes/2026/1-1-1'), current => restoreMissingStudent(current, copy, 'restored', { action: '학생 복원' }));
    expect(result.committed).toBe(true);
    expect((await get(ref(admin, 'attendance/2026/1-1-1/s/0906'))).val()).toBe('O');
    await set(ref(teacher, 'attendance/2026/1-1-1/s/0913'), 'X');
    expect((await get(ref(admin, 'attendance/2026/1-1-1/s'))).val()).toEqual({ '0906': 'O', '0913': 'X' });
  });
  it('반 삭제·복원은 보관 출석을 덮지 않고 같은 반이 생기면 복원을 거절한다', async () => {
    await set(ref(teacher, 'attendance/2026/1-1-1/s/0906'), 'O');
    await archiveRoster({ ...input, studentId: undefined, personId: undefined });
    const copies = (await get(ref(admin, 'trash/2026/classes'))).val();
    const copy = Object.values(copies)[0] as Record<string, unknown>;
    delete copy.ck; delete copy.deletedAt;
    const target = ref(admin, 'classes/2026/1-1-1');
    await get(target);
    expect((await runTransaction(target, current => restoreMissingClass(current, copy))).committed).toBe(true);
    expect((await runTransaction(target, current => restoreMissingClass(current, copy))).committed).toBe(false);
    expect((await get(ref(admin, 'attendance/2026/1-1-1/s/0906'))).val()).toBe('O');
  });
  it('서로 다른 관리자 두 명의 동시 복원은 한 번만 성공한다', async () => {
    await archiveRoster(input);
    const restore = async (database: Database, key: string) => {
      const target = ref(database, 'classes/2026/1-1-1'); await get(target);
      return runTransaction(target, current => restoreMissingStudent(current, student, key, { action: '학생 복원' }));
    };
    const results = await Promise.all([restore(admin, 'a'), restore(second, 'b')]);
    expect(results.filter(result => result.committed)).toHaveLength(1);
    expect((await get(ref(admin, 'classes/2026/1-1-1/students/s'))).val()).toEqual(student);
  });
});
