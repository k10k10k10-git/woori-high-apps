import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';
const ns = 'demo-attendance-recovery-default-rtdb';
const base = 'http://127.0.0.1:19017';
const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));
const workspace = `${year}-sunday`;
const email = 'remarks-admin@example.test', password = 'synthetic-password-123';
const memoUrl = `${base}/semestersPrivate/${workspace}/newFriendsPrivate/f/teamMemo.json?ns=${ns}`;
const owner = { Authorization: 'Bearer owner' };
test.beforeEach(async ({ page, request }) => {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 에뮬레이터가 필요합니다.');
  await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data: { email, password, returnSecureToken: true } });
  const login = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data: { email, password, returnSecureToken: true } });
  expect(login.ok()).toBe(true); const { localId } = await login.json();
  expect((await request.put(`${base}/.json?ns=${ns}`, { headers: owner, data: {
    userRoles: { 'remarks-admin__at__example__dot__test': { email, role: 'admin' } },
    attendanceAdmins: { [localId]: true }, config: { pastoralReport: { blockedDemoUid: 'synthetic-demo' } },
    semesters: { [workspace]: { newFriends: { f: { name: '합성 새친구', part: '1', grade: '1', school: '합성 학교' } } } },
    semestersPrivate: { [workspace]: { newFriendsPrivate: { f: { teamMemo: '통합사이트의 기존 비고', phone: '보존 연락처', familyNotes: '보존 가족 메모', pastoralNotes: '보존 심방 메모' } } } },
    classes: { [year]: { '1-1-1': { students: {} } } },
  } })).ok()).toBe(true);
  await page.goto('/pastoral');
  await page.getByLabel('이메일', { exact: true }).fill(email); await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: '새친구', exact: true }).click();
  await expect(page.getByRole('button', { name: '합성 새친구 비고 수정' })).toBeEnabled();
});
test('기존 비고 조회·편집·실시간 반영과 다른 비공개 필드 보존', async ({ page, request }) => {
  await expect(page.locator('.pr-remark-preview:visible')).toContainText('통합사이트의 기존 비고');
  await page.getByRole('button', { name: '합성 새친구 비고 수정' }).click();
  await page.getByLabel('비고 내용').fill('출석부에서 수정한 비고'); await page.getByRole('button', { name: '비고 저장' }).click();
  await expect(page.locator('.pr-remark-actions')).toContainText('비고가 저장되었습니다');
  const saved = await (await request.get(`${base}/semestersPrivate/${workspace}/newFriendsPrivate/f.json?ns=${ns}`, { headers: owner })).json();
  expect(saved).toEqual({ teamMemo: '출석부에서 수정한 비고', phone: '보존 연락처', familyNotes: '보존 가족 메모', pastoralNotes: '보존 심방 메모' });
  expect((await request.put(memoUrl, { headers: { ...owner, 'Content-Type': 'application/json' }, data: JSON.stringify('통합사이트에서 다시 수정') })).ok()).toBe(true);
  await expect(page.locator('.pr-remark-preview:visible')).toContainText('통합사이트에서 다시 수정');
  await expect(page.getByLabel('비고 내용')).toHaveValue('출석부에서 수정한 비고');
  await page.getByRole('button', { name: '작성 내용 대신 최신 비고 사용' }).click();
  await expect(page.getByLabel('비고 내용')).toHaveValue('통합사이트에서 다시 수정');
});
test('GET 이후 발생한 동시 편집을 덮어쓰지 않는다', async ({ page, request }) => {
  await page.route('**/semestersPrivate/**/teamMemo.json?**', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    expect((await request.put(memoUrl, { headers: { ...owner, 'Content-Type': 'application/json' }, data: JSON.stringify('다른 관리자의 최신 비고') })).ok()).toBe(true);
    await route.continue();
  });
  await page.getByRole('button', { name: '합성 새친구 비고 수정' }).click();
  await page.getByLabel('비고 내용').fill('내 작성 내용'); await page.getByRole('button', { name: '비고 저장' }).click();
  await expect(page.locator('.pr-remark-error')).toContainText('저장 중 비고가 변경');
  await expect(page.getByLabel('비고 내용')).toHaveValue('내 작성 내용');
  expect(await (await request.get(memoUrl, { headers: owner })).json()).toBe('다른 관리자의 최신 비고');
});
test('저장 직전 삭제된 새친구의 비고를 다시 만들지 않는다', async ({ page, request }) => {
  await page.route('**/semestersPrivate/**/teamMemo.json?**', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    expect((await request.patch(`${base}/.json?ns=${ns}`, { headers: owner, data: {
      [`semesters/${workspace}/newFriends/f`]: null, [`semestersPrivate/${workspace}/newFriendsPrivate/f`]: null,
    } })).ok()).toBe(true);
    await route.continue();
  });
  await page.getByRole('button', { name: '합성 새친구 비고 수정' }).click();
  await page.getByLabel('비고 내용').fill('재생성 금지');
  const rejected = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/teamMemo.json'));
  await page.getByRole('button', { name: '비고 저장' }).click();
  expect([401, 403, 412]).toContain((await rejected).status());
  await expect(page.getByText('접수된 새친구가 없습니다.')).toBeVisible();
  expect(await (await request.get(memoUrl, { headers: owner })).json()).toBeNull();
});
