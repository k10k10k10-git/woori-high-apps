import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';

const ns = 'demo-attendance-recovery-default-rtdb';
const database = `http://127.0.0.1:19017/.json?ns=${ns}`;
const owner = { Authorization: 'Bearer owner' };
const email = 'status-admin@example.test', password = 'synthetic-password-123';
const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));

async function checkBadge(badge, tone, interactive = false) {
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-status-tone', tone);
  const styles = await badge.evaluate(element => {
    const style = getComputedStyle(element);
    const label = getComputedStyle(element.querySelector('span'));
    const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = color => rgb(color).map(channel => channel / 255)
      .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    return { color: style.color, labelColor: label.color, background: style.backgroundColor,
      contrast: contrast(label.color, style.backgroundColor), height: element.getBoundingClientRect().height,
      iconHidden: element.querySelector('svg').getAttribute('aria-hidden') };
  });
  expect(styles.labelColor).toBe(styles.color); // 기존 표의 span 규칙이 상태색을 덮지 않아야 한다.
  expect(styles.contrast).toBeGreaterThanOrEqual(4.5);
  expect(styles.iconHidden).toBe('true');
  if (interactive) expect(styles.height).toBeGreaterThanOrEqual(44);
  return styles.background;
}

test('관리자 상태는 업무별 의미·대비·상세 동작을 유지하고 조회만으로 원장을 변경하지 않는다', async ({ page, request }, testInfo) => {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 에뮬레이터가 필요합니다.');
  const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
  const credentials = { email, password, returnSecureToken: true };
  await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data: credentials });
  const login = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data: credentials });
  expect(login.ok()).toBe(true); const { localId } = await login.json();
  const friends = Object.fromEntries(['d', 'w', 'i', 's'].map(id => [id, {
    name: `합성 ${id}`, part: '1', grade: '1', giftDate: `${year}-01-01`,
    rosterSync: { classKey: '1-1-1', studentId: id, syncedAt: `${year}-01-01T00:00:00Z` },
  }]));
  expect((await request.put(database, { headers: owner, data: {
    attendanceAdmins: { [localId]: true }, userRoles: { 'status-admin__at__example__dot__test': { email, role: 'admin' } },
    config: { pastoralReport: { blockedDemoUid: 'synthetic-demo' } },
    classes: { [year]: {
      '1-1-1': { students: Object.fromEntries(['d', 'w', 'i', 's'].map(id => [id, { name: `합성 ${id}` }])) },
      '1-1-2': { students: { empty: { name: '미입력 학생' } } },
      '1-1-3': { students: { p: { name: '입력 학생' }, q: { name: '대기 학생' } } },
    } },
    attendance: { [year]: {
      '1-1-1': { d: { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'X' },
        w: { '0-0': 'O', '0-2': 'O', '0-3': 'O' },
        i: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'O' },
        s: { '0-0': 'O', '0-1': 'O', '0-2': 'O', '0-3': 'O' } },
      '1-1-3': { p: { '0-3': 'O' } },
    } },
    semesters: { [`${year}-sunday`]: { newFriends: { ...friends, hold: { name: '합성 보류', decision: '보류', part: '1', grade: '1' } } } },
    suggestions: { [year]: { '1-1-1': {
      open: { kind: 'visit', studentId: 'd', studentName: '합성 d', text: '합성 요청', status: 'open', createdAt: 100 },
      done: { kind: 'visit', studentId: 's', studentName: '합성 s', text: '합성 완료', status: 'done', createdAt: 101 },
    } } },
  } })).ok()).toBe(true);
  const before = await (await request.get(database, { headers: owner })).json();
  await page.clock.setFixedTime(new Date(`${year}-03-01T12:00:00+09:00`));
  await page.goto('/pastoral?view=friends&week=0-3');
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  const backgrounds = [];
  for (const [label, tone] of [['연락 필요', 'danger'], ['출석 입력 확인', 'warning'], ['출석 흐름 확인', 'info'], ['초기 4주 출석 양호', 'success']]) {
    const badge = page.getByRole('button', { name: label, exact: true });
    backgrounds.push(await checkBadge(badge, tone, true));
  }
  expect(new Set(backgrounds).size).toBe(4);
  const settlementTable = page.locator('.pr-table-wrap');
  await settlementTable.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await settlementTable.screenshot({ path: testInfo.outputPath('settlement-status.png') });
  await page.getByRole('button', { name: '연락 필요', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pr-detail h3')).toHaveText('합성 d');
  await checkBadge(page.locator('.pr-detail .admin-status-badge'), 'danger');
  await page.locator('.pr-detail .pr-close').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.goto('/pastoral?view=registration');
  const registration = page.locator('.pr-registration');
  const hold = registration.locator('.admin-status-badge').filter({ hasText: /^보류$/ });
  const visibleHold = hold.filter({ visible: true });
  await expect(visibleHold).toHaveCount(2); // 진행 단계와 등록 결정 모두 같은 보류 의미를 유지한다.
  for (let index = 0; index < 2; index++) await checkBadge(visibleHold.nth(index), 'neutral');
  const complete = registration.locator('.admin-status-badge').filter({ hasText: /^완료$/ });
  await checkBadge(complete.filter({ visible: true }).first(), 'success');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.goto('/pastoral?view=visits');
  await checkBadge(page.locator('.ao-visit-action .admin-status-badge'), 'warning');
  await page.getByRole('button', { name: /처리 완료 1/ }).click();
  await checkBadge(page.locator('.ao-visit-action .admin-status-badge'), 'success');
  await expect(page.getByRole('button', { name: '다시 열기', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.goto('/manage?view=directory');
  await expect(page.getByRole('heading', { name: '전체 학생 명단', exact: true })).toBeVisible();
  await page.getByText('보기 설정', { exact: true }).click();
  await page.getByRole('button', { name: '상세 표', exact: true }).click();
  const directory = page.locator('.sd-detailed-table');
  await checkBadge(directory.locator('.admin-status-badge').filter({ hasText: /^A$/ }).first(), 'success');
  await checkBadge(directory.locator('.admin-status-badge').filter({ hasText: /^D$/ }).first(), 'danger');
  await checkBadge(directory.locator('.admin-status-badge').filter({ hasText: /^일반$/ }).first(), 'neutral');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.goto('/attendance?view=overview&week=0-3');
  for (const [label, tone] of [['입력 완료', 'success'], ['미입력', 'warning'], ['입력 중', 'info']]) {
    await checkBadge(page.locator('.cao-table .admin-status-badge').filter({ hasText: label }), tone);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await (await request.get(database, { headers: owner })).json()).toEqual(before);
});
