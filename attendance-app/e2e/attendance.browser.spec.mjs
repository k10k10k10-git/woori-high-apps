import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';
const namespace = 'demo-attendance-recovery-default-rtdb';
const database = `http://127.0.0.1:19017/.json?ns=${namespace}`;
const authUrl = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
const password = 'synthetic-password-123';
const email = 'teacher@example.test';
const legacyTime = new Date('2026-09-13T12:00:00+09:00');
function week() {
  return { year: 2026, key: '8-1' };
}
async function seed(request) {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 에뮬레이터 실행이 필요합니다.');
  const account = await request.post(`${authUrl}/accounts:signUp?key=synthetic-key`, { data: { email, password, returnSecureToken: true } });
  if (!account.ok()) expect((await account.json()).error.message).toBe('EMAIL_EXISTS');
  const { year } = week();
  const result = await request.put(database, { headers: { Authorization: 'Bearer owner' }, data: {
    userRoles: { teacher__at__example__dot__test: { email, role: 'teacher', part: '1', grade: '1', class: '1', name: '합성 교사' } },
    classes: { [year]: { '1-1-1': { teacher: '합성 교사', students: { s: { name: '검증 학생', num: 1, personId: 'synthetic-student', phone: '010-0000-0001', pphone: '010-0000-0002' } } } } },
  } });
  expect(result.ok()).toBe(true);
}
async function login(page) {
  await page.goto(`/attendance?week=${week().key}`);
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('button', { name: '검증 학생 출석으로 기록' })).toBeVisible();
}
async function stored(request) {
  const { year, key } = week();
  const result = await request.get(`http://127.0.0.1:19017/attendance/${year}/1-1-1/s/${key}.json?ns=${namespace}`, { headers: { Authorization: 'Bearer owner' } });
  return result.json();
}
test.beforeEach(async ({ request, page }) => {
  await seed(request);
  await page.clock.setFixedTime(legacyTime);
});
test('실제 로그인·역할 조회·출석 저장·재접속', async ({ page, request }) => {
  await login(page);
  await page.getByRole('button', { name: '검증 학생 출석으로 기록' }).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장되었습니다');
  expect(await stored(request)).toBe('O');
  await page.reload();
  await expect(page.getByRole('button', { name: /검증 학생 출석 현재 선택됨/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('다른 기기가 먼저 바꾼 셀은 덮지 않고 새 선택을 안내한다', async ({ page, request }) => {
  await login(page);
  // 사용자가 보고 있던 값은 미입력. REST 사전 조회 직전에 다른 기기 쓰기를 전달한다.
  await page.route('**/attendance/**/*.json?**', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const { year, key } = week();
    const changed = await request.put(`http://127.0.0.1:19017/attendance/${year}/1-1-1/s/${key}.json?ns=${namespace}`, { headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, data: JSON.stringify('X') });
    expect(changed.ok()).toBe(true);
    await route.continue();
  });
  await page.getByRole('button', { name: '검증 학생 출석으로 기록' }).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('다른 담당자');
  await expect(page.locator('.attendance-save-banner button')).toHaveCount(0);
  expect(await stored(request)).toBe('X');
});
test('요청 실패 후 재시도는 최신 값을 확인하고 저장한다', async ({ page, request }) => {
  await login(page);
  await page.route('**/attendance/**/*.json?**', route => route.abort());
  await page.getByRole('button', { name: '검증 학생 출석으로 기록' }).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장하지 않았습니다');
  expect(await stored(request)).toBeNull();
  await page.unroute('**/attendance/**/*.json?**');
  await page.getByRole('button', { name: '재시도', exact: true }).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장되었습니다');
  expect(await stored(request)).toBe('O');
});

test('조회 후 저장 직전의 다른 기기 쓰기도 원자 비교로 보호한다', async ({ page, request }) => {
  await login(page);
  let patches = 0;
  await page.route('**/.json?**', async route => {
    if (route.request().method() !== 'PATCH' || !Object.hasOwn(route.request().postDataJSON(), `attendance/${week().year}/1-1-1/s/${week().key}`)) return route.continue();
    patches++;
    const { year, key } = week();
    const changed = await request.put(`http://127.0.0.1:19017/attendance/${year}/1-1-1/s/${key}.json?ns=${namespace}`, { headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, data: JSON.stringify('X') });
    expect(changed.ok()).toBe(true);
    await route.continue();
  });
  await page.getByRole('button', { name: '검증 학생 출석으로 기록' }).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('다른 담당자가 먼저 저장');
  expect(await stored(request)).toBe('X');
  expect(patches).toBe(1);
  expect(await (await request.get(`http://127.0.0.1:19017/attendanceCellWrites/${week().year}/1-1-1/s/${week().key}.json?ns=${namespace}`, { headers: { Authorization: 'Bearer owner' } })).json()).toBeNull();
});
test('서버 저장 후 응답을 잃어도 재시도에서 중복 쓰기를 하지 않는다', async ({ page, request }) => {
  await login(page);
  let patches = 0;
  await page.route('**/.json?**', async route => {
    if (route.request().method() !== 'PATCH' || !Object.hasOwn(route.request().postDataJSON(), `attendance/${week().year}/1-1-1/s/${week().key}`)) return route.continue();
    patches++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort();
  });
  await page.getByRole('button', { name: '검증 학생 출석으로 기록' }).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장 결과를 확인하지 못했습니다');
  expect(await stored(request)).toBe('O');
  await page.getByRole('button', { name: '재시도', exact: true }).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장되었습니다');
  expect(patches).toBe(1);
  const receipt = await (await request.get(`http://127.0.0.1:19017/attendanceCellWrites/${week().year}/1-1-1/s/${week().key}.json?ns=${namespace}`, { headers: { Authorization: 'Bearer owner' } })).json();
  expect(receipt).toMatchObject({ revision: 1, studentToken: 'synthetic-student', expected: '', value: 'O' });
  expect(receipt.updatedAt).toBeGreaterThan(0);
});

test('저장 직전 같은 SID의 레거시 학생이 교체되면 출석과 영수증을 함께 거절한다', async ({ page, request }) => {
  const { year, key } = week();
  const studentUrl = `http://127.0.0.1:19017/classes/${year}/1-1-1/students/s.json?ns=${namespace}`;
  expect((await request.put(studentUrl, { headers: { Authorization: 'Bearer owner' }, data: { name: '검증 학생', birth: '2010.01.01', phone: '010-0000-0001' } })).ok()).toBe(true);
  await login(page);
  let before, patches = 0;
  await page.route('**/.json?**', async route => {
    if (route.request().method() !== 'PATCH' || !Object.hasOwn(route.request().postDataJSON(), `attendance/${year}/1-1-1/s/${key}`)) return route.continue();
    patches++;
    expect((await request.put(studentUrl, { headers: { Authorization: 'Bearer owner' }, data: { name: '검증 학생', birth: '2010.02.02', phone: '010-0000-0009' } })).ok()).toBe(true);
    before = await (await request.get(database, { headers: { Authorization: 'Bearer owner' } })).json();
    const response = await route.fetch();
    expect([401, 403]).toContain(response.status());
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: '검증 학생 출석으로 기록' }).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('다른 담당자가 먼저 저장');
  expect(patches).toBe(1);
  expect(before).toBeTruthy();
  expect(await (await request.get(database, { headers: { Authorization: 'Bearer owner' } })).json()).toEqual(before);
  expect(await stored(request)).toBeNull();
});

test('내부 id가 겹쳐도 실제 학생 키에만 출석을 저장한다', async ({ page, request }) => {
  const { year, key } = week();
  await request.patch(`http://127.0.0.1:19017/classes/${year}/1-1-1/students.json?ns=${namespace}`, {
    headers: { Authorization: 'Bearer owner' }, data: {
      s: { id: 'other', name: '검증 학생', personId: 'synthetic-student' },
      other: { id: 'other', name: '다른 합성 학생', personId: 'synthetic-other' },
    },
  });
  await login(page);
  await page.getByRole('button', { name: '검증 학생 출석으로 기록' }).click();
  await expect(page.locator('.attendance-save-banner')).toContainText('저장되었습니다');
  expect(await stored(request)).toBe('O');
  expect(await (await request.get(`http://127.0.0.1:19017/attendance/${year}/1-1-1/other/${key}.json?ns=${namespace}`, { headers: { Authorization: 'Bearer owner' } })).json()).toBeNull();
});

for (const kind of ['note', 'visit']) test(`${kind} 응답 유실 재시도는 한 건만 등록하고 처리 완료를 보존한다`, async ({ page, request }, testInfo) => {
  await login(page);
  const visit = kind === 'visit';
  await page.getByRole('tab', { name: visit ? '심방 요청' : '특이사항' }).click();
  await page.locator(visit ? '#visit-student' : '#note-student').selectOption('s');
  await page.locator(visit ? '#visit-reason' : '#teacher-suggestion').fill('격리 합성 상담 요청');
  let puts = 0;
  await page.route('**/suggestions/**/*.json?**', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    puts++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    if (visit) {
      const done = await request.patch(route.request().url(), { headers: { Authorization: 'Bearer owner' }, data: { status: 'done', resolvedAt: 100 } });
      expect(done.ok()).toBe(true);
    }
    await route.abort();
  });
  await page.getByRole('button', { name: visit ? '심방 요청하기' : '등록하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장 결과 확인·재시도' })).toBeEnabled();
  if (!visit) await expect(page.locator('.teacher-note-receipt')).toHaveCount(0);
  await page.getByRole('tab', { name: '출석 체크' }).click();
  await page.getByRole('tab', { name: visit ? '심방 요청' : '특이사항' }).click();
  await page.getByRole('button', { name: '저장 결과 확인·재시도' }).click();
  await expect(page.locator(visit ? '#visit-reason' : '#teacher-suggestion')).toHaveValue('');
  if (!visit) {
    await expect(page.getByRole('status', { name: '특이사항 접수 확인' })).toContainText('마지막으로 접수된 특이사항');
    await page.getByRole('link', { name: '관리 페이지', exact: true }).click();
    const contact = page.locator('.student-contact-link[href="tel:01000000001"]');
    await expect(contact).toBeVisible();
    expect(await contact.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.student-contact-link[href="tel:01000000002"]')).toBeVisible();
    await contact.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('teacher-contact-actions.png') });
    await page.getByRole('link', { name: '출석 페이지', exact: true }).click();
    await page.getByRole('tab', { name: '특이사항' }).click();
    await expect(page.getByRole('status', { name: '특이사항 접수 확인' })).toContainText('검증 학생');
    // 접수 확인에는 상담 본문을 반복해서 노출하지 않는다.
    await expect(page.locator('.teacher-note-receipt')).not.toContainText('격리 합성 상담 요청');
    await page.locator('.teacher-note-receipt').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('teacher-note-receipt.png') });
  }
  expect(puts).toBe(1);
  const { year } = week();
  const records = await (await request.get(`http://127.0.0.1:19017/suggestions/${year}/1-1-1.json?ns=${namespace}`, { headers: { Authorization: 'Bearer owner' } })).json();
  expect(Object.keys(records)).toHaveLength(1);
  expect(Object.values(records)[0]).toMatchObject({ kind, studentId: 's', text: '격리 합성 상담 요청', ...(visit ? { status: 'done' } : {}) });
});
