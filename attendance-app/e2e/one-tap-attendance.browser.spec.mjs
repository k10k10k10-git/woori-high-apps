import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';

const namespace = 'demo-attendance-recovery-default-rtdb';
const base = 'http://127.0.0.1:19017';
const owner = { Authorization: 'Bearer owner' };
const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
const year = 2026, key = '10-0';
const teacher = 'one-tap-teacher@example.test', admin = 'one-tap-admin@example.test';
const password = 'synthetic-password-123';
const url = path => `${base}/${path}.json?ns=${namespace}`;
async function read(request, path = '') {
  const result = await request.get(url(path), { headers: owner });
  expect(result.ok()).toBe(true);
  return result.json();
}
async function seed(request) {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1'
    || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017'
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19099') throw new Error('격리 인증·DB 에뮬레이터만 허용합니다.');
  const accounts = {};
  for (const email of [teacher, admin]) {
    const data = { email, password, returnSecureToken: true };
    await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data });
    const result = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data });
    expect(result.ok()).toBe(true);
    accounts[email] = (await result.json()).localId;
  }
  const emailKey = email => email.replace(/@/g, '__at__').replace(/\./g, '__dot__');
  const result = await request.put(url(''), { headers: owner, data: {
    attendanceAdmins: { [accounts[admin]]: true },
    userRoles: {
      [emailKey(teacher)]: { email: teacher, role: 'teacher', part: '1', grade: '1', class: '1', name: '합성 한 번 체크 교사' },
      [emailKey(admin)]: { email: admin, role: 'admin', name: '합성 한 번 체크 관리자' },
    },
    config: { pastoralReport: { blockedDemoUid: 'synthetic-demo' } },
    classes: { [year]: {
      '1-1-1': { teacher: '합성 한 번 체크 교사', students: {
        alpha: { name: '합성 첫 학생', personId: 'person-alpha', num: 1 },
        bravo: { name: '합성 둘째 학생', personId: 'person-bravo', num: 2 },
        charlie: { name: '합성 셋째 학생', personId: 'person-charlie', num: 3 },
        long: { name: '합성 장결 학생', personId: 'person-long', jang: true, num: 4 },
      } },
      '1-1-2': { teacher: '합성 다른 교사', students: { other: { name: '다른 반 학생', personId: 'person-other', num: 1 } } },
      '1-1-3': { teacher: '합성 미시작 교사', students: { fresh: { name: '미시작 반 학생', personId: 'person-fresh', num: 1 } } },
    } },
    attendance: { [year]: {
      '1-1-1': { alpha: { '0-0': 'O', '8-1': 'X' }, bravo: { '0-0': 'X' }, long: { '0-0': 'X', [key]: 'O' } },
      '1-1-2': { other: { '0-0': 'O', [key]: 'X' } },
    } },
  } });
  expect(result.ok()).toBe(true);
}
async function login(page, email = teacher, path = `/attendance?week=${key}`) {
  await page.goto(path);
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  if (email === teacher) await expect(page.getByRole('button', { name: '합성 첫 학생 출석으로 기록', exact: true })).toBeVisible();
  else await expect(page.getByRole('navigation', { name: '관리자 메뉴', exact: true })).toBeVisible();
}
const studentButton = (page, name, selected = false) => page.getByRole('button', {
  name: `${name} ${selected ? '출석 현재 선택됨, 다시 누르면 출석 취소' : '출석으로 기록'}`, exact: true,
});
const classRow = (page, number) => page.locator('.cao-table tbody tr').filter({
  has: page.getByRole('button', { name: new RegExp(`^1부 1학년 ${number}반`) }),
});
function withOnlyCheckChanges(before, after, cells) {
  const expected = structuredClone(before);
  for (const [sid, value] of Object.entries(cells)) {
    expected.attendance[year]['1-1-1'][sid] ??= {};
    expected.attendance[year]['1-1-1'][sid][key] = value;
  }
  if (after.attendanceChecks) expected.attendanceChecks = after.attendanceChecks;
  expect(after).toEqual(expected);
}

test.beforeEach(async ({ request, page }) => {
  await seed(request);
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00+09:00'));
});

test('최초 중립 화면은 쓰지 않고 첫 출석부터 일반 학생만 집계하며 재접속·취소를 보존한다', async ({ page, request }, testInfo) => {
  const before = await read(request);
  await login(page);
  await expect(page.locator('.attendance-check-state')).toContainText('미시작');
  await expect(page.locator('.check-btns .one-tap')).toHaveCount(3);
  await expect(page.locator('.check-btns [aria-pressed=true]')).toHaveCount(0);
  await expect(page.locator('.check-row.row-x')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /결석으로 기록/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^완료$/ })).toHaveCount(0);
  expect(await read(request)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('one-tap-unstarted.png') });
  await studentButton(page, '합성 첫 학생').click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장되었습니다');
  await expect(studentButton(page, '합성 첫 학생', true)).toHaveAttribute('aria-pressed', 'true');
  await expect(studentButton(page, '합성 둘째 학생')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.check-row.row-x')).toHaveCount(0);
  await expect(page.locator('.attendance-check-state')).toContainText('입력 있음');
  const saved = await read(request);
  withOnlyCheckChanges(before, saved, { alpha: 'O', bravo: 'X', charlie: 'X' });
  expect(saved.attendanceChecks[year]['1-1-1'][key]).toMatchObject({
    revision: 1, allAbsent: false, targetSid: 'alpha', expected: '', value: 'O',
    roster: { alpha: 'person-alpha', bravo: 'person-bravo', charlie: 'person-charlie' },
  });
  await page.reload();
  await expect(studentButton(page, '합성 첫 학생', true)).toBeVisible();
  await expect(page.locator('.attendance-check-state')).toContainText('입력 있음');
  expect(await read(request)).toEqual(saved);
  await studentButton(page, '합성 첫 학생', true).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장되었습니다');
  await expect(studentButton(page, '합성 첫 학생')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.check-btns [aria-pressed=true]')).toHaveCount(0);
  await expect(page.locator('.check-row.row-x')).toHaveCount(0);
  await expect(page.locator('.attendance-check-state')).toContainText('입력 있음');
  const cancelled = await read(request);
  withOnlyCheckChanges(before, cancelled, { alpha: 'X', bravo: 'X', charlie: 'X' });
  expect(cancelled.attendanceChecks[year]['1-1-1'][key]).toMatchObject({ revision: 2, allAbsent: false });
  await page.reload();
  await expect(page.locator('.attendance-check-state')).toContainText('입력 있음');
  await expect(studentButton(page, '합성 첫 학생')).toBeVisible();
  expect(await read(request)).toEqual(cancelled);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('one-tap-neutral-after-cancel.png') });
});

test('전원 결석은 명시 확인하고 관리자는 미시작·입력 있음·출석 0명 확인을 구별한다', async ({ page, request }, testInfo) => {
  const before = await read(request);
  await login(page);
  await page.getByRole('button', { name: '오늘 출석 학생 없음', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '오늘 출석 학생 없음', exact: true });
  await expect(dialog).toContainText('일반 학생 전원을 결석으로 저장');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  expect(await read(request)).toEqual(before);
  await page.getByRole('button', { name: '오늘 출석 학생 없음', exact: true }).click();
  await dialog.getByRole('button', { name: '출석 0명으로 기록', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.attendance-save-banner')).toContainText('저장되었습니다');
  await expect(page.locator('.attendance-check-state')).toContainText('출석 0명 확인');
  await expect(page.locator('.check-btns [aria-pressed=true]')).toHaveCount(0);
  const absent = await read(request);
  withOnlyCheckChanges(before, absent, { alpha: 'X', bravo: 'X', charlie: 'X' });
  expect(absent.attendanceChecks[year]['1-1-1'][key]).toMatchObject({ revision: 1, allAbsent: true, targetSid: '' });
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
  await login(page, admin, `/attendance?view=overview&week=${key}`);
  await expect(classRow(page, 1)).toContainText('출석 0명 확인');
  await expect(classRow(page, 3)).toContainText('미시작');
  await expect(classRow(page, 3)).toContainText('0명 / —');
  await classRow(page, 2).getByRole('button', { name: '1부 1학년 2반 출석 입력 열기', exact: true }).click();
  await studentButton(page, '다른 반 학생').click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장되었습니다');
  await page.goto(`/attendance?view=overview&week=${key}`);
  await expect(classRow(page, 1)).toContainText('출석 0명 확인');
  await expect(classRow(page, 2)).toContainText('입력 있음');
  await expect(classRow(page, 2).locator('time')).toContainText('마지막 저장');
  await expect(classRow(page, 3)).toContainText('미시작');
  await page.screenshot({ path: testInfo.outputPath('one-tap-admin-statuses.png') });
  const beforeView = await read(request);
  await page.goto('/pastoral?view=notes');
  const navigation = page.getByRole('group', { name: '목양 관리 보기 선택', exact: true });
  await expect(navigation.getByRole('button')).toHaveText(['심방 요청', '특이사항', '연속 결석', '새친구']);
  await expect(navigation.getByRole('button', { name: '특이사항', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(navigation.locator('.pr-secondary-link')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pastoral-tab-order.png') });
  expect(await read(request)).toEqual(beforeView);
});

for (const none of [false, true]) test(`${none ? '전원 결석' : '첫 출석'} 원자 저장 응답 유실은 재시도해도 한 번만 반영한다`, async ({ page, request }) => {
  await login(page);
  let patches = 0;
  await page.route('**/.json?**', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patches++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort();
  });
  if (none) {
    await page.getByRole('button', { name: '오늘 출석 학생 없음', exact: true }).click();
    await page.getByRole('dialog', { name: '오늘 출석 학생 없음', exact: true }).getByRole('button', { name: '출석 0명으로 기록', exact: true }).click();
  } else await studentButton(page, '합성 첫 학생').click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장 결과를 확인하지 못했습니다');
  const saved = await read(request);
  expect(saved.attendance[year]['1-1-1'].alpha[key]).toBe(none ? 'X' : 'O');
  expect(saved.attendanceChecks[year]['1-1-1'][key].revision).toBe(1);
  await page.getByRole('button', { name: '재시도', exact: true }).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장되었습니다');
  expect(patches).toBe(1);
  expect(await read(request)).toEqual(saved);
});

test('저장 직전 다른 학생의 출석이 들어오면 원자 요청 전체를 거절해 출석을 보존한다', async ({ page, request }) => {
  const before = await read(request);
  await login(page);
  let patches = 0;
  await page.route('**/.json?**', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patches++;
    const result = await request.put(url(`attendance/${year}/1-1-1/bravo/${key}`), {
      headers: { ...owner, 'Content-Type': 'application/json' }, data: JSON.stringify('O'),
    });
    expect(result.ok()).toBe(true);
    await route.continue();
  });
  await studentButton(page, '합성 첫 학생').click();
  await expect(page.locator('.attendance-save-banner')).toContainText('다른 담당자가 먼저 저장');
  await expect(page.locator('.attendance-save-banner button')).toHaveCount(0);
  await expect(studentButton(page, '합성 첫 학생')).toHaveAttribute('aria-pressed', 'false');
  await expect(studentButton(page, '합성 둘째 학생', true)).toHaveAttribute('aria-pressed', 'true');
  expect(patches).toBe(1);
  const after = await read(request);
  withOnlyCheckChanges(before, after, { bravo: 'O' });
  expect(after.attendanceChecks).toBeUndefined();
});
