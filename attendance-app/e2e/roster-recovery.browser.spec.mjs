import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';

const namespace = 'demo-attendance-recovery-default-rtdb';
const base = 'http://127.0.0.1:19017';
const headers = { Authorization: 'Bearer owner' };
const password = 'synthetic-password-123';
const email = 'recovery-admin@example.test';
const otherEmail = 'recovery-admin2@example.test';
const year = new Date().getFullYear();
const url = path => `${base}/${path}.json?ns=${namespace}`;
const original = { id: 'restored', name: '복원 합성 학생', personId: 'restore-person', birth: '2010.01.01', num: 2 };
const resident = { id: 'resident', name: '기존 합성 학생', personId: 'resident-person', num: 1 };
const studentCopy = { ...original, ck: '1-1-1', deletedAt: 100 };
async function read(request, path = '') { return (await request.get(url(path), { headers })).json(); }
async function write(request, path, value) { expect((await request.put(url(path), { headers, data: value })).ok()).toBe(true); }
async function seed(request) {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 환경만 허용합니다.');
  const ids = [];
  for (const address of [email, otherEmail]) {
    const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
    const data = { email: address, password, returnSecureToken: true };
    let account = await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data });
    if (!account.ok()) account = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data });
    expect(account.ok()).toBe(true); ids.push((await account.json()).localId);
  }
  await write(request, '', {
    attendanceAdmins: Object.fromEntries(ids.map(id => [id, true])),
    userRoles: Object.fromEntries([email, otherEmail].map(address => [address.replaceAll('@', '__at__').replaceAll('.', '__dot__'), { email: address, role: 'admin', name: '합성 관리자' }])),
    classes: { [year]: { '1-1-1': { teacher: '합성 담임', students: { resident } }, '1-1-2': { teacher: '다른 합성 담임' } } },
    attendance: { [year]: { '1-1-1': { resident: { '0-0': 'O' }, restored: { '0-0': 'X', '0-1': 'T' } }, '1-1-2': { old: { '0-0': 'O' } } } },
    trash: { [year]: { students: { copy: studentCopy } } },
  });
}
async function login(page, address = email) {
  await page.goto('/manage');
  await page.getByLabel('이메일', { exact: true }).fill(address);
  await page.getByRole('button', { name: '비밀번호', exact: true }).click(); await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.aw-account')).toBeVisible();
  await page.goto('/manage?view=class');
}
async function openTrash(page) {
  await page.getByRole('button', { name: '🗑 최근 삭제', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '최근 삭제 목록' });
  await expect(dialog.locator('.management-hint').first()).toContainText('학생');
  return dialog;
}
function row(dialog, name) { return dialog.locator('.management-trash-row').filter({ has: dialog.page().locator('strong', { hasText: name }) }); }
function finalPatch(route) {
  return route.request().method() === 'PATCH' && Object.keys(route.request().postDataJSON()).some(path => path.startsWith(`trash/${year}/`));
}
test.beforeEach(async ({ request }) => { await seed(request); });

test('레거시 학생이 삭제 확인 전에 교체되면 다른 학생과 출석을 삭제하지 않는다', async ({ page, request }) => {
  await write(request, `classes/${year}/1-1-1/students/resident`, { id: 'resident', name: resident.name, birth: '2010.01.01', phone: '01000000001' });
  await login(page);
  await page.locator('.student-card').filter({ hasText: resident.name }).getByRole('button', { name: '수정', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '학생 수정' });
  await expect(dialog).toBeVisible();
  await write(request, `classes/${year}/1-1-1/students/resident`, { id: 'resident', name: resident.name, birth: '2010.02.02', phone: '01000000009' });
  const before = await read(request);
  await dialog.getByRole('button', { name: '삭제', exact: true }).click();
  await dialog.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('학생 연결이 변경되었습니다');
  expect(await read(request)).toEqual(before);
});

test('다른 반으로 이동한 학생의 오래된 삭제본은 복원하지 않는다', async ({ page, request }) => {
  await write(request, `classes/${year}/1-1-2/students/moved`, { ...original, id: 'moved' });
  await login(page);
  const dialog = await openTrash(page);
  const before = await read(request);
  await row(dialog, original.name).getByRole('button', { name: '복원', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('같은 학생이 현재 명단에 이미 있습니다');
  const after = await read(request);
  expect(after.classes).toEqual(before.classes);
  expect(after.attendance).toEqual(before.attendance);
  expect(after.trash).toEqual(before.trash);
  expect(await read(request, `config/studentMoveLocks/${year}`)).toBeNull();
});

test('학생 복원은 사본 소비와 한 PATCH로 확정하며 응답 유실에도 기존 출석을 보존한다', async ({ page, request }, testInfo) => {
  await login(page);
  const dialog = await openTrash(page);
  const before = await read(request);
  let patches = 0, payload, patchUrl;
  await page.route('**/.json?**', async route => {
    if (!finalPatch(route)) return route.continue();
    patches++; payload = route.request().postDataJSON(); patchUrl = route.request().url();
    expect(payload[`trash/${year}/students/copy`]).toBeNull();
    expect(payload[`classes/${year}/1-1-1/students/restored`]).toEqual(original);
    expect(Object.keys(payload).some(path => path.startsWith('attendance/'))).toBe(false);
    const lockLeaves = Object.keys(payload).filter(path => path.startsWith(`config/studentMoveLocks/${year}/`));
    expect(lockLeaves).toHaveLength(2);
    expect(lockLeaves.some(path => path.includes('/__roster_restore__/'))).toBe(true);
    expect(lockLeaves.every(path => payload[path] === null)).toBe(true);
    const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort();
  });
  await row(dialog, original.name).getByRole('button', { name: '복원', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('명단 복원과 삭제 목록 정리가 함께 완료');
  expect(patches).toBe(1);
  expect(await read(request, `classes/${year}/1-1-1/students/restored`)).toEqual(original);
  expect(await read(request, `classes/${year}/1-1-1/students/resident`)).toEqual(resident);
  expect(await read(request, `trash/${year}/students/copy`)).toBeNull();
  expect(await read(request, 'attendance')).toEqual(before.attendance);
  expect(await read(request, `config/studentMoveLocks/${year}`)).toBeNull();
  expect(Object.keys(payload).filter(path => path.startsWith(`config/studentMoveCommits/${year}/`))).toHaveLength(1);
  // 이미 소비된 사본의 늦은 원자 요청은 같은 계정이어도 재적용할 수 없다.
  const committed = await read(request);
  const replay = await request.patch(patchUrl, { data: payload });
  expect([401, 403]).toContain(replay.status());
  expect(await read(request)).toEqual(committed);
  await page.screenshot({ path: testInfo.outputPath('student-restored-atomic.png') });
});

test('반 복원과 삭제본 영구 삭제도 학생 ID·기존 출석을 보존한다', async ({ page, request }) => {
  const copy = { ck: '1-1-3', teacher: '복원 반 담임', students: { old: { id: 'old', name: '반 복원 학생', personId: 'class-restored-person' } }, adminChanges: { previous: { action: '과거 합성 이력' } }, deletedAt: 101 };
  await write(request, `trash/${year}/classes/class-copy`, copy);
  await login(page);
  const dialog = await openTrash(page);
  const before = await read(request);
  let patches = 0;
  await page.route('**/.json?**', async route => {
    if (!finalPatch(route)) return route.continue();
    patches++;
    expect(Object.keys(route.request().postDataJSON()).some(path => path.startsWith('attendance/'))).toBe(false);
    const response = await route.fetch(); expect(response.ok()).toBe(true); await route.fulfill({ response });
  });
  await row(dialog, '1부 1학년 3반').getByRole('button', { name: '복원', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('반 명단 복원과 삭제 목록 정리가 함께 완료');
  const restored = await read(request, `classes/${year}/1-1-3`);
  expect(restored).toMatchObject({ teacher: copy.teacher, students: copy.students, adminChanges: copy.adminChanges });
  expect(restored.ck).toBeUndefined(); expect(restored.deletedAt).toBeUndefined();
  expect(await read(request, `trash/${year}/classes/class-copy`)).toBeNull();
  await row(dialog, original.name).getByRole('button', { name: '영구 삭제', exact: true }).click();
  await row(dialog, original.name).getByRole('button', { name: '영구 삭제 확인', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('선택한 삭제본을 영구 삭제');
  expect(await read(request, `trash/${year}/students/copy`)).toBeNull();
  expect(await read(request, `classes/${year}/1-1-1`)).toEqual(before.classes[year]['1-1-1']);
  expect(await read(request, 'attendance')).toEqual(before.attendance);
  expect(await read(request, `config/studentMoveLocks/${year}`)).toBeNull();
  expect(patches).toBe(2);
});

test('서로 다른 반의 동일 인물 삭제본은 관리자 두 명이 동시에 복원할 수 없다', async ({ page, request, browser }) => {
  await write(request, `trash/${year}/students/other-copy`, { ...studentCopy, id: 'second', ck: '1-1-2', deletedAt: 102 });
  await login(page);
  const dialog = await openTrash(page);
  const otherContext = await browser.newContext();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let reached;
  const pending = new Promise(resolve => { reached = resolve; });
  let patches = 0;
  await page.route('**/.json?**', async route => {
    if (!finalPatch(route)) return route.continue();
    patches++; reached(); await gate;
    const response = await route.fetch(); expect(response.ok()).toBe(true); await route.fulfill({ response });
  });
  try {
    const otherPage = await otherContext.newPage();
    await login(otherPage, otherEmail);
    const otherDialog = await openTrash(otherPage);
    const before = await read(request, 'attendance');
    await dialog.locator('.management-trash-row').filter({ hasText: '1부 1학년 1반' }).getByRole('button', { name: '복원', exact: true }).click();
    await pending;
    await otherDialog.locator('.management-trash-row').filter({ hasText: '1부 1학년 2반' }).getByRole('button', { name: '복원', exact: true }).click();
    await expect(otherDialog.getByRole('alert')).toContainText('다른 작업이 진행 중');
    release();
    await expect(dialog.getByRole('status')).toContainText('명단 복원과 삭제 목록 정리가 함께 완료');
    await otherDialog.locator('.management-trash-row').filter({ hasText: '1부 1학년 2반' }).getByRole('button', { name: '복원', exact: true }).click();
    await expect(otherDialog.getByRole('alert')).toContainText('같은 학생이 현재 명단에 이미 있습니다');
    const classes = await read(request, `classes/${year}`);
    expect(Object.values(classes).flatMap(value => Object.values(value.students ?? {})).filter(value => value.personId === original.personId)).toHaveLength(1);
    expect(await read(request, `trash/${year}/students/copy`)).toBeNull();
    expect(await read(request, `trash/${year}/students/other-copy`)).toMatchObject({ id: 'second', personId: original.personId });
    expect(await read(request, 'attendance')).toEqual(before);
    expect(await read(request, `config/studentMoveLocks/${year}`)).toBeNull();
    expect(patches).toBe(1);
  } finally { release(); await otherContext.close(); }
});
