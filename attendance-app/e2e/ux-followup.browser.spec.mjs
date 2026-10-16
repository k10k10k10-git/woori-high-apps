import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';

const ns = 'demo-attendance-recovery-default-rtdb';
const database = `http://127.0.0.1:19017/.json?ns=${ns}`;
const owner = { Authorization: 'Bearer owner' };
const email = 'ux-admin@example.test', password = 'synthetic-password-123';
const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));

async function seed(request) {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 에뮬레이터가 필요합니다.');
  const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
  const credentials = { email, password, returnSecureToken: true };
  await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data: credentials });
  const login = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data: credentials });
  expect(login.ok()).toBe(true);
  const { localId } = await login.json();
  expect((await request.put(database, { headers: owner, data: {
    attendanceAdmins: { [localId]: true },
    userRoles: { 'ux-admin__at__example__dot__test': { email, role: 'admin' } },
    config: { pastoralReport: { blockedDemoUid: 'synthetic-demo' } },
    classes: { [year]: { '1-1-1': { teacher: '합성 교사', students: { s: { name: '합성 학생', num: 1 } } } } },
    attendance: { [year]: { '1-1-1': { s: { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'X' } } } },
  } })).ok()).toBe(true);
}

async function login(page, path) {
  await page.goto(path);
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('navigation', { name: '관리자 메뉴', exact: true })).toBeVisible();
}

test.beforeEach(async ({ request, page }) => {
  await seed(request);
  await page.clock.setFixedTime(new Date(`${year}-03-01T12:00:00+09:00`));
});

test('다섯 모바일 메뉴와 명단·목양 조건이 메뉴 왕복과 새로고침 후에도 유지된다', async ({ page, request }, testInfo) => {
  const before = await (await request.get(database, { headers: owner })).json();
  await login(page, '/manage?view=directory');
  // 화면 폭과 무관하게 모든 메뉴가 내비게이션의 가시 영역 안에 있다.
  const navigation = page.getByRole('navigation', { name: '관리자 메뉴', exact: true });
  const links = navigation.getByRole('link');
  await expect(links).toHaveCount(5);
  expect(await navigation.evaluate(element => {
    const box = element.getBoundingClientRect();
    return [...element.querySelectorAll('a')].every(link => {
      const item = link.getBoundingClientRect();
      return item.left >= box.left - 1 && item.right <= box.right + 1 && item.height >= 44;
    });
  })).toBe(true);
  await page.getByLabel('명단 부서 필터').selectOption('1');
  await page.getByLabel('학생 명단 검색', { exact: true }).fill('합성');
  await page.getByRole('button', { name: '합성 학생', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '합성 학생 학생 상세' })).toBeVisible();
  await navigation.getByRole('link', { name: '운영 설정', exact: true }).click();
  await page.getByRole('tab', { name: '출석 제외 일정', exact: true }).click();
  await navigation.getByRole('link', { name: '학생·반 관리', exact: true }).click();
  await expect(page.getByLabel('학생 명단 검색', { exact: true })).toHaveValue('합성');
  await expect(page.getByLabel('명단 부서 필터')).toHaveValue('1');
  await expect(page.getByRole('complementary', { name: '합성 학생 학생 상세' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('명단 부서 필터')).toHaveValue('1');
  // 검색에는 연락처가 들어갈 수 있으므로 새로고침 후 브라우저 저장소에서 복원하지 않는다.
  await expect(page.getByLabel('학생 명단 검색', { exact: true })).toHaveValue('');
  await navigation.getByRole('link', { name: '목양 관리', exact: true }).click();
  await page.getByRole('button', { name: '연속 결석', exact: true }).click();
  await page.getByLabel('기준 주일', { exact: true }).selectOption('0-3');
  await page.getByLabel('정렬', { exact: true }).selectOption('latest');
  await page.getByRole('button', { name: '합성 학생 상세 보기' }).click();
  await navigation.getByRole('link', { name: '운영 설정', exact: true }).click();
  await expect(page.getByRole('tab', { name: '출석 제외 일정', exact: true })).toHaveAttribute('aria-selected', 'true');
  await navigation.getByRole('link', { name: '목양 관리', exact: true }).click();
  await expect(page.getByLabel('기준 주일', { exact: true })).toHaveValue('0-3');
  await expect(page.getByLabel('정렬', { exact: true })).toHaveValue('latest');
  await expect(page.getByRole('complementary', { name: '합성 학생 상세', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('정렬', { exact: true })).toHaveValue('latest');
  await expect(page.getByRole('complementary', { name: '합성 학생 상세', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('admin-mobile-context.png') });
  expect(await (await request.get(database, { headers: owner })).json()).toEqual(before);
});

test('출석 제외 일정은 실제 주일만 저장하고 원장·출석은 보존한다', async ({ page, request }, testInfo) => {
  const before = await (await request.get(database, { headers: owner })).json();
  await login(page, '/admin?section=events');
  await expect(page.getByRole('tab', { name: '출석 제외 일정', exact: true })).toHaveAttribute('aria-selected', 'true');
  const date = page.getByLabel('날짜', { exact: true });
  await expect(date).toHaveAttribute('type', 'date');
  const firstMonday = new Date(Date.UTC(year, 0, 1));
  firstMonday.setUTCDate(1 + (8 - firstMonday.getUTCDay()) % 7);
  await date.fill(firstMonday.toISOString().slice(0, 10));
  await page.getByLabel('일정 이름', { exact: true }).fill('격리 일정');
  await expect(page.getByText('주일이 아닌 날짜는 출석 집계에 적용되지 않습니다. 일요일을 선택해 주세요.', { exact: true })).toBeVisible();
  // 비활성 버튼 외에도 handler 검증은 단위·렌더 테스트에서 확인한다.
  await expect(page.getByRole('button', { name: '일정 추가', exact: true })).toBeDisabled();
  expect(await (await request.get(`http://127.0.0.1:19017/events/${year}.json?ns=${ns}`, { headers: owner })).json()).toBeNull();
  const sunday = new Date(Date.UTC(year, 0, 1));
  sunday.setUTCDate(1 + (7 - sunday.getUTCDay()) % 7);
  const value = sunday.toISOString().slice(0, 10);
  await date.fill(value);
  await expect(page.getByRole('button', { name: '일정 추가', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('event-date-preview.png') });
  await page.getByRole('button', { name: '일정 추가', exact: true }).click();
  await expect(page.getByText('격리 일정', { exact: true })).toBeVisible();
  const after = await (await request.get(database, { headers: owner })).json();
  expect(Object.values(after.events[year])).toEqual([{ month: String(sunday.getUTCMonth() + 1), day: String(sunday.getUTCDate()), label: '격리 일정' }]);
  expect(after.classes).toEqual(before.classes);
  expect(after.attendance).toEqual(before.attendance);
  await page.reload();
  await expect(page.getByRole('tab', { name: '출석 제외 일정', exact: true })).toHaveAttribute('aria-selected', 'true');
});
