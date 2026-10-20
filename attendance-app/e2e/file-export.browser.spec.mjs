import { test, expect } from '../../highschool-app/node_modules/@playwright/test/index.mjs';
import { readFile } from 'node:fs/promises';
import XLSX from '../node_modules/xlsx/xlsx.js';

const database = 'http://127.0.0.1:19017/.json?ns=demo-attendance-recovery-default-rtdb';
const owner = { Authorization: 'Bearer owner' };
const email = 'files-admin@example.test', password = 'synthetic-password-123';
const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));

test('파일화에서 부서별·반별·목양 연락처 파일을 내려받고 원장은 보존한다', async ({ page, request }, testInfo) => {
  if (process.env.ATTENDANCE_BROWSER_CONTRACTS !== '1' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19017') throw new Error('격리 에뮬레이터가 필요합니다.');
  const endpoint = 'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1';
  const credentials = { email, password, returnSecureToken: true };
  await request.post(`${endpoint}/accounts:signUp?key=synthetic-key`, { data: credentials });
  const login = await request.post(`${endpoint}/accounts:signInWithPassword?key=synthetic-key`, { data: credentials });
  expect(login.ok()).toBe(true);
  const { localId } = await login.json();
  const records = {
    attendanceAdmins: { [localId]: true },
    userRoles: { 'files-admin__at__example__dot__test': { email, role: 'admin' } },
    classes: { [year]: {
      '1-1-1': { teacher: '합성 교사', students: {
        a: { name: '결석 학생', num: 1, phone: '01000000001', pphone: '01000000011', school: '합성 학교', addr: '합성 주소', birth: '2010. 01. 02' },
        b: { name: '복귀 학생', num: 2, phone: '01000000002', pphone: '01000000012' },
      } },
      '2-3-7': { teacher: '다른 교사', students: { c: { name: '다른 부서 학생', num: 1, jang: true, phone: '01000000003', pphone: '01000000013' } } },
    } },
    attendance: { [year]: {
      '1-1-1': { a: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' }, b: { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'O' } },
      '2-3-7': { c: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' } },
    } },
  };
  expect((await request.put(database, { headers: owner, data: records })).ok()).toBe(true);
  const before = await (await request.get(database, { headers: owner })).json();
  await page.clock.setFixedTime(new Date(`${year}-03-01T12:00:00+09:00`));
  await page.goto('/files');
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('heading', { name: '파일화', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '관리자 메뉴', exact: true }).getByRole('link', { name: '파일화', exact: true })).toHaveAttribute('aria-current', 'page');

  async function download(button, artifact) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: button, exact: true }).click();
    const file = await pending;
    const path = testInfo.outputPath(artifact);
    await file.saveAs(path);
    const bytes = await readFile(path);
    const workbook = XLSX.read(bytes, { cellNF: true });
    const contents = workbook.SheetNames.map(name => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }));
    return { workbook, contents, text: JSON.stringify(contents) };
  }

  const first = await download('1부 전체 명단 엑셀 내려받기', 'part-1.xlsx');
  expect(first.text).toContain('결석 학생'); expect(first.text).toContain('복귀 학생');
  expect(first.text).not.toContain('다른 부서 학생');
  expect(first.text).toContain('보호자 연락처'); expect(first.text).toContain('01000000011');
  expect(first.text).toContain('출석률'); expect(first.text).toContain('등급');
  const second = await download('2부 전체 명단 엑셀 내려받기', 'part-2.xlsx');
  expect(second.text).toContain('다른 부서 학생'); expect(second.text).not.toContain('결석 학생');
  await page.screenshot({ path: testInfo.outputPath('files-roster.png'), fullPage: true });

  await page.getByRole('button', { name: '반별 출석부', exact: true }).click();
  await page.getByRole('combobox', { name: '부서', exact: true }).selectOption('1');
  await page.getByRole('combobox', { name: '학년', exact: true }).selectOption('1');
  const single = await download('선택한 반 출석부 엑셀 내려받기', 'class.xlsx');
  expect(single.text).toContain('결석 학생'); expect(single.text).not.toContain('다른 부서 학생');
  expect(single.text).toContain('출석률'); expect(single.text).toContain('등급');
  expect(single.contents.flat(2)).toEqual(expect.arrayContaining(['O', 'X']));
  await page.screenshot({ path: testInfo.outputPath('files-class.png'), fullPage: true });

  for (const [kind, name, phone] of [['연속 결석', '결석 학생', '01000000011'], ['다시 출석', '복귀 학생', '01000000012']]) {
    await page.getByRole('button', { name: `${kind} 명단`, exact: true }).click();
    await page.getByRole('combobox', { name: '기준 주일', exact: true }).selectOption('0-3');
    const file = await download(`${kind} 명단 엑셀 내려받기`, kind === '연속 결석' ? 'absent.xlsx' : 'recovered.xlsx');
    const rows = file.contents[0];
    expect(rows[5][6]).toBe('보호자 연락처');
    const person = rows.slice(6).find(row => row[0] === name);
    expect(person[6]).toBe(phone);
    expect(rows.slice(6)).toHaveLength(kind === '연속 결석' ? 2 : 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('files-pastoral.png'), fullPage: true });
  expect(await (await request.get(database, { headers: owner })).json()).toEqual(before);
});
