import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';

const namespace = 'demo-attendance-recovery-default-rtdb';
const database = `http://127.0.0.1:19017/.json?ns=${namespace}`;
const owner = { Authorization: 'Bearer owner' };
const email = 'quality-admin@example.test', password = 'synthetic-password-123';
const teacherEmail = 'quality-teacher@example.test';
const year = 2026;
const studentName = '합성학생A';

async function seed(request) {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 환경만 허용합니다.');
  const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
  const data = { email, password, returnSecureToken: true };
  let account = await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data });
  if (!account.ok()) account = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data });
  expect(account.ok()).toBe(true); const { localId } = await account.json();
  const teacher = await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data: { ...data, email: teacherEmail } });
  if (!teacher.ok()) expect((await teacher.json()).error.message).toBe('EMAIL_EXISTS');
  expect((await request.put(database, { headers: owner, data: {
    attendanceAdmins: { [localId]: true },
    userRoles: { 'quality-admin__at__example__dot__test': { email, role: 'admin', name: '합성 관리자' },
      'quality-teacher__at__example__dot__test': { email: teacherEmail, role: 'teacher', part: '1', grade: '1', class: '1', name: '합성 담임' } },
    config: { pastoralReport: { blockedDemoUid: 'synthetic-demo' } },
    classes: { [year]: {
      '1-1-1': { teacher: '합성 담임', students: { a: { name: studentName, personId: 'quality-a', phone: '01000000001', pphone: '01000000002', birth: '2010-01-01', addr: '합성시 합성구 검증로 123 가상아파트 101동 202호' } } },
      '2-2-1': { teacher: '다른 합성 담임', students: { b: { name: '합성학생B', personId: 'quality-b', jang: true } } },
    } },
    attendance: { [year]: { '1-1-1': { a: { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'X' } } } },
  } })).ok()).toBe(true);
}
async function login(page) {
  await page.goto('/manage?view=directory');
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByRole('button', { name: '비밀번호', exact: true }).click(); await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('heading', { name: '전체 학생 명단', exact: true })).toBeVisible();
}
async function unchanged(request, before) { expect(await (await request.get(database, { headers: owner })).json()).toEqual(before); }
async function contained(locator, width) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull(); expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
}
async function rejectFirstMessageList(page) {
  let reject, attempts = 0;
  await page.routeWebSocket(address => address.hostname === '127.0.0.1' && address.port === '19017', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      let packet;
      try { packet = JSON.parse(message.toString()); } catch { /* 분할 프레임은 원본 그대로 보낸다. */ }
      if (packet?.t === 'd' && packet.d?.a === 'q' && packet.d.b?.p?.replace(/^\//, '') === `suggestions/${year}/1-1-1`) {
        attempts++;
        if (attempts === 1) {
          // 실제 Firebase SDK의 구독 에러 경로만 합성 거절한다. 나머지 인증·원장·다음 구독은 실제 서버다.
          reject = () => socket.send(JSON.stringify({ t: 'd', d: { r: packet.d.r, b: { s: 'permission_denied', d: '합성 목록 거절' } } }));
          return;
        }
      }
      server.send(message);
    });
  });
  return { reject: async () => { await expect.poll(() => !!reject).toBe(true); reject(); }, attempts: () => attempts };
}
test.beforeEach(async ({ request, page }) => {
  await seed(request);
  await page.clock.setFixedTime(new Date(`${year}-03-01T12:00:00+09:00`));
});

for (const width of [320, 390, 640]) test(`${width}px 명단 팝업·상세·편집 창은 화면 안에서 사용할 수 있다`, async ({ page, request }, testInfo) => {
  // 640×450은 1280×900 PC의 200% 확대와 같은 CSS reflow 폭이다. 실제 브라우저 줌·실기기 검증은 아니다.
  await page.setViewportSize({ width, height: width === 640 ? 450 : 844 });
  const before = await (await request.get(database, { headers: owner })).json();
  await login(page);
  const filters = page.locator('.sd-toolbar > .sd-more');
  await filters.locator('summary').click();
  await expect(filters.getByRole('combobox', { name: '학년', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`directory-${width}-filters.png`) });
  await contained(filters.locator('div').first(), width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await filters.locator('summary').click();
  const exportMenu = page.locator('.sd-export');
  await exportMenu.locator('summary').click();
  await expect(exportMenu.getByRole('button', { name: 'Excel', exact: true })).toBeVisible();
  await contained(exportMenu.locator('div').first(), width);
  await exportMenu.locator('summary').click();
  await page.getByRole('button', { name: studentName, exact: true }).click();
  const detail = page.getByRole('complementary', { name: `${studentName} 학생 상세`, exact: true });
  await expect(detail).toBeVisible(); await contained(detail, width);
  const edit = detail.getByRole('button', { name: '정보 수정', exact: true });
  expect((await edit.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await edit.click();
  const dialog = page.getByRole('dialog', { name: '학생 수정', exact: true });
  await expect(dialog).toBeVisible(); await contained(dialog, width);
  const save = dialog.getByRole('button', { name: '저장', exact: true });
  await save.scrollIntoViewIfNeeded();
  const saveBox = await save.boundingBox();
  expect(saveBox.height).toBeGreaterThanOrEqual(44);
  expect(saveBox.y).toBeGreaterThanOrEqual(0);
  expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(width === 640 ? 451 : 845);
  await page.screenshot({ path: testInfo.outputPath(`directory-${width}-student-dialog.png`) });
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await unchanged(request, before);
});

test('검색 0건에서 필터 초기화·상세·모달 키보드 초점이 복구된다', async ({ page, request }) => {
  const before = await (await request.get(database, { headers: owner })).json();
  await login(page);
  await page.getByLabel('명단 부서 필터').selectOption('2');
  const filters = page.locator('.sd-toolbar > .sd-more');
  await filters.locator('summary').click();
  await filters.getByRole('combobox', { name: '학년', exact: true }).selectOption('2');
  await filters.getByRole('combobox', { name: '상태', exact: true }).selectOption('long');
  await filters.locator('summary').click();
  await page.getByLabel('학생 명단 검색', { exact: true }).fill('이름이 없는 합성 검색');
  const empty = page.locator('.ad-empty');
  await expect(empty.getByRole('heading', { name: '조건에 맞는 학생이 없습니다.', exact: true })).toBeVisible();
  const reset = empty.getByRole('button', { name: '필터 초기화', exact: true });
  await reset.focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('학생 명단 검색', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('명단 부서 필터')).toHaveValue('all');
  await expect(empty).toHaveCount(0);
  const opener = page.getByRole('button', { name: studentName, exact: true });
  await opener.focus(); await page.keyboard.press('Enter');
  const detail = page.getByRole('complementary', { name: `${studentName} 학생 상세`, exact: true });
  await expect(detail).toBeFocused();
  await detail.getByRole('button', { name: '닫기', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');
  const edit = detail.getByRole('button', { name: '정보 수정', exact: true });
  await edit.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '학생 수정', exact: true });
  await expect(dialog).toBeVisible();
  const first = dialog.getByRole('button', { name: '학생 수정 닫기', exact: true });
  const last = dialog.getByRole('button', { name: '저장', exact: true });
  await first.focus(); await page.keyboard.press('Shift+Tab'); await expect(last).toBeFocused();
  await page.keyboard.press('Tab'); await expect(first).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(edit).toBeFocused();
  await unchanged(request, before);
});

for (const kind of ['note', 'visit']) test(`${kind} 목록 구독 실패는 빈 목록과 구분하고 명시 재시도로 복구한다`, async ({ page, request }) => {
  const visit = kind === 'visit';
  expect((await request.put(`http://127.0.0.1:19017/suggestions/${year}/1-1-1.json?ns=${namespace}`, { headers: owner, data: {
    existing: { kind, studentId: 'a', studentName, text: '저장된 합성 목록', status: 'open', createdAt: 100 },
  } })).ok()).toBe(true);
  const before = await (await request.get(database, { headers: owner })).json();
  const failure = await rejectFirstMessageList(page);
  if (visit) {
    await page.goto('/attendance');
    await page.getByLabel('이메일', { exact: true }).fill(teacherEmail);
    await page.getByRole('button', { name: '비밀번호', exact: true }).click(); await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page.getByRole('button', { name: `${studentName} 출석으로 기록`, exact: true })).toBeVisible();
  } else { await login(page); await page.goto('/attendance?view=check'); }
  await page.getByRole('tab', { name: visit ? '심방 요청' : '특이사항', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: visit ? '심방 요청' : '특이사항', exact: true });
  await expect(panel.getByText(visit ? '심방 요청을 불러오는 중입니다.' : '특이사항을 불러오는 중입니다.', { exact: true })).toBeVisible();
  await expect(panel.getByText(visit ? '등록된 심방 요청이 없습니다.' : '등록된 특이사항이 없습니다.', { exact: true })).toHaveCount(0);
  if (visit) {
    await panel.locator('#visit-student').selectOption('a');
    await panel.locator('#visit-reason').fill('저장하지 않은 합성 초안');
  }
  await failure.reject();
  await expect(panel.getByRole('alert')).toContainText('불러오지 못했습니다');
  if (visit) await expect(panel.locator('#visit-reason')).toHaveValue('저장하지 않은 합성 초안');
  await expect(panel.getByText(visit ? '등록된 심방 요청이 없습니다.' : '등록된 특이사항이 없습니다.', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: visit ? '심방 요청 다시 불러오기' : '특이사항 다시 불러오기', exact: true }).click();
  await expect(panel.getByText('저장된 합성 목록', { exact: true })).toBeVisible();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(failure.attempts()).toBeGreaterThanOrEqual(2);
  if (visit) await expect(panel.locator('#visit-reason')).toHaveValue('저장하지 않은 합성 초안');
  await unchanged(request, before);
});

test('심방 건수는 사람 수와 구분하고 목양 상세를 닫으면 열기 버튼으로 초점이 돌아온다', async ({ page, request }) => {
  expect((await request.put(`http://127.0.0.1:19017/suggestions/${year}/1-1-1.json?ns=${namespace}`, { headers: owner, data: Object.fromEntries([1, 2].map(value => [`request_${value}`, {
    kind: 'visit', studentId: 'a', studentName, text: `동일 학생 합성 요청 ${value}`, status: 'open', createdAt: value,
  }])) })).ok()).toBe(true);
  const before = await (await request.get(database, { headers: owner })).json();
  await login(page); await page.goto('/dashboard');
  const count = page.getByRole('group', { name: `${year}년 현재 미처리 심방 요청`, exact: true });
  await expect(count).toContainText('2건 심방 요청'); await expect(count).not.toContainText('2명');
  await page.goto('/pastoral?view=absence&week=0-3');
  const opener = page.getByRole('button', { name: `${studentName} 상세 보기`, exact: true });
  await opener.focus(); await page.keyboard.press('Enter');
  const detail = page.getByRole('complementary', { name: `${studentName} 상세`, exact: true });
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: '상세 닫기', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(detail).toHaveCount(0); await expect(opener).toBeFocused();
  await unchanged(request, before);
});

test('학생 수정 조회가 지연되면 15초 제한 후 입력을 보존하고 늦은 응답으로 교체 학생을 쓰지 않는다', async ({ page, request }) => {
  await login(page);
  await page.getByRole('button', { name: studentName, exact: true }).click();
  await page.getByRole('complementary', { name: `${studentName} 학생 상세`, exact: true }).getByRole('button', { name: '정보 수정', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '학생 수정', exact: true });
  await dialog.locator('#student-school').fill('입력 보존 합성 학교');
  const before = await (await request.get(database, { headers: owner })).json();
  let release, reached, completed, gets = 0, writes = 0, failed = false;
  const gate = new Promise(resolve => { release = resolve; });
  const pending = new Promise(resolve => { reached = resolve; });
  const finished = new Promise(resolve => { completed = resolve; });
  const classPath = `/classes/${year}/1-1-1.json`;
  page.on('requestfailed', value => { if (new URL(value.url()).pathname === classPath) failed = true; });
  await page.route(`**${classPath}?**`, async route => {
    if (route.request().method() !== 'GET') { writes++; return route.continue(); }
    gets++;
    const response = await route.fetch(); expect(response.ok()).toBe(true); reached();
    await gate;
    try { await route.fulfill({ response }); } catch (cause) { if (!failed) throw cause; }
    finally { completed(); }
  });
  try {
    const started = Date.now();
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await pending;
    // 신규 비즈니스 제한 15초를 실제로 기다린다. 기존 전역 45초/재시도 설정은 변경하지 않는다.
    await expect(dialog.getByRole('alert')).toContainText('입력은 유지됩니다', { timeout: 18_000 });
    expect(Date.now() - started).toBeLessThan(18_000);
    await expect(dialog.getByRole('button', { name: '저장', exact: true })).toBeEnabled();
    await expect(dialog.locator('#student-school')).toHaveValue('입력 보존 합성 학교');
    expect(gets).toBe(1); expect(writes).toBe(0); await unchanged(request, before);
    const replacement = { ...before.classes[year]['1-1-1'].students.a, name: '교체 합성학생', personId: 'replacement-person', school: '교체 원장 학교' };
    expect((await request.put(`http://127.0.0.1:19017/classes/${year}/1-1-1/students/a.json?ns=${namespace}`, { headers: owner, data: replacement })).ok()).toBe(true);
    const afterReplacement = await (await request.get(database, { headers: owner })).json();
    release(); await finished;
    await expect(dialog.getByRole('alert')).toContainText('입력은 유지됩니다');
    await expect(dialog.locator('#student-school')).toHaveValue('입력 보존 합성 학교');
    expect(writes).toBe(0); await unchanged(request, afterReplacement);
  } finally { release(); }
});

test('업데이트 안내는 미접수 초안을 유지하고 실제 접수 저장 중에는 새로고침을 막는다', async ({ page, request }, testInfo) => {
  await page.goto('/attendance');
  await page.getByLabel('이메일', { exact: true }).fill(teacherEmail);
  await page.getByRole('button', { name: '비밀번호', exact: true }).click(); await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  await page.getByRole('tab', { name: '특이사항', exact: true }).click();
  const field = page.locator('#teacher-suggestion');
  await field.fill('업데이트 중 보존할 합성 초안');
  const announce = () => page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'NEW_VERSION' } })));
  // 실제 SW 설치/배포가 아니라 AppShell의 표준 message 수신 이후 UI 계약만 검증한다.
  await announce();
  const banner = page.locator('.update-toast');
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: '새로고침', exact: true })).toBeEnabled();
  await banner.getByRole('button', { name: '나중에', exact: true }).click();
  await expect(banner).toHaveCount(0); await expect(field).toHaveValue('업데이트 중 보존할 합성 초안');
  const before = await (await request.get(database, { headers: owner })).json();
  let release, reached, writes = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const pending = new Promise(resolve => { reached = resolve; });
  await page.route('**/suggestions/**/*.json?**', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++;
    const response = await route.fetch(); expect(response.ok()).toBe(true); reached(); await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: '등록하기', exact: true }).click(); await pending;
    await announce(); await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: '저장 중', exact: true })).toBeDisabled();
    await expect(banner).toContainText('저장 중입니다.');
    const later = banner.getByRole('button', { name: '나중에', exact: true });
    // WebKit의 이동 애니메이션 좌표는 44px를 43.999992px로 돌려줄 수 있다. 0.001px 단위로 비교하되 44px 기준은 유지한다.
    expect(Math.round((await later.boundingBox()).height * 1000) / 1000).toBeGreaterThanOrEqual(44);
    await contained(banner, (await page.viewportSize()).width);
    await page.screenshot({ path: testInfo.outputPath('update-during-teacher-save.png') });
    await later.click(); await expect(banner).toHaveCount(0);
    release(); await expect(field).toHaveValue('');
    await expect(page.getByRole('status', { name: '특이사항 접수 확인', exact: true })).toBeVisible();
    expect(writes).toBe(1);
    const after = await (await request.get(database, { headers: owner })).json();
    expect(after.classes).toEqual(before.classes); expect(after.attendance).toEqual(before.attendance);
    const entries = Object.values(after.suggestions[year]['1-1-1']);
    expect(entries).toHaveLength(1); expect(entries[0]).toMatchObject({ kind: 'note', text: '업데이트 중 보존할 합성 초안' });
  } finally { release(); }
});

test('계정 수정의 원격 경합과 같은 이메일 중복 등록은 기존 역할·숨김 필드를 덮지 않는다', async ({ page, request }) => {
  await login(page); await page.goto('/admin?section=accounts');
  await page.getByRole('button', { name: `${teacherEmail} 계정 수정`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '이메일 역할 수정', exact: true });
  const classInput = dialog.getByRole('spinbutton', { name: '반', exact: true });
  await classInput.fill('2');
  const rolePath = '/userRoles/quality-teacher__at__example__dot__test.json';
  let writes = 0, expected;
  await page.route(`**${rolePath}?**`, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++;
    expect(route.request().headers()['if-match']).toBeTruthy();
    expect(route.request().headers()['if-match']).not.toBe('*');
    expect((await request.put(`http://127.0.0.1:19017${rolePath}?ns=${namespace}`, { headers: owner, data: {
      email: teacherEmail, role: 'teacher', part: '1', grade: '1', class: '3', name: '원격 변경 합성 담임', hiddenFlag: '보존할 합성 필드',
    } })).ok()).toBe(true);
    expected = await (await request.get(database, { headers: owner })).json();
    const response = await route.fetch(); expect(response.status()).toBe(412); await route.fulfill({ response });
  });
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('다른 작업에서 자료를 변경했습니다. 자동 덮어쓰기 없이 중단했으니 최신 자료를 확인해 주세요.', { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible(); await expect(classInput).toHaveValue('2');
  await expect(dialog.getByRole('button', { name: '저장', exact: true })).toBeEnabled();
  expect(writes).toBe(1); expect(expected).toBeTruthy(); await unchanged(request, expected);
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('button', { name: '이메일 역할 등록', exact: true }).click();
  const add = page.getByRole('dialog', { name: '이메일 역할 등록', exact: true });
  await add.getByRole('textbox', { name: '이메일', exact: true }).fill(teacherEmail);
  await add.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('이미 등록된 이메일입니다. 기존 계정을 수정해 주세요.', { exact: true })).toBeVisible();
  await expect(add).toBeVisible(); await expect(add.getByRole('textbox', { name: '이메일', exact: true })).toHaveValue(teacherEmail);
  expect(writes).toBe(1); await unchanged(request, expected);
});
