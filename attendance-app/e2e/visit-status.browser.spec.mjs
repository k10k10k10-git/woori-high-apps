import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';
const ns = 'demo-attendance-recovery-default-rtdb';
const database = `http://127.0.0.1:19017/.json?ns=${ns}`;
const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
const email = 'visit-admin@example.test', password = 'synthetic-password-123';
const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));
const visitUrl = `http://127.0.0.1:19017/suggestions/${year}/1-1-1/visit.json?ns=${ns}`;
test.beforeEach(async ({ page, request }) => {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 에뮬레이터가 필요합니다.');
  await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data: { email, password, returnSecureToken: true } });
  const signed = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data: { email, password, returnSecureToken: true } });
  expect(signed.ok()).toBe(true); const { localId } = await signed.json();
  expect((await request.put(database, { headers: { Authorization: 'Bearer owner' }, data: {
    userRoles: { 'visit-admin__at__example__dot__test': { email, role: 'admin' } }, attendanceAdmins: { [localId]: true },
    classes: { [year]: { '1-1-1': { students: { s: { name: '합성 심방 학생' } } } } },
    suggestions: { [year]: { '1-1-1': { visit: { kind: 'visit', studentId: 's', studentName: '합성 심방 학생', text: '합성 요청 내용', author: '합성 교사', createdAt: 100, status: 'open', extra: '보존 값' } } } },
  } })).ok()).toBe(true);
  await page.goto('/pastoral');
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('button', { name: '처리 완료', exact: true })).toBeVisible();
});
test('관리자는 실제 ETag 저장으로 완료·재열기하고 원장 필드를 보존한다', async ({ page, request }) => {
  await page.getByRole('button', { name: '처리 완료', exact: true }).click();
  await expect(page.getByRole('button', { name: /처리 완료 1/ })).toBeVisible();
  await page.getByRole('button', { name: /처리 완료 1/ }).click();
  await expect(page.getByRole('button', { name: '다시 열기' })).toBeEnabled();
  const done = await (await request.get(visitUrl, { headers: { Authorization: 'Bearer owner' } })).json();
  expect(done).toMatchObject({ status: 'done', extra: '보존 값' }); expect(done.resolvedAt).toBeGreaterThan(0);
  await page.getByRole('button', { name: '다시 열기' }).click();
  await expect(page.getByRole('button', { name: /확인 필요 1/ })).toBeVisible();
  const open = await (await request.get(visitUrl, { headers: { Authorization: 'Bearer owner' } })).json();
  expect(open.status).toBe('open'); expect(open).not.toHaveProperty('resolvedAt');
});
test('최신 조회 후 삭제된 심방 요청은 상태 저장으로 다시 생기지 않는다', async ({ page, request }) => {
  await page.route('**/suggestions/**/*.json?**', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    expect((await request.delete(visitUrl, { headers: { Authorization: 'Bearer owner' } })).ok()).toBe(true);
    await route.continue();
  });
  await page.getByRole('button', { name: '처리 완료', exact: true }).click();
  await expect(page.locator('.ao-error')).toContainText('처리 중 요청이 변경');
  expect(await (await request.get(visitUrl, { headers: { Authorization: 'Bearer owner' } })).json()).toBeNull();
});
test('저장 직전 다른 관리자가 수정한 요청을 덮지 않는다', async ({ page, request }) => {
  await page.route('**/suggestions/**/*.json?**', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    expect((await request.patch(visitUrl, { headers: { Authorization: 'Bearer owner' }, data: { text: '다른 관리자의 수정' } })).ok()).toBe(true);
    await route.continue();
  });
  await page.getByRole('button', { name: '처리 완료', exact: true }).click();
  await expect(page.locator('.ao-error')).toContainText('처리 중 요청이 변경');
  expect(await (await request.get(visitUrl, { headers: { Authorization: 'Bearer owner' } })).json()).toMatchObject({ text: '다른 관리자의 수정', status: 'open' });
});
