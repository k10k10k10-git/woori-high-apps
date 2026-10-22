import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';

const namespace = 'demo-attendance-recovery-default-rtdb';
const database = `http://127.0.0.1:19017/.json?ns=${namespace}`;
const owner = { Authorization: 'Bearer owner' };
const email = 'duplicates-admin@example.test', password = 'synthetic-password-123';
const year = new Date().getFullYear();
async function seed(request) {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 환경만 허용합니다.');
  const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
  const data = { email, password, returnSecureToken: true };
  let account = await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data });
  if (!account.ok()) account = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data });
  expect(account.ok()).toBe(true); const { localId } = await account.json();
  expect((await request.put(database, { headers: owner, data: {
    attendanceAdmins: { [localId]: true },
    userRoles: { 'duplicates-admin__at__example__dot__test': { email, role: 'admin', name: '합성 관리자' } },
    classes: { [year]: {
      '1-1-1': { teacher: '등록 반 담임' },
      '2-1-4': { teacher: '기존 반 담임', students: { a: { name: '합성중복학생', birth: '2010. 01. 02', personId: 'former-person' } } },
      '2-1-6': { teacher: '현재 반 담임', students: { b: { name: '합성중복학생', birth: '2010-01-02', personId: 'current-person', jang: true } } },
    } },
    attendance: { [year]: { '2-1-4': { a: { '0-0': 'X' } }, '2-1-6': { b: { '0-0': 'O' } } } },
  } })).ok()).toBe(true);
}
async function login(page) {
  await page.goto('/manage?view=directory');
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('heading', { name: '전체 학생 명단', exact: true })).toBeVisible();
}
test.beforeEach(async ({ request }) => { await seed(request); });
test('중복 점검은 양쪽 명단·출석을 보존하고 필터 밖의 학생 상세도 연다', async ({ page, request }, info) => {
  const before = await (await request.get(database, { headers: owner })).json();
  await login(page);
  await page.getByLabel('명단 부서 필터').selectOption('1');
  const notice = page.locator('.sd-duplicate-notice');
  await expect(notice.locator('summary')).toContainText('중복 의심 1건');
  await notice.locator('summary').click();
  await notice.getByRole('button', { name: '합성중복학생 2부 1학년 6반 · 장결', exact: true }).click();
  const detail = page.getByRole('complementary', { name: '합성중복학생 학생 상세' });
  await expect(detail).toContainText('2부 1학년 6반');
  await expect(page.getByLabel('명단 부서 필터')).toHaveValue('all');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('duplicate-review.png') });
  expect(await (await request.get(database, { headers: owner })).json()).toEqual(before);
});
test('별도 PID의 동일 학생 신규 등록을 최신 서버 명단으로 거절하고 입력을 유지한다', async ({ page, request }) => {
  const before = await (await request.get(database, { headers: owner })).json();
  await login(page);
  const add = page.locator('.sd-add');
  await add.locator('summary').click();
  await add.locator('select').selectOption('1-1-1');
  await add.getByRole('button', { name: '선택한 반에 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '학생 추가', exact: true });
  await dialog.getByLabel('이름 *', { exact: true }).fill('합성중복학생');
  await dialog.getByLabel('생년월일', { exact: true }).fill('2010/1/2');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('동일 학생으로 보이는 명단');
  await expect(dialog.getByLabel('이름 *', { exact: true })).toHaveValue('합성중복학생');
  expect(await (await request.get(database, { headers: owner })).json()).toEqual(before);
});
