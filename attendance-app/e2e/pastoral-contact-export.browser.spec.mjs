import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';
import { readFile } from 'node:fs/promises';
import XLSX from '../node_modules/xlsx/xlsx.js';

const base = 'http://127.0.0.1:19017';
const ns = 'demo-attendance-recovery-default-rtdb';
const owner = { Authorization: 'Bearer owner' };
const email = 'contact-export-admin@example.test', password = 'synthetic-password-123';
const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));
test('전체 연락처 엑셀은 화면 필터·장결과 무관하고 원장을 변경하지 않는다', async ({ page, request }) => {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 에뮬레이터가 필요합니다.');
  const auth = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
  const data = { email, password, returnSecureToken: true };
  await request.post(`${auth}/accounts:signUp?key=synthetic-key`, { data });
  const login = await request.post(`${auth}/accounts:signInWithPassword?key=synthetic-key`, { data });
  expect(login.ok()).toBe(true); const { localId } = await login.json();
  const absent = { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' };
  const recovered = { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'O' };
  const records = {
    attendanceAdmins: { [localId]: true }, userRoles: { 'contact-export-admin__at__example__dot__test': { email, role: 'admin' } },
    classes: { [year]: {
      '1-1-1': { students: { a: { name: '결석 학생', phone: '01000000001', pphone: '01000000011' } } },
      '2-3-7': { students: { b: { name: '장결 학생', jang: true }, c: { name: '복귀 학생', phone: '01000000002', pphone: '01000000012' } } },
    } }, attendance: { [year]: { '1-1-1': { a: absent }, '2-3-7': { b: absent, c: recovered } } },
  };
  const url = `${base}/.json?ns=${ns}`;
  expect((await request.put(url, { headers: owner, data: records })).ok()).toBe(true);
  const before = await (await request.get(url, { headers: owner })).json();
  await page.clock.setFixedTime(new Date(`${year}-03-01T12:00:00+09:00`));
  await page.goto('/pastoral?view=absence&week=0-3');
  await page.getByLabel('이메일', { exact: true }).fill(email); await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('button', { name: '연속 결석 전체 연락처 엑셀 내려받기' })).toBeEnabled();
  await page.getByRole('searchbox', { name: '학생 검색' }).fill('없는 학생');
  await expect(page.getByText('이 조건에 해당하는 연속 결석 학생이 없습니다.')).toBeVisible();
  const layout = await page.evaluate(() => ({
    viewport: innerWidth, width: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll('body *')].flatMap(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.right > innerWidth + 1 && getComputedStyle(element).visibility !== 'hidden'
        ? [{ tag: element.tagName, class: element.className, left: bounds.left, right: bounds.right }] : [];
    }).slice(0, 20),
  }));
  if (layout.width > layout.viewport) console.log('모바일 너비 진단', JSON.stringify(layout));
  expect(layout.width <= layout.viewport).toBe(true);
  for (const [label, count] of [['연속 결석', 2], ['다시 출석', 1]]) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: `${label} 전체 연락처 엑셀 내려받기` }).click();
    const download = await pending;
    expect(download.suggestedFilename().normalize('NFC')).toContain(`${label.replace(/ /g, '')}_전체연락처_${year}-01-`);
    const workbook = XLSX.read(await readFile(await download.path()), { cellNF: true });
    const sheet = workbook.Sheets[label]; const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    expect(rows.slice(6)).toHaveLength(count); expect(rows[2][0]).toContain('필터 미적용');
    expect(rows[5][6]).toBe('보호자 연락처');
    if (label === '연속 결석') {
      expect(rows.slice(6).map(row => row[0])).toContain('장결 학생');
      expect(rows.slice(6).find(row => row[0] === '결석 학생')[1]).toBe('01000000001');
      expect(rows.slice(6).find(row => row[0] === '결석 학생')[6]).toBe('01000000011');
      expect(rows.slice(6).find(row => row[0] === '장결 학생')[1]).toBe('미등록');
    } else {
      expect(rows[6][1]).toBe('01000000002'); expect(rows[6][4]).toBe(3); expect(sheet.F7.z).toBe('yyyy-mm-dd');
      expect(sheet.G7).toMatchObject({ t: 's', v: '01000000012' });
    }
  }
  expect(await (await request.get(url, { headers: owner })).json()).toEqual(before);
});
