import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase, get, ref, set, update, type Database } from 'firebase/database';
const holder = vi.hoisted(() => ({ database: null as Database | null }));
vi.mock('@/lib/firebase/client', () => ({ get db() { return holder.database; } }));
import { archiveRoster } from '@/lib/rosterRecovery';
import { runTransaction } from '@/lib/db';
import { restoreMissingClass, restoreMissingStudent } from '@/utils/studentPersistence';
import { buildAttendanceCheckPatch } from '@/lib/attendanceCheckSave';
import { attendanceStudentToken, type AttendanceCheck } from '@/utils/attendanceChecks';
import type { AttValue } from '@/types';
const suite = process.env.ATTENDANCE_CONTRACTS === '1' ? describe : describe.skip;
const base = 'http://127.0.0.1:19017';
const ns = 'demo-attendance-recovery-default-rtdb';
const student = { id: 's', personId: 'person-s', name: '합성 학생' };
const input = { year: 2026, classKey: '1-1-1', studentId: 's', openedStudent: student, actor: '합성 관리자' };
let apps: FirebaseApp[] = [], admin: Database, teacher: Database, second: Database, demo: Database, stranger: Database;
let superAdmin: Database, retreatPastor: Database, retreatAdmin: Database, retreatLeader: Database;
let legacyRetreatAdmin: Database, legacyRetreatPastor: Database, legacyRetreatLeader: Database, iguard: Database, member: Database, field: Database, iguardCentral: Database;
let mixedIguard: Database, mixedField: Database, retreatOnlyPastor: Database, legacyIguard: Database;
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
    admin = client('admin'); second = client('admin2'); teacher = client('teacher'); demo = client('demo'); stranger = client('stranger');
    superAdmin = client('super'); retreatPastor = client('retreat-pastor'); retreatAdmin = client('retreat-admin');
    retreatLeader = client('retreat-leader'); legacyRetreatAdmin = client('retreat-legacy'); iguard = client('iguard');
    legacyRetreatPastor = client('retreat-legacy-pastor'); legacyRetreatLeader = client('retreat-legacy-leader');
    member = client('member'); field = client('field'); iguardCentral = client('iguard-central');
    mixedIguard = client('mixed-iguard'); mixedField = client('mixed-field');
    retreatOnlyPastor = client('retreat-only-pastor'); legacyIguard = client('iguard-legacy');
    holder.database = admin;
  });
  beforeEach(async () => {
    const response = await fetch(`${base}/.json?ns=${ns}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify({
      attendanceAdmins: { admin: true, admin2: true, demo: true },
      admins: { super: true },
      retreatAdmins: {
        'retreat-pastor': { email: 'pastor@example.test', role: 'pastor', retreatRole: 'pastor' },
        'retreat-admin': { email: 'admin-team@example.test', role: 'adminTeam', retreatRole: 'adminTeam' },
        'retreat-leader': { email: 'leader@example.test', role: 'leader', retreatRole: 'leader', teamMemberships: { praise: { role: 'leader', active: true } } },
        'retreat-legacy': { email: 'legacy@example.test' },
        'retreat-legacy-pastor': { email: 'legacy-pastor@example.test', role: 'pastor' },
        'retreat-legacy-leader': { email: 'legacy-leader@example.test', role: 'leader' },
        'mixed-iguard': { email: 'mixed-iguard@example.test', role: 'adminTeam', semesterRole: 'barnabas', retreatRole: 'iguardTeam' },
        'mixed-field': { email: 'mixed-field@example.test', role: 'adminTeam', semesterRole: 'barnabas', retreatRole: 'fieldStaff' },
        'retreat-only-pastor': { email: 'retreat-only-pastor@example.test', role: 'pastor', semesterRole: 'praise', retreatRole: 'pastor' },
      },
      iguardMembers: {
        iguard: { email: 'iguard@example.test', retreatRole: 'iguardTeam' },
        member: { email: 'member@example.test', semesterRole: 'praise', teamMemberships: { praise: { role: 'staff', active: true } } },
        field: { email: 'field@example.test', retreatRole: 'fieldStaff' },
        'iguard-central': { email: 'central@example.test', semesterRole: 'adminTeam', retreatRole: 'adminTeam' },
        'iguard-legacy': { email: 'iguard-legacy@example.test' },
      },
      iguardRoles: { iguard: 'team', field: 'staff' },
      retreatsPrivate: { 'retreat-contract': { medicalLogs: { existing: { note: '합성 의료 기록' } } } },
      config: { pastoralReport: { blockedDemoUid: 'demo' } },
      semesters: { '2026-1': { newFriends: { f: { name: '합성 새친구' } }, applications: { privateScope: true } }, '2026-2': { newFriends: { f: { name: '합성 새친구' } } }, '2026-sunday': { newFriends: { f: { name: '합성 새친구' } } } },
      semestersPrivate: { '2026-sunday': { newFriendsPrivate: { f: { teamMemo: '기존 비고', phone: '합성 연락처', familyNotes: '합성 가족 메모', pastoralNotes: '비공개 합성 메모' } } } },
      userRoles: { teacher__at__example__dot__test: { email: 'teacher@example.test', role: 'teacher', part: '1', grade: '1', class: '1' }, admin__at__example__dot__test: { email: 'admin@example.test', role: 'admin' }, admin2__at__example__dot__test: { email: 'admin2@example.test', role: 'admin' }, demo__at__example__dot__test: { email: 'demo@example.test', role: 'admin' } },
      classes: { 2026: { '1-1-1': { teacher: '합성 교사', students: { s: student } } } },
      attendance: { 2026: { '1-1-1': { s: { '0906': 'O' } } } },
      teacherStaff: { 2026: { t1: { name: '합성 스탭' } } },
      retreats: { 'retreat-contract': { name: '합성 수련회', year: 2026, iguard: { guide: ['기존 안내'] } } },
    }) });
    expect(response.ok).toBe(true);
  });
  afterAll(async () => { await Promise.all(apps.map(app => deleteApp(app))); apps = []; });
  const checkPath = 'attendanceChecks/2026/1-1-1/9-3';
  const attendancePath = 'attendance/2026/1-1-1';
  async function checkPatch(uid = 'teacher', sid = 's', expected: AttValue = '', value: AttValue = 'O', none = false) {
    const current = (await get(ref(admin, 'classes/2026/1-1-1'))).val();
    return buildAttendanceCheckPatch({ year: 2026, target: { ck: '1-1-1', sid, k: '9-3' }, expected, value,
      student: current?.students?.[sid] ? { ...current.students[sid], id: sid } : undefined, none }, current,
      (await get(ref(admin, attendancePath))).val(), (await get(ref(admin, checkPath))).val() as AttendanceCheck | null,
      uid, crypto.randomUUID(), Date.UTC(2026, 10, 1))!;
  }
  async function rawSnapshot() { return (await fetch(`${base}/.json?ns=${ns}`, { headers: { Authorization: 'Bearer owner' } })).json(); }
  function cellPatch(uid = 'teacher', sid = 's', expected: AttValue = '', value: AttValue = 'O', revision = 1, token = 'person-s') {
    return {
      [`attendance/2026/1-1-1/${sid}/8-1`]: value || null,
      [`attendanceCellWrites/2026/1-1-1/${sid}/8-1`]: {
        revision, studentToken: token, expected, value, operationId: crypto.randomUUID(), updatedBy: uid, updatedAt: { '.sv': 'timestamp' },
      },
    };
  }
  async function addCheckStudents() {
    await set(ref(admin, 'classes/2026/1-1-1/students/other'), { id: 'other', name: '합성 다른 학생' });
    await set(ref(admin, 'classes/2026/1-1-1/students/long'), { id: 'long', name: '합성 장결', jang: true });
  }
  it('구방식 개별 출석도 영수증과 원자 저장·해제하고 기존 명단과 과거 기록을 보존한다', async () => {
    const before = await rawSnapshot();
    await update(ref(teacher), cellPatch());
    const receiptPath = 'attendanceCellWrites/2026/1-1-1/s/8-1';
    const receipt = (await get(ref(teacher, receiptPath))).val();
    expect(receipt).toMatchObject({ revision: 1, studentToken: 'person-s', expected: '', value: 'O', updatedBy: 'teacher' });
    expect(receipt.updatedAt).toBeGreaterThan(0);
    expect((await get(ref(admin, 'attendance/2026/1-1-1/s'))).val()).toEqual({ '0906': 'O', '8-1': 'O' });
    await update(ref(teacher), cellPatch('teacher', 's', 'O', '', 2));
    expect((await get(ref(admin, receiptPath))).val()).toMatchObject({ revision: 2, expected: 'O', value: '' });
    expect((await get(ref(admin, 'attendance/2026/1-1-1/s'))).val()).toEqual({ '0906': 'O' });
    expect((await rawSnapshot()).classes).toEqual(before.classes);
  });
  it('구방식 출석은 위조 토큰·UID·revision·사전값·최종 셀 불일치를 전체 거절한다', async () => {
    const receiptPath = 'attendanceCellWrites/2026/1-1-1/s/8-1';
    const original = cellPatch();
    const receipt = original[receiptPath] as Record<string, unknown>;
    const before = await rawSnapshot();
    for (const changed of [{ studentToken: 'forged-person' }, { updatedBy: 'admin' }, { revision: 2 }, { expected: 'X' }, { value: 'X' }, { updatedAt: 1 }]) {
      await expect(update(ref(teacher), { ...original, [receiptPath]: { ...receipt, ...changed } })).rejects.toThrow();
      expect(await rawSnapshot()).toEqual(before);
    }
  });
  it('구방식 출석 해제 뒤 같은 SID를 다른 인물로 바꾸면 옛 영수증으로 재기록하지 못한다', async () => {
    const legacy = { id: 's', name: '레거시 합성 학생', birth: '2010.01.01' };
    await set(ref(admin, 'classes/2026/1-1-1/students/s'), legacy);
    const token = attendanceStudentToken(legacy);
    await update(ref(teacher), cellPatch('teacher', 's', '', 'O', 1, token));
    await update(ref(teacher), cellPatch('teacher', 's', 'O', '', 2, token));
    const stale = cellPatch('teacher', 's', '', 'O', 3, token);
    await set(ref(admin, 'classes/2026/1-1-1/students/s'), { ...legacy, birth: '2010.02.02' });
    const before = await rawSnapshot();
    await expect(update(ref(teacher), stale)).rejects.toThrow();
    expect(await rawSnapshot()).toEqual(before);
    expect((await get(ref(admin, 'attendanceCellWrites/2026/1-1-1/s/8-1'))).val()).toMatchObject({ revision: 2, value: '' });
  });
  it('구방식 영수증은 교사 본인 반만 허용하며 내부 id와 무관하게 실제 SID의 인물을 검증한다', async () => {
    await set(ref(admin, 'classes/2026/1-1-1/students/s/id'), 'other');
    await set(ref(admin, 'classes/2026/1-1-1/students/other'), { id: 'other', name: '다른 합성 학생', personId: 'other-person' });
    await update(ref(teacher), cellPatch());
    expect((await get(ref(admin, 'attendance/2026/1-1-1/s/8-1'))).val()).toBe('O');
    expect((await get(ref(admin, 'attendance/2026/1-1-1/other/8-1'))).exists()).toBe(false);
    const receipt = 'attendanceCellWrites/2026/1-1-1/s/8-1';
    for (const database of [stranger, retreatAdmin]) await expect(get(ref(database, receipt))).rejects.toThrow();
    await expect(get(ref(teacher, 'attendanceCellWrites/2026/2-1-1/s/8-1'))).rejects.toThrow();
    const before = await rawSnapshot();
    await expect(update(ref(teacher), cellPatch('teacher', 'other'))).rejects.toThrow();
    const wrongClass = Object.fromEntries(Object.entries(cellPatch()).map(([path, value]) => [path.replaceAll('1-1-1', '2-1-1'), value]));
    await expect(update(ref(teacher), wrongClass)).rejects.toThrow();
    expect(await rawSnapshot()).toEqual(before);
  });
  it('구방식 장결 학생의 T 출석 해제와 저장된 빈 문자열도 기존 의미대로 처리한다', async () => {
    await set(ref(admin, 'classes/2026/1-1-1/students/s/jang'), true);
    await set(ref(admin, 'attendance/2026/1-1-1/s/8-1'), 'T');
    const before = await rawSnapshot();
    await update(ref(teacher), cellPatch('teacher', 's', 'O', ''));
    expect((await get(ref(admin, 'attendance/2026/1-1-1/s'))).val()).toEqual({ '0906': 'O' });
    await set(ref(admin, 'attendance/2026/1-1-1/s/8-1'), '');
    await update(ref(teacher), cellPatch('teacher', 's', '', 'O', 2));
    expect((await get(ref(admin, 'attendance/2026/1-1-1/s'))).val()).toEqual({ '0906': 'O', '8-1': 'O' });
    expect((await rawSnapshot()).classes).toEqual(before.classes);
    expect((await get(ref(admin, 'attendanceCellWrites/2026/1-1-1/s/8-1'))).val()).toMatchObject({ revision: 2, expected: '', value: 'O' });
  });
  it('구방식 영수증의 삭제·추가 필드·재생·동시 revision은 원자 거절한다', async () => {
    const receiptPath = 'attendanceCellWrites/2026/1-1-1/s/8-1';
    const first = cellPatch();
    await update(ref(teacher), first);
    let before = await rawSnapshot();
    for (const database of [teacher, admin]) {
      await expect(set(ref(database, receiptPath), null)).rejects.toThrow();
      expect(await rawSnapshot()).toEqual(before);
    }
    const next = cellPatch('teacher', 's', 'O', 'X', 2);
    const receipt = next[receiptPath] as Record<string, unknown>;
    await expect(update(ref(teacher), { ...next, [receiptPath]: { ...receipt, unexpected: true } })).rejects.toThrow();
    await expect(update(ref(teacher), { ...next, [receiptPath]: { ...receipt, operationId: (first[receiptPath] as Record<string, unknown>).operationId } })).rejects.toThrow();
    expect(await rawSnapshot()).toEqual(before);
    const stale = cellPatch('admin2', 's', 'O', 'X', 2);
    await update(ref(teacher), cellPatch('teacher', 's', 'O', 'O', 2));
    expect((await get(ref(admin, 'attendance/2026/1-1-1/s/8-1'))).val()).toBe('O');
    before = await rawSnapshot();
    await expect(update(ref(second), stale)).rejects.toThrow();
    expect(await rawSnapshot()).toEqual(before);
  });
  it('구방식 출석은 관리자도 명단 없는 학생 또는 이동 잠금 중이면 전체 거절한다', async () => {
    await set(ref(admin, 'classes/2026/1-1-1/students/s'), null);
    let before = await rawSnapshot();
    await expect(update(ref(admin), cellPatch('admin'))).rejects.toThrow();
    expect(await rawSnapshot()).toEqual(before);
    await set(ref(admin, 'classes/2026/1-1-1/students/s'), student);
    await set(ref(admin, 'config/studentMoveLocks/2026/1-1-1/admin/legacy-lock'), { phase: 'preparing', startedAt: Date.now(), fromCk: '1-1-1', toCk: '1-1-2', sid: 's' });
    before = await rawSnapshot();
    for (const [database, uid] of [[teacher, 'teacher'], [admin, 'admin']] as const) await expect(update(ref(database), cellPatch(uid))).rejects.toThrow();
    expect(await rawSnapshot()).toEqual(before);
  });
  it('서버의 주일 키 검사는 한·두 자리 월을 허용하고 잘못된 월·주차 키는 원자 거절한다', async () => {
    const original = await checkPatch();
    const forKey = (key: string) => Object.fromEntries(Object.entries(original).map(([path, value]) => [path.replaceAll('/9-3', `/${key}`), value]));
    for (const key of ['9-3', '10-0']) {
      await update(ref(teacher), forKey(key));
      expect((await get(ref(admin, `attendanceChecks/2026/1-1-1/${key}`))).val()).toMatchObject({ revision: 1, targetSid: 's' });
      expect((await get(ref(admin, `${attendancePath}/s/${key}`))).val()).toBe('O');
    }
    for (const key of ['12-0', '01-0', '9-5', '9x-3']) {
      const before = await rawSnapshot();
      await expect(update(ref(teacher), forKey(key))).rejects.toThrow();
      expect(await rawSnapshot()).toEqual(before);
    }
  });
  it('새 출석 체크는 본인 반 O·다른 일반 학생 빈칸 X·시작 상태를 원자 저장하며 명단·옛 출석을 보존한다', async () => {
    await addCheckStudents(); const before = await rawSnapshot();
    await update(ref(teacher), await checkPatch());
    const after = await rawSnapshot();
    expect(after.classes).toEqual(before.classes);
    expect(after.attendance[2026]['1-1-1']).toEqual({ s: { '0906': 'O', '9-3': 'O' }, other: { '9-3': 'X' } });
    const record = (await get(ref(admin, checkPath))).val();
    expect(record).toMatchObject({ revision: 1, updatedBy: 'teacher', allAbsent: false, roster: { s: 'person-s', other: 'legacy:합성 다른 학생|' }, targetSid: 's', targetToken: 'person-s', expected: '', value: 'O' });
    expect(record.startedAt).toBe(record.updatedAt); expect(record.updatedAt).toBeGreaterThan(0);
    expect((await get(ref(teacher, checkPath))).val()).toEqual(record);
    const startedAt = record.startedAt;
    await update(ref(second), await checkPatch('admin2', 'other', 'X', 'O'));
    expect((await get(ref(teacher, checkPath))).val()).toMatchObject({ revision: 2, startedAt, updatedBy: 'admin2', roster: record.roster });
    expect((await get(ref(teacher, `${attendancePath}/s/9-3`))).val()).toBe('O');
  });
  it('새 체크 상태의 미인증·미등록·타반·위조 이메일·레거시 teacherClasses·통합 앱 조회는 거절한다', async () => {
    const patch = await checkPatch('stranger');
    const anonymous = await fetch(`${base}/${checkPath}.json?ns=${ns}`);
    expect([401, 403]).toContain(anonymous.status);
    for (const database of [stranger, retreatAdmin, iguardCentral]) await expect(get(ref(database, checkPath))).rejects.toThrow();
    await expect(update(ref(stranger), patch)).rejects.toThrow();
    await expect(get(ref(teacher, 'attendanceChecks/2026/2-1-1'))).rejects.toThrow();
    const otherClass = Object.fromEntries(Object.entries(await checkPatch()).map(([key, value]) => [key.replaceAll('1-1-1', '2-1-1'), value]));
    await expect(update(ref(teacher), otherClass)).rejects.toThrow();
    await set(ref(admin, 'teacherClasses/stranger'), '1-1-1');
    await expect(update(ref(stranger), patch)).rejects.toThrow();
    await set(ref(admin, 'userRoles/stranger__at__example__dot__test'), { email: 'different@example.test', role: 'teacher', part: '1', grade: '1', class: '1' });
    await expect(update(ref(stranger), patch)).rejects.toThrow();
    await expect(update(ref(teacher), { ...await checkPatch(), 'classes/2026/1-1-1/students/s/addr': '변경 금지' })).rejects.toThrow();
    expect((await get(ref(admin, checkPath))).exists()).toBe(false);
  });
  it('같은 체크 revision으로 경합하면 한 번만 반영하고 다른 학생의 최신 출석을 덮지 않는다', async () => {
    await addCheckStudents();
    const first = await checkPatch(), stale = await checkPatch('admin2', 'other');
    await update(ref(teacher), first);
    await expect(update(ref(second), stale)).rejects.toThrow();
    expect((await get(ref(admin, checkPath))).val()).toMatchObject({ revision: 1, targetSid: 's' });
    expect((await get(ref(admin, `${attendancePath}/other/9-3`))).val()).toBe('X');
    const next = await checkPatch('admin2', 'other', 'X', 'O');
    await expect(update(ref(second), { ...next, [`${checkPath}/revision`]: 1 })).rejects.toThrow();
    await update(ref(second), next);
    expect((await get(ref(admin, checkPath))).val()).toMatchObject({ revision: 2, targetSid: 'other' });
  });
  it('빈칸을 읽은 뒤 다른 학생이 O로 바뀌면 자동 X와 체크 상태도 함께 거절한다', async () => {
    await addCheckStudents(); const stale = await checkPatch();
    await set(ref(second, `${attendancePath}/other/9-3`), 'O'); const before = await rawSnapshot();
    await expect(update(ref(teacher), stale)).rejects.toThrow(); expect(await rawSnapshot()).toEqual(before);
    expect((await get(ref(admin, checkPath))).exists()).toBe(false);
  });
  it.each([false, true])('기존 체크가 있어도 대상 SID의 인물이 GET 뒤 교체되면 O/X가 같아도 거절한다(새 전입=%s)', async newlyArrived => {
    await update(ref(teacher), await checkPatch('teacher', 's', '', '', true));
    const sid = newlyArrived ? 'new' : 's';
    if (newlyArrived) await set(ref(admin, 'classes/2026/1-1-1/students/new'), { id: 'new', personId: 'person-new', name: '합성 전입' });
    const patch = await checkPatch('teacher', sid, newlyArrived ? '' : 'X', 'O');
    expect(patch[`${checkPath}/targetToken`]).toBe(newlyArrived ? 'person-new' : 'person-s');
    await set(ref(admin, `classes/2026/1-1-1/students/${sid}/personId`), '다른 인물로 교체');
    const before = await rawSnapshot();
    await expect(update(ref(teacher), patch)).rejects.toThrow();
    expect(await rawSnapshot()).toEqual(before);
    expect((await get(ref(admin, checkPath))).val()).toMatchObject({ revision: 1, allAbsent: true });
  });
  it('전체 결석 확인도 실제 O를 지우지 않고 기존 빈칸만 X로 기록한다', async () => {
    await addCheckStudents(); await update(ref(teacher), await checkPatch('teacher', 's', '', '', true));
    expect((await get(ref(admin, checkPath))).val()).toMatchObject({ allAbsent: true, targetSid: '', targetToken: '', expected: '', value: '' });
    expect((await get(ref(admin, `${attendancePath}/s/9-3`))).val()).toBe('X');
    expect((await get(ref(admin, `${attendancePath}/other/9-3`))).val()).toBe('X');
  });
  it('전체 결석 명시 확인은 첫 스냅샷 뒤 새로 온 일반 학생도 확인하되 스냅샷은 유지한다', async () => {
    await update(ref(teacher), await checkPatch('teacher', 's', '', '', true));
    const original = (await get(ref(admin, checkPath))).val();
    await set(ref(admin, 'classes/2026/1-1-1/students/new'), { id: 'new', name: '합성 전입' });
    await update(ref(teacher), await checkPatch('teacher', 's', 'X', '', true));
    expect((await get(ref(admin, `${attendancePath}/new/9-3`))).val()).toBe('X');
    expect((await get(ref(admin, checkPath))).val()).toMatchObject({ revision: 2, allAbsent: true, roster: original.roster });
  });
  it('이전 T 출석 사전값을 O로 확인하며 새 체크와 무관한 기존 셀 편집도 유지한다', async () => {
    await set(ref(admin, `${attendancePath}/s/9-3`), 'T');
    await update(ref(teacher), await checkPatch('teacher', 's', 'O', 'X'));
    expect((await get(ref(admin, checkPath))).val()).toMatchObject({ expected: 'O', value: 'X' });
    await set(ref(teacher, `${attendancePath}/s/9-3`), 'O');
    await set(ref(teacher, `${attendancePath}/s/0906`), 'X');
    expect((await get(ref(admin, `${attendancePath}/s`))).val()).toEqual({ '9-3': 'O', '0906': 'X' });
  });
  it('스냅샷 학생이 이동·삭제·장결 전환되거나 반 이동 잠금이 생기면 체크 요청 전체를 거절한다', async () => {
    const patch = await checkPatch();
    await set(ref(admin, 'classes/2026/1-1-1/students/s/jang'), true); let before = await rawSnapshot();
    await expect(update(ref(teacher), patch)).rejects.toThrow(); expect(await rawSnapshot()).toEqual(before);
    await set(ref(admin, 'classes/2026/1-1-1/students/s'), null); before = await rawSnapshot();
    await expect(update(ref(teacher), patch)).rejects.toThrow(); expect(await rawSnapshot()).toEqual(before);
    await set(ref(admin, 'classes/2026/1-1-1/students/s'), student);
    await set(ref(admin, 'config/studentMoveLocks/2026/1-1-1/admin/check-lock'), { phase: 'preparing', startedAt: Date.now(), fromCk: '1-1-1', toCk: '1-1-2', sid: 's' });
    before = await rawSnapshot();
    for (const database of [teacher, admin]) await expect(update(ref(database), patch)).rejects.toThrow();
    expect(await rawSnapshot()).toEqual(before);
  });
  it('체크 상태는 필수 필드·서버 시각·UID·정수 revision·새 operationId·동일 학생 사전값을 검증한다', async () => {
    const patch = await checkPatch(); const before = await rawSnapshot();
    for (const [field, value] of [['revision', 2], ['revision', 1.5], ['updatedBy', 'admin'], ['updatedAt', 1], ['startedAt', 1], ['operationId', ''], ['targetToken', '다른 인물'], ['expected', 'O'], ['value', '임의 값'], ['allAbsent', 'true'], ['unknown', '금지']] as const) {
      await expect(update(ref(teacher), { ...patch, [`${checkPath}/${field}`]: value })).rejects.toThrow();
      expect(await rawSnapshot()).toEqual(before);
    }
    const missing = { ...patch }; delete missing[`${checkPath}/startedAt`];
    await expect(update(ref(teacher), missing)).rejects.toThrow();
    for (const [id, token] of [['s', '다른 인물'], ['missing', 'missing']]) {
      await expect(update(ref(teacher), { ...patch, [`${checkPath}/roster/${id}`]: token })).rejects.toThrow();
    }
    expect(await rawSnapshot()).toEqual(before);
  });
  it('최초 반 학생 스냅샷은 이후 추가·교체·삭제·부모 덮어쓰기를 허용하지 않는다', async () => {
    await update(ref(teacher), await checkPatch());
    const before = await rawSnapshot();
    await expect(set(ref(teacher, checkPath), { ...(await get(ref(admin, checkPath))).val(), revision: 2 })).rejects.toThrow();
    await expect(set(ref(teacher, checkPath), null)).rejects.toThrow();
    await expect(set(ref(admin, checkPath), null)).rejects.toThrow();
    await expect(set(ref(teacher, `${checkPath}/updatedBy`), null)).rejects.toThrow();
    for (const value of [null, '다른 인물']) await expect(set(ref(teacher, `${checkPath}/roster/s`), value)).rejects.toThrow();
    await expect(set(ref(teacher, `${checkPath}/roster/new`), 'new')).rejects.toThrow();
    await expect(set(ref(teacher, `${checkPath}/roster`), { s: 'person-s' })).rejects.toThrow();
    expect(await rawSnapshot()).toEqual(before);
  });
  it('개인 출석부 관리자는 세 작업공간의 비고 leaf만 읽고 수정하며 다른 필드는 보존한다', async () => {
    for (const workspace of ['2026-1', '2026-2', '2026-sunday']) {
      const path = `semestersPrivate/${workspace}/newFriendsPrivate/f/teamMemo`;
      await get(ref(admin, path));
      await set(ref(admin, path), '수정 비고'); expect((await get(ref(second, path))).val()).toBe('수정 비고');
      await set(ref(admin, path), null); expect((await get(ref(second, path))).val()).toBeNull();
    }
    const priv = 'semestersPrivate/2026-sunday/newFriendsPrivate/f';
    for (const suffix of ['', '/phone', '/familyNotes', '/pastoralNotes']) {
      await expect(get(ref(admin, `${priv}${suffix}`))).rejects.toThrow();
      await expect(set(ref(admin, `${priv}${suffix}`), '금지')).rejects.toThrow();
    }
    expect((await get(ref(superAdmin, priv))).val()).toMatchObject({ phone: '합성 연락처', familyNotes: '합성 가족 메모', pastoralNotes: '비공개 합성 메모' });
  });
  it('비고는 데모·교사·미등록 계정에게 열리지 않는다', async () => {
    const path = 'semestersPrivate/2026-sunday/newFriendsPrivate/f/teamMemo';
    for (const client of [demo, teacher, stranger]) {
      await expect(get(ref(client, path))).rejects.toThrow(); await expect(set(ref(client, path), '금지')).rejects.toThrow();
    }
    await set(ref(superAdmin, 'attendanceAdmins/teacher'), true);
    await expect(get(ref(teacher, path))).rejects.toThrow(); await expect(set(ref(teacher, path), '금지')).rejects.toThrow();
    await set(ref(superAdmin, 'config/pastoralReport/blockedDemoUid'), null);
    await expect(get(ref(admin, path))).rejects.toThrow(); await expect(set(ref(admin, path), '금지')).rejects.toThrow();
  });
  it('삭제된 학생·잘못된 작업공간·객체·너무 긴 비고 쓰기를 거절한다', async () => {
    const prefix = 'semestersPrivate/2026-sunday/newFriendsPrivate';
    for (const value of [{ phone: '오류' }, '가'.repeat(10001)]) await expect(set(ref(admin, `${prefix}/f/teamMemo`), value)).rejects.toThrow();
    await expect(set(ref(admin, `${prefix}/missing/teamMemo`), '금지')).rejects.toThrow();
    await set(ref(superAdmin, 'semesters/2026-sunday/newFriends/f'), null);
    await expect(set(ref(admin, `${prefix}/f/teamMemo`), '재생성 금지')).rejects.toThrow();
    await expect(set(ref(admin, 'semestersPrivate/2026-other/newFriendsPrivate/f/teamMemo'), '금지')).rejects.toThrow();
    // 기존 통합사이트 상위 권한과 비공개 메모 형태는 좁은 추가 권한 때문에 바뀌지 않는다.
    await set(ref(superAdmin, `${prefix}/f/teamMemo`), '가'.repeat(10001));
    expect((await get(ref(superAdmin, `${prefix}/f/teamMemo`))).val()).toHaveLength(10001);
  });
  it('진급·시트 배치는 잠금 상실 후 지연 도착과 같은 요청 재생을 거절한다', async () => {
    const lockPath = 'config/studentMoveLocks/2026/1-1-1/admin/batch';
    const markerPath = 'config/rosterBatchCommits/2026/1-1-1/admin/batch';
    const lock = { phase: 'preparing', startedAt: Date.now(), sid: '__sheet_sync__', fromCk: '1-1-1', toCk: '1-1-2' };
    const payload = { 'classes/2026/1-1-1/teacher': '배치 담임', [lockPath]: null, [markerPath]: true };
    await set(ref(admin, lockPath), lock);
    await set(ref(admin, lockPath), null);
    await expect(update(ref(admin), payload)).rejects.toThrow();
    expect((await get(ref(admin, 'classes/2026/1-1-1/teacher'))).val()).toBe('합성 교사');
    await set(ref(admin, lockPath), lock);
    await update(ref(admin), payload);
    expect((await get(ref(admin, markerPath))).val()).toBe(true);
    await set(ref(admin, 'classes/2026/1-1-1/teacher'), '최신 담임');
    await expect(update(ref(admin), payload)).rejects.toThrow();
    expect((await get(ref(admin, 'classes/2026/1-1-1/teacher'))).val()).toBe('최신 담임');
    await expect(set(ref(admin, markerPath), null)).rejects.toThrow();
  });
  it('수련회 민감정보는 통합관리자·교역자·행정팀과 레거시 행정팀만 읽고 쓴다', async () => {
    for (const database of [superAdmin, retreatPastor, retreatAdmin, legacyRetreatAdmin, legacyRetreatPastor]) {
      expect((await get(ref(database, 'retreatsPrivate/retreat-contract/medicalLogs'))).exists()).toBe(true);
      await set(ref(database, 'retreatsPrivate/retreat-contract/medicalLogs/verified'), { note: '권한 확인' });
    }
    for (const database of [retreatLeader, legacyRetreatLeader, iguard, stranger]) {
      await expect(get(ref(database, 'retreatsPrivate/retreat-contract/medicalLogs'))).rejects.toThrow();
      await expect(set(ref(database, 'retreatsPrivate/retreat-contract/medicalLogs/blocked'), { note: '차단 확인' })).rejects.toThrow();
    }
  });
  it('일반 팀원은 연간 원장 전체를 읽지 못하고 수련회 행정 필드를 쓰지 못한다', async () => {
    for (const database of [member, field, iguard, retreatLeader, mixedIguard, mixedField, retreatOnlyPastor]) {
      for (const path of ['classes/2026', 'attendance/2026', 'teacherStaff/2026']) {
        await expect(get(ref(database, path))).rejects.toThrow();
      }
    }
    await expect(set(ref(member, 'retreats/retreat-contract/name'), '변경')).rejects.toThrow();
    for (const database of [retreatLeader, iguard, field, mixedIguard, mixedField]) {
      await expect(set(ref(database, 'retreats/retreat-contract/name'), '변경')).rejects.toThrow();
    }
    await set(ref(retreatAdmin, 'retreats/retreat-contract/name'), '행정 변경');
    expect((await get(ref(retreatAdmin, 'retreats/retreat-contract/name'))).val()).toBe('행정 변경');
    await set(ref(iguard, 'retreats/retreat-contract/iguard/guide'), ['현장 안내']);
    await set(ref(field, 'retreats/retreat-contract/iguard/attendance/s'), { checked: true });
    await set(ref(mixedIguard, 'retreats/retreat-contract/iguard/guide'), ['혼합 역할 안내']);
    await set(ref(mixedField, 'retreats/retreat-contract/iguard/attendance/s'), { checked: true });
    await set(ref(legacyIguard, 'retreats/retreat-contract/iguard/guide'), ['레거시 안내']);
    await set(ref(mixedIguard, 'retreats/retreat-contract/milestones/guide'), { title: '준비', done: false });
    await expect(set(ref(field, 'retreats/retreat-contract/iguard/guide'), ['무단 변경'])).rejects.toThrow();
    for (const path of ['classes/2026', 'attendance/2026', 'teacherStaff/2026']) {
      expect((await get(ref(iguardCentral, path))).exists()).toBe(true);
    }
  });
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
    await archiveRoster({ year: input.year, classKey: input.classKey, actor: input.actor });
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
