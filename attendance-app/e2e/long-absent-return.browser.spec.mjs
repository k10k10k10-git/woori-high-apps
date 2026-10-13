import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';
const ns = 'demo-attendance-recovery-default-rtdb';
const root = `http://127.0.0.1:19017/.json?ns=${ns}`;
const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
const password = 'synthetic-password-123';
const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));
const classUrl = `http://127.0.0.1:19017/classes/${year}/1-1-1.json?ns=${ns}`;
const owner = { Authorization: 'Bearer owner' };
async function seed(request, teacher = false) {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19099') throw new Error('격리 에뮬레이터가 필요합니다.');
  const email = teacher ? 'return-teacher@example.test' : 'return-admin@example.test';
  await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data: { email, password, returnSecureToken: true } });
  const login = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data: { email, password, returnSecureToken: true } });
  expect(login.ok()).toBe(true); const { localId, idToken } = await login.json();
  const data = {
    userRoles: { [email.replace(/@/g, '__at__').replace(/\./g, '__dot__')]: { email, role: teacher ? 'teacher' : 'admin', name: '합성 담당', ...(teacher ? { part: '1', grade: '1', class: '1' } : {}) } },
    ...(teacher ? {} : { attendanceAdmins: { [localId]: true } }),
    classes: { [year]: { '1-1-1': { teacher: '합성 교사', extra: '반 보존', students: {
      active: { name: '합성 일반 학생', personId: 'person-active', phone: '010-0000-0001', num: 1 },
      long: { id: 'active', name: '합성 복귀 학생', personId: 'person-long', jang: true, phone: '010-0000-0002', pphone: '010-0000-0003', birth: '2008-01-01', addr: '합성 주소', school: '합성 학교', num: 2, photo: '', extra: '학생 보존' },
    }, adminChanges: { old: { extra: '이력 보존' } } } } },
    attendance: { [year]: { '1-1-1': { long: { '0-0': 'X', '0-1': 'O' }, active: { '0-0': 'O' } } } },
  };
  expect((await request.put(root, { headers: owner, data })).ok()).toBe(true);
  return { email, idToken, data };
}
async function login(page, email) {
  await page.goto('/attendance');
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('button', { name: '합성 일반 학생 출석으로 기록' })).toBeVisible();
  await page.locator('.long-absent-panel summary').click();
}
async function openReturn(page) { await page.getByRole('button', { name: '합성 복귀 학생 일반 명단 복귀' }).click(); return page.getByRole('dialog', { name: '일반 명단 복귀' }); }
async function snapshot(request) { return (await request.get(root, { headers: owner })).json(); }
test('관리자 복귀·취소·재접속은 기존 학생과 출석을 보존한다', async ({ page, request }, testInfo) => {
  const { email } = await seed(request); const before = await snapshot(request);
  await login(page, email); let dialog = await openReturn(page);
  await expect(dialog).toContainText('기존 출석 이력');
  await page.screenshot({ path: testInfo.outputPath('return-confirm.png') });
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  expect(await snapshot(request)).toEqual(before);
  dialog = await openReturn(page); await dialog.getByRole('button', { name: '일반 명단으로 복귀', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '합성 복귀 학생 출석으로 기록' })).toBeVisible();
  const after = await snapshot(request); const restored = after.classes[year]['1-1-1'];
  expect(restored.students.long).toEqual({ ...before.classes[year]['1-1-1'].students.long, jang: false });
  expect(restored.students.active).toEqual(before.classes[year]['1-1-1'].students.active);
  expect(restored.adminChanges.old).toEqual(before.classes[year]['1-1-1'].adminChanges.old);
  const changes = Object.entries(restored.adminChanges).filter(([key]) => key !== 'old');
  expect(changes).toHaveLength(1); expect(changes[0][1]).toMatchObject({ studentId: 'long', personId: 'person-long', changeSummary: expect.stringContaining('일반 명단 복귀') });
  delete restored.adminChanges[changes[0][0]]; restored.students.long.jang = true;
  expect(after).toEqual(before);
  await page.reload(); await expect(page.getByRole('button', { name: '합성 복귀 학생 출석으로 기록' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('복귀 저장 직전의 원격 변경은 덮지 않고 충돌을 안내한다', async ({ page, request }) => {
  const { email } = await seed(request); await login(page, email); const dialog = await openReturn(page);
  await page.route(`**/classes/${year}/1-1-1.json?**`, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    expect((await request.patch(classUrl, { headers: owner, data: { extra: '다른 작업의 최신 값' } })).ok()).toBe(true);
    await route.continue();
  });
  await dialog.getByRole('button', { name: '일반 명단으로 복귀', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('다른 작업');
  const latest = await (await request.get(classUrl, { headers: owner })).json();
  expect(latest.extra).toBe('다른 작업의 최신 값'); expect(latest.students.long.jang).toBe(true); expect(Object.keys(latest.adminChanges)).toEqual(['old']);
});
test('대화창을 연 뒤 삭제된 학생을 다시 만들지 않는다', async ({ page, request }) => {
  const { email } = await seed(request); await login(page, email); const dialog = await openReturn(page);
  await request.delete(`http://127.0.0.1:19017/classes/${year}/1-1-1/students/long.json?ns=${ns}`, { headers: owner });
  const before = await snapshot(request);
  await dialog.getByRole('button', { name: '일반 명단으로 복귀', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('삭제·이동'); expect(await snapshot(request)).toEqual(before);
});
test('전체 명단의 학생 상세에서도 일반 명단으로 복귀할 수 있다', async ({ page, request }) => {
  const { email } = await seed(request); await login(page, email);
  await page.goto('/manage?view=directory');
  await page.getByRole('button', { name: /^합성 복귀 학생\s*장결$/ }).click();
  await page.locator('.sd-detail').getByRole('button', { name: '일반 명단 복귀', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '일반 명단 복귀' });
  await dialog.getByRole('button', { name: '일반 명단으로 복귀', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.sd-detail').getByText('일반 학생', { exact: true })).toBeVisible();
  expect((await (await request.get(classUrl, { headers: owner })).json()).students.long.jang).toBe(false);
});
test('교사에게 복귀 동작을 노출하지 않고 Rules도 명단 변경을 거절한다', async ({ page, request }) => {
  const { email, idToken } = await seed(request, true); await login(page, email);
  await expect(page.getByRole('button', { name: '합성 복귀 학생 일반 명단 복귀' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /합성 복귀 학생 출석 이력 보기/ })).toBeVisible();
  const before = await snapshot(request);
  const denied = await request.put(`http://127.0.0.1:19017/classes/${year}/1-1-1/students/long/jang.json?ns=${ns}&auth=${idToken}`, { data: false });
  expect([401, 403]).toContain(denied.status()); expect(await snapshot(request)).toEqual(before);
});
