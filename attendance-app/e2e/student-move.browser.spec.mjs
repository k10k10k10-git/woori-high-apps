import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';

const namespace = 'demo-attendance-recovery-default-rtdb';
const base = 'http://127.0.0.1:19017';
const headers = { Authorization: 'Bearer owner' };
const email = 'move-admin@example.test';
const password = 'synthetic-password-123';
const year = new Date().getFullYear();
const source = { name: '이동 학생', personId: 'person_student_moved', num: 1 };
const resident = { name: '기존 학생', personId: 'person_student_resident', num: 1 };
const url = path => `${base}/${path}.json?ns=${namespace}`;
async function read(request, path) { return (await request.get(url(path), { headers })).json(); }

async function seed(request, orphan = false) {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 환경만 허용합니다.');
  const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
  const data = { email, password, returnSecureToken: true };
  let account = await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data });
  if (!account.ok()) account = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data });
  expect(account.ok()).toBe(true);
  const { localId } = await account.json();
  expect((await request.put(url(''), { headers, data: {
    attendanceAdmins: { [localId]: true },
    userRoles: { 'move-admin__at__example__dot__test': { email, role: 'admin', name: '합성 관리자' } },
    classes: { [year]: {
      '2-1-7': { teacher: '출발 담임', students: { S17_05: source } },
      '1-1-7': { teacher: '도착 담임', students: orphan ? { other: resident } : { S17_05: resident } },
    } },
    attendance: { [year]: { '2-1-7': { S17_05: { '0-0': 'O', '0-1': 'T' } }, '1-1-7': { S17_05: { '0-0': 'X' } } } },
  } })).ok()).toBe(true);
}
async function openMove(page) {
  await page.goto('/manage');
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.aw-account')).toBeVisible();
  await page.goto('/manage?view=class');
  await page.locator('.mw-scope select').first().selectOption('2');
  await page.getByRole('button', { name: '7반 · 출발 담임', exact: true }).click();
  await page.locator('.student-card').filter({ hasText: '이동 학생' }).getByRole('button', { name: '이동', exact: true }).click();
  await page.getByLabel('이동할 부서').selectOption('1');
  await page.getByLabel('이동할 반').selectOption('7');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function confirmMove(page) {
  const dialog = page.getByRole('dialog', { name: '학생 이동' });
  await dialog.getByRole('button', { name: '이동 내용 확인', exact: true }).click();
  await dialog.getByRole('button', { name: '이동 확정', exact: true }).click();
}
for (const orphan of [false, true]) test(`${orphan ? '출석만 남은 ID' : '기존 학생 ID'} 충돌을 새 ID로 분리하고 응답 유실도 확인한다`, async ({ page, request }) => {
  await seed(request, orphan);
  await openMove(page);
  let patches = 0;
  await page.route('**/.json?**', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patches++;
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '학생 이동' })).toBeVisible();
    await expect(page.getByLabel('이동할 부서')).toBeDisabled();
    // 별도 REST 요청은 브라우저 잠금을 공유하지 않는다. 같은 관리자 계정도 서버에서 차단해야 한다.
    const token = new URL(route.request().url()).searchParams.get('auth');
    expect(token).toBeTruthy();
    const concurrent = await request.put(`${url(`attendance/${year}/2-1-7/S17_05/0-0`)}&auth=${encodeURIComponent(token)}`, { data: JSON.stringify('X'), headers: { 'Content-Type': 'application/json' } });
    expect(concurrent.status()).toBe(401);
    expect(await concurrent.json()).toMatchObject({ error: 'Permission denied' });
    const edit = await request.patch(`${url(`classes/${year}/2-1-7/students/S17_05`)}&auth=${encodeURIComponent(token)}`, { data: { school: '경쟁 수정' } });
    expect(edit.status()).toBe(401);
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort();
  });
  await confirmMove(page);
  await expect(page.getByRole('dialog', { name: '학생 이동' })).toHaveCount(0);
  const students = await read(request, `classes/${year}/1-1-7/students`);
  expect(Object.keys(students)).toHaveLength(2);
  const [newId, moved] = Object.entries(students).find(([, student]) => student.personId === source.personId);
  expect(newId).not.toBe('S17_05');
  expect(moved).toMatchObject({ ...source, id: newId });
  expect(students[orphan ? 'other' : 'S17_05']).toEqual(resident);
  expect(await read(request, `attendance/${year}/1-1-7/S17_05`)).toEqual({ '0-0': 'X' });
  expect(await read(request, `attendance/${year}/1-1-7/${newId}`)).toEqual({ '0-0': 'O', '0-1': 'O' });
  expect(await read(request, `classes/${year}/2-1-7/students/S17_05`)).toBeNull();
  expect(await read(request, `attendance/${year}/2-1-7/S17_05`)).toBeNull();
  expect(await read(request, `config/studentMoveLocks/${year}`)).toBeNull();
  expect(patches).toBe(1);
});

test('충돌이 없으면 기존 학생 ID를 유지한다', async ({ page, request }) => {
  await seed(request, true);
  expect((await request.delete(url(`attendance/${year}/1-1-7/S17_05`), { headers })).ok()).toBe(true);
  await openMove(page);
  await confirmMove(page);
  await expect(page.getByRole('dialog', { name: '학생 이동' })).toHaveCount(0);
  expect(await read(request, `classes/${year}/1-1-7/students/S17_05`)).toMatchObject({ ...source, id: 'S17_05' });
  expect(await read(request, `classes/${year}/1-1-7/students/other`)).toEqual(resident);
});

test('목적지에 같은 인물이 있으면 중복 이동을 차단한다', async ({ page, request }) => {
  await seed(request);
  expect((await request.put(url(`classes/${year}/1-1-7/students/S17_05`), { headers, data: source })).ok()).toBe(true);
  await openMove(page);
  await confirmMove(page);
  await expect(page.getByText('같은 인물의 학생이 목적지에 이미 있습니다. 중복 명단을 먼저 확인해 주세요.')).toBeVisible();
  expect(await read(request, `classes/${year}/2-1-7/students/S17_05`)).toEqual(source);
  expect(await read(request, `attendance/${year}/1-1-7/S17_05`)).toEqual({ '0-0': 'X' });
});

test('시트 동기화 제거 후 데이터 관리 조회는 원장을 보존하고 인계·진급을 유지한다', async ({ page, request }, testInfo) => {
  await seed(request);
  await request.put(url('config/sheetSync'), { headers, data: { bu1Url: 'legacy-synthetic-sheet', bu2Url: 'legacy-synthetic-sheet-2' } });
  const before = await read(request, '');
  const sheetRequests = [];
  page.on('request', request => { if (request.url().includes('docs.google.com/spreadsheets')) sheetRequests.push(request.url()); });
  await openMove(page);
  await page.getByRole('dialog', { name: '학생 이동' }).getByRole('button', { name: '취소', exact: true }).click();
  await page.goto('/admin');
  await page.getByRole('tab', { name: '데이터 관리' }).click();
  await expect(page.getByRole('heading', { name: /청년부 인계/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '전체 고3 엑셀 내려받기' })).toBeVisible();
  await expect(page.getByText('새해 진급 처리', { exact: true })).toBeVisible();
  expect(await page.locator('.admin-settings').textContent()).not.toMatch(/구글 시트|동기화 미리보기|동기화 적용|시트 주소/);
  await page.screenshot({ path: testInfo.outputPath('data-without-sheet-sync.png'), fullPage: true });
  expect(sheetRequests).toEqual([]);
  expect(await read(request, '')).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const concurrent of [false, true]) test(`진급 ${concurrent ? '미리보기 이후 전입생 보호' : '정상 반영과 복구 사본 보존'}`, async ({ page, request }) => {
  await seed(request);
  await request.put(url(`classes/${year - 1}/1-1-1`), { headers, data: { students: { promoted: { id: 'promoted', name: '합성 진급생', personId: 'person_student_promoted' } } } });
  await request.put(url(`classes/${year}/1-2-1`), { headers, data: { teacher: '진급 담임' } });
  await openMove(page);
  await page.getByRole('dialog', { name: '학생 이동' }).getByRole('button', { name: '취소', exact: true }).click();
  await page.goto('/admin');
  await page.getByRole('tab', { name: '데이터 관리' }).click();
  await page.locator('.as-promotion-section summary').click();
  await page.getByRole('button', { name: '진급 미리보기', exact: true }).click();
  await expect(page.getByRole('button', { name: '진급 실행', exact: true })).toBeVisible();
  if (concurrent) await request.put(url(`classes/${year}/1-2-1/students/arrival`), { headers, data: { id: 'arrival', name: '합성 전입생' } });
  await page.getByRole('button', { name: '진급 실행', exact: true }).click();
  if (concurrent) {
    await expect(page.getByText('미리보기 이후 명단·출석이 변경되었습니다. 다시 미리보기해 주세요.')).toBeVisible();
    expect(await read(request, `classes/${year}/1-2-1/students`)).toEqual({ arrival: { id: 'arrival', name: '합성 전입생' } });
  } else {
    await expect(page.getByText(`1명의 학생을 ${year}년으로 진급 처리했습니다.`)).toBeVisible();
    expect(await read(request, `classes/${year}/1-2-1/students/promoted/personId`)).toBe('person_student_promoted');
    const backups = await read(request, `trash/${year}/classes`);
    expect(Object.values(backups)).toEqual([expect.objectContaining({ teacher: '진급 담임', ck: '1-2-1' })]);
  }
});
