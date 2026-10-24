import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ context, baseURL }) => {
  expect(baseURL).toBe("http://127.0.0.1:4179");
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.protocol === "data:" || (url.hostname === "127.0.0.1" && url.port === "4179") ? route.continue() : route.abort("blockedbyclient");
  });
});

async function expectRetreatActionsInFirstView(page: Page) {
  const links = page.getByRole("navigation", { name: "수련회 업무 영역" }).getByRole("link");
  await expect(links).toHaveCount(3);
  for (const link of await links.all()) {
    await expect(link).toBeInViewport({ ratio: 1 });
    const position = await link.evaluate((element) => {
      const menu = document.querySelector(".portal-mobile-bottom-nav");
      const availableBottom = menu && getComputedStyle(menu).display !== "none" ? menu.getBoundingClientRect().top : innerHeight;
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, availableBottom, scrollY };
    });
    expect(position.scrollY).toBe(0);
    expect(position.top).toBeGreaterThanOrEqual(0);
    expect(position.bottom, JSON.stringify(position)).toBeLessThanOrEqual(position.availableBottom);
  }
}

for (const theme of ["light", "dark"]) {
  test(`${theme} 수련회 선택 뒤 같은 수련회의 업무를 열고 공유 일정 대상을 명시한다`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`/?scenario=actualVacation&state=admin&theme=${theme}`);
    await expect(page.getByRole("heading", { name: "수련회", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("navigation", { name: "수련회 업무 영역" })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`retreat-choice-${theme}.png`), fullPage: true });
    await page.getByRole("button", { name: /2026년 PIN 잠금 합성 가을 수련회/ }).click();
    const workspace = page.getByRole("region", { name: "합성 가을 수련회 업무 선택" });
    await expect(workspace).toBeVisible();
    await expect(workspace).toContainText("2026.10.16 – 2026.10.18");
    const select = page.getByRole("combobox", { name: "선택한 수련회" });
    const mobile = (page.viewportSize()?.width ?? 1280) <= 900;
    if (mobile) {
      await expect(workspace.getByRole("combobox", { name: "선택한 수련회" })).toBeVisible();
      expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole("list", { name: "수련회 업무 시작 순서" })).not.toBeVisible();
      await expectRetreatActionsInFirstView(page);
    }
    const nav = page.getByRole("navigation", { name: "수련회 업무 영역" });
    await expect(nav.getByRole("link", { name: "행정", exact: true })).toHaveAttribute("href", "/events/synthetic-retreat/administration");
    await expect(nav.getByRole("link", { name: "프로그램 준비", exact: true })).toHaveAttribute("href", "/events/synthetic-retreat/programs");
    await expect(nav.getByRole("link", { name: "현장 업무(이가드)", exact: true })).toHaveAttribute("href", "/events/synthetic-retreat/field");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(a11y.violations.filter(item => item.impact === "serious" || item.impact === "critical")).toEqual([]);
    await page.screenshot({ path: info.outputPath(`retreat-workspace-${theme}.png`), fullPage: true });
    if (mobile) await select.selectOption("synthetic-winter");
    else await page.getByRole("button", { name: /2026년 합성 겨울 수련회/ }).click();
    const winter = page.getByRole("region", { name: "합성 겨울 수련회 업무 선택" });
    await expect(winter).toBeVisible();
    await expect(winter).toContainText("2026.01.23 – 2026.01.25");
    for (const area of ["administration", "programs", "field"]) await expect(nav.locator(`a[href="/events/synthetic-winter/${area}"]`)).toHaveCount(1);
    await expect(nav.locator('a[href*="synthetic-retreat"]')).toHaveCount(0);
    if (mobile) await select.selectOption("synthetic-retreat");
    else await page.getByRole("button", { name: /2026년 PIN 잠금 합성 가을 수련회/ }).click();
    await expect(workspace).toBeVisible();
    await page.locator("summary").filter({ hasText: "전체 수련회 준비 일정" }).click();
    await expect(page.getByText(/새 수련회 기간 추가 대상:/)).toContainText("합성 가을 수련회");
    await page.getByRole("button", { name: "＋ 기간 추가" }).click();
    await expect(page.getByText("시작일", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "취소", exact: true }).click();
    await nav.getByRole("link", { name: "프로그램 준비", exact: true }).click();
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.navigation.at(-1))).toBe("/events/synthetic-retreat/programs");
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
    const proof = await (await page.request.get("/__qa__/proof.json")).json();
    expect(proof.firebaseRuntimeModules).toEqual([]);
    expect(proof.rejected).toEqual([]);
    expect(errors).toEqual([]);
    await page.goto(`/?scenario=actualVacation&state=admin&theme=${theme}&retreat=synthetic-winter`);
    await expect(page.getByRole("region", { name: "합성 겨울 수련회 업무 선택" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "수련회 업무 영역" }).getByRole("link", { name: "행정", exact: true })).toHaveAttribute("href", "/events/synthetic-winter/administration");
  });
}

test("UX 보완: 320·360px에서 수련회 선택 후 세 업무와 변경 선택기를 먼저 찾는다", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile390", "작은 너비는 Chromium 한 프로젝트에서만 검사합니다.");
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 844 });
    for (const state of ["admin", "programViewer"]) {
      await page.goto(`/?scenario=actualVacation&state=${state}&theme=light`);
      await expect(page.getByRole("navigation", { name: "수련회 업무 영역" })).toHaveCount(0);
      await page.getByRole("button", { name: /2026년 PIN 잠금 합성 가을 수련회/ }).click();
      const select = page.getByRole("combobox", { name: "선택한 수련회" });
      await expect(select).toBeVisible();
      expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectRetreatActionsInFirstView(page);
      await select.selectOption("synthetic-winter");
      await expect(page.getByRole("region", { name: "합성 겨울 수련회 업무 선택" })).toBeVisible();
      await expectRetreatActionsInFirstView(page);
      const nav = page.getByRole("navigation", { name: "수련회 업무 영역" });
      for (const area of ["administration", "programs", "field"]) await expect(nav.locator(`a[href="/events/synthetic-winter/${area}"]`)).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
      const proof = await (await page.request.get("/__qa__/proof.json")).json();
      expect(proof.firebaseRuntimeModules).toEqual([]);
      expect(proof.rejected).toEqual([]);
      await page.screenshot({ path: info.outputPath(`retreat-first-view-${width}-${state}.png`) });
    }
  }
});

test("중간 너비에서도 전역 메뉴와 인물 검색창이 겹치지 않는다", async ({ page }, info) => {
  test.skip(info.project.name !== "wide1280", "데스크톱 프로젝트에서 중간 너비를 검사합니다.");
  await page.goto("/?scenario=actualVacation&state=admin&theme=light");
  for (const { width, state } of [960, 1024, 1180, 1181, 1280].flatMap(width => ["admin", "ready"].map(state => ({ width, state })))) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(state => window.__NEW_STAFF_QA__.setAuth(state), state);
    const nav = page.getByRole("navigation", { name: "통합 사역 메뉴" });
    const search = page.getByRole("button", { name: "인물 통합검색 열기" });
    await expect(nav).toBeVisible({ timeout: 20_000 });
    await expect(search).toHaveCount(state === "admin" ? 1 : 0);
    const lastMenu = nav.getByRole("link", { name: "자료", exact: true });
    const menuBox = (await lastMenu.boundingBox())!;
    const searchBox = await search.count() ? (await search.boundingBox())! : null;
    const headerBox = (await page.locator(".global-portal-inner").boundingBox())!;
    await page.screenshot({ path: info.outputPath(`header-${width}-${state}.png`), fullPage: false });
    expect(menuBox.x + menuBox.width, `메뉴·검색 겹침 ${width}px ${state}`).toBeLessThanOrEqual(searchBox?.x ?? headerBox.x + headerBox.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});
