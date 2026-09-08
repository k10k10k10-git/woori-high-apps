import { chromium } from '../../highschool-app/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const captures = fileURLToPath(new URL('../../.impeccable/review/pastoral/', import.meta.url));
await mkdir(captures, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
try {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:4189');
  await page.getByText('가상 가람', { exact: true }).waitFor();
  await page.getByText('등록일 2026', { exact: false }).first().waitFor();
  await page.screenshot({ path: `${captures}/desktop.png`, fullPage: true });
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [index, tab] of ['새친구 정착현황', '연속 결석', '이번 주 요약'].entries()) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `가로 넘침 ${width}/${tab}`);
      await page.screenshot({ path: `${captures}/${width === 375 && index === 0 ? 'mobile' : `mobile-${width}-${index}`}.png`, fullPage: true });
    }
  }
  await page.getByRole('button', { name: '연속 결석', exact: true }).click();
  assert.equal(await page.locator('.pr-students > li').count(), 1);
  await page.getByLabel('장결 구분').selectOption('long');
  assert.equal(await page.locator('.pr-students > li').count(), 1);
  assert.match(await page.locator('.pr-students').innerText(), /가상 라온/);
  await page.getByLabel('장결 구분').selectOption('all');
  assert.equal(await page.locator('.pr-students > li').count(), 2);
  await page.getByRole('searchbox').fill('없는 학생');
  assert.equal(await page.locator('.pr-students > li').count(), 0);
  await page.getByRole('button', { name: '필터 초기화' }).click();
  assert.equal(await page.locator('.pr-students > li').count(), 2);
  await page.goto('http://127.0.0.1:4189/?error=1');
  await page.getByRole('alert').waitFor();
  await page.screenshot({ path: `${captures}/error.png`, fullPage: true });
  await page.evaluate(() => history.replaceState(null, '', '/'));
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
  await page.goto('http://127.0.0.1:4189/?teacher=1');
  await page.getByText('관리자 로그인 후 이용할 수 있습니다.').waitFor();
  assert.equal(await page.locator('a[href^="tel:"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: 실제 컴포넌트 PC1440/모바일375·320, 세부 탭·검색·장결·오류 복구·교사 차단, 운영 네트워크 차단');
} finally { await browser.close(); }
