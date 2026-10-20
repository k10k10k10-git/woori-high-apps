import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';
import { readFile } from 'node:fs/promises';
import XLSX from '../node_modules/xlsx/xlsx.js';

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
  let holdSubscriptions = false;
  const heldUpdates = [];
  await page.routeWebSocket(socketUrl => socketUrl.hostname === '127.0.0.1' && socketUrl.port === '19017', socket => {
    const server = socket.connectToServer();
    server.onMessage(message => {
      let frame;
      try { frame = JSON.parse(message.toString()); } catch { /* 분할 프레임은 그대로 전달한다. */ }
      // 인증·잠금·GET 응답은 통과시키고 PATCH 이후 명단·출석 구독만 지연한다.
      if (holdSubscriptions && frame?.t === 'd' && ['d', 'm'].includes(frame.d?.a)
        && /^\/?(?:classes|attendance)\//.test(frame.d?.b?.p ?? '')) {
        heldUpdates.push(() => socket.send(message));
      } else socket.send(message);
    });
  });
  await openMove(page);
  let patches = 0;
  let resultPaths = [];
  const resultReads = [];
  const lockReads = [];
  const lockWrites = [];
  page.on('request', request => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== base || requestUrl.pathname !== `/config/studentMoveLocks/${year}.json`) return;
    if (request.method() === 'GET') lockReads.push(request.headers()['x-firebase-etag']);
    if (request.method() === 'PUT') lockWrites.push(request.headers()['if-match']);
  });
  page.on('response', response => {
    const responseUrl = new URL(response.url());
    if (holdSubscriptions && response.request().method() === 'GET'
      && responseUrl.hostname === '127.0.0.1' && responseUrl.port === '19017'
      && responseUrl.pathname.endsWith('.json')) {
      resultReads.push({ path: decodeURIComponent(responseUrl.pathname.slice(1, -5)), status: response.status() });
    }
  });
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
    const payload = route.request().postDataJSON();
    resultPaths = [
      Object.keys(payload).find(path => path.startsWith(`config/studentMoveCommits/${year}/`)),
      `classes/${year}/2-1-7/students/S17_05`,
      Object.keys(payload).find(path => path.startsWith(`classes/${year}/1-1-7/students/`)),
    ];
    expect(resultPaths.every(Boolean)).toBe(true);
    holdSubscriptions = true;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort();
  });
  await confirmMove(page);
  await expect(page.getByRole('dialog', { name: '학생 이동' })).toHaveCount(0);
  await expect.poll(() => heldUpdates.length).toBeGreaterThan(0);
  expect(resultReads).toEqual(expect.arrayContaining(resultPaths.map(path => ({ path, status: 200 }))));
  expect(resultReads.filter(result => resultPaths.includes(result.path))).toHaveLength(3);
  expect(lockReads.length).toBeGreaterThanOrEqual(2);
  expect(lockReads.every(value => value === 'true')).toBe(true);
  expect(lockWrites.length).toBeGreaterThanOrEqual(2);
  expect(lockWrites.every(value => typeof value === 'string' && value.length > 0 && value !== '*')).toBe(true);
  // 목적지의 SDK 명단은 아직 이동 전이지만 서버 확인으로 모달은 정상 종료돼야 한다.
  await expect(page.locator('.student-card').filter({ hasText: source.name })).toHaveCount(0);
  holdSubscriptions = false;
  for (const deliver of heldUpdates) deliver();
  await expect(page.locator('.student-card').filter({ hasText: source.name })).toHaveCount(1);
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
  const unrelatedRecord = { phase: 'preparing', startedAt: Date.now(), fromCk: '1-2-1', toCk: '1-2-2', sid: 'unrelated-student' };
  const unrelatedLocks = Object.fromEntries(['1-2-1', '1-2-2'].map(classKey => [classKey, { 'unrelated-owner': { 'unrelated-operation': unrelatedRecord } }]));
  const lockStatuses = [];
  let changed = false;
  await page.route(`**/config/studentMoveLocks/${year}.json?**`, async route => {
    if (route.request().method() === 'PUT' && !changed) {
      changed = true;
      // 최초 ETag 조회 직후 다른 두 반의 잠금이 생겨도 이를 덮지 않고 다시 비교한다.
      expect((await request.put(url(`config/studentMoveLocks/${year}`), { headers, data: unrelatedLocks })).ok()).toBe(true);
    }
    const response = await route.fetch();
    if (route.request().method() === 'PUT') lockStatuses.push(response.status());
    await route.fulfill({ response });
  });
  await openMove(page);
  await confirmMove(page);
  await expect(page.getByRole('dialog', { name: '학생 이동' })).toHaveCount(0);
  expect(changed).toBe(true);
  expect(lockStatuses[0]).toBe(412);
  expect(lockStatuses.slice(1).every(status => status === 200)).toBe(true);
  expect(await read(request, `config/studentMoveLocks/${year}`)).toEqual(unrelatedLocks);
  expect(await read(request, `classes/${year}/1-1-7/students/S17_05`)).toMatchObject({ ...source, id: 'S17_05' });
  expect(await read(request, `classes/${year}/1-1-7/students/other`)).toEqual(resident);
});

test('오프라인에서 이동을 확정해도 잠금·명단·출석을 변경하지 않는다', async ({ page, request, context }) => {
  await seed(request);
  await openMove(page);
  const before = await read(request, '');
  await context.setOffline(true);
  try {
    await confirmMove(page);
    await expect(page.getByRole('dialog', { name: '학생 이동' })).toBeVisible();
    await expect(page.getByRole('button', { name: '이동 확정', exact: true })).toBeEnabled();
    expect(await read(request, '')).toEqual(before);
  } finally { await context.setOffline(false); }
  await page.reload();
  await expect(page.locator('.aw-account')).toBeVisible();
  expect(await read(request, '')).toEqual(before);
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
  for (const [classKey, student, attendance] of [
    ['1-3-1', { name: '가상 인계생', birth: '2008. 01. 31', phone: '01000000001', pphone: '01000000002', addr: '합성시 합성구 검증로 123 가상 아파트 101동 202호' }, { '0-0': 'O', '0-1': 'X' }],
    ['2-3-11', { name: '나상 인계생', jang: true }, { '0-0': 'X' }],
  ]) {
    expect((await request.put(url(`classes/${year}/${classKey}/students/handoff`), { headers, data: student })).ok()).toBe(true);
    expect((await request.put(url(`attendance/${year}/${classKey}/handoff`), { headers, data: attendance })).ok()).toBe(true);
  }
  await page.clock.setFixedTime(new Date(`${year}-11-01T12:00:00+09:00`));
  const before = await read(request, '');
  const sheetRequests = [];
  page.on('request', request => { if (request.url().includes('docs.google.com/spreadsheets')) sheetRequests.push(request.url()); });
  await openMove(page);
  await page.getByRole('dialog', { name: '학생 이동' }).getByRole('button', { name: '취소', exact: true }).click();
  await page.goto('/admin');
  await page.getByRole('tab', { name: '데이터 관리' }).click();
  await expect(page.getByRole('heading', { name: /청년부 인계/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '전체 고3 엑셀 내려받기' })).toBeVisible();
  await page.locator('.as-handoff-preview summary').click();
  const preview = page.getByRole('region', { name: '청년부 인계 명단' });
  await expect(preview.getByRole('columnheader')).toHaveText(['학생 이름', '부서·학년·반', '생년월일', '본인 전화번호', '학부모 연락처', '학교', '주소', '출석률', '출석등급']);
  await expect(preview.getByRole('cell', { name: '2부 3학년 11반', exact: true })).toBeVisible();
  const address = preview.getByRole('cell', { name: '합성시 합성구 검증로 123 가상 아파트 101동 202호', exact: true });
  await expect(address).toHaveCSS('min-width', '230px');
  await expect(address).toHaveCSS('overflow-wrap', 'anywhere');
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 고3 엑셀 내려받기' }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename().normalize('NFC')).toBe(`청년부인계_고3_${year}_${year}-11-01.xlsx`);
  const file = testInfo.outputPath('youth-handoff.xlsx');
  await download.saveAs(file);
  const sheet = XLSX.read(await readFile(file), { cellNF: true }).Sheets['청년부 인계'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  expect(rows[5]).toEqual(['학생 이름', '부서·학년·반', '생년월일', '본인 전화번호', '학부모 연락처', '학교', '주소', '출석률', '출석등급']);
  expect(rows.slice(6).map(row => row.slice(0, 2))).toEqual([['가상 인계생', '1부 3학년 1반'], ['나상 인계생', '2부 3학년 11반']]);
  expect(sheet.C7).toMatchObject({ t: 'n', z: 'yyyy-mm-dd', w: '2008-01-31' });
  expect(sheet.D7).toMatchObject({ t: 's', v: '01000000001' });
  expect(sheet.E7).toMatchObject({ t: 's', v: '01000000002' });
  expect(sheet.H7).toMatchObject({ t: 'n', v: .5, z: '0%', w: '50%' });
  expect(sheet.I7.v).toBe('D');
  expect(sheet['!autofilter'].ref).toBe('A6:I8');
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
