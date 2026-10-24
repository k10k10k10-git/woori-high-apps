import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// 이 파일은 playwright.new-staff.config.ts의 합성 loopback 환경에서만 실행한다.
// 기본 운영 E2E에 섞이면 테스트를 실행하지 않으며 실제 인증을 우회하지 않는다.
test.beforeEach(async ({ page, context, baseURL }) => {
  expect(baseURL, "합성 테스트는 loopback 전용 config가 필요합니다.").toBe("http://127.0.0.1:4179");
  await page.clock.install({ time: new Date("2026-10-05T01:00:00Z") });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "data:" || (url.hostname === "127.0.0.1" && url.port === "4179")) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

async function open(page: Page, scenario: string, state = "ready", theme = "light", options: Record<string, string> = {}) {
  const path = scenario === "actualProgram" ? "/events/synthetic-retreat/programs" : "/";
  await page.goto(`${path}?${new URLSearchParams({ scenario, state, theme, ...options })}`);
  // 최초 Vite 모듈 변환 시간을 기다린다. 업무 상호작용 제한은 config의 8초를 유지한다.
  await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

async function expectReadableMobileMenu(page: Page) {
  const nav = page.getByRole("navigation", { name: "주요 메뉴", exact: true });
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(6);
  for (const link of await links.all()) {
    await expect(link).toBeInViewport({ ratio: 1 });
    const metrics = await link.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, fontSize: parseFloat(getComputedStyle(element).fontSize), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    expect(metrics.width).toBeGreaterThanOrEqual(44);
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.fontSize).toBeGreaterThanOrEqual(12);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  }
  const restricted = nav.locator('a[href="/operations"]');
  await expect(restricted).toContainText("권한 필요");
  await expect(restricted).toHaveAttribute("data-qa-prefetch", "disabled");
  const marker = restricted.locator("[data-permission-indicator]");
  await expect(marker).toBeVisible();
  const markerBox = (await marker.boundingBox())!;
  expect(markerBox.width).toBeGreaterThanOrEqual(12);
  expect(markerBox.height).toBeGreaterThanOrEqual(12);
  await expect(nav.locator('a[href="/library"] [data-permission-indicator]')).toHaveCount(0);
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const violations = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  expect(violations, JSON.stringify(violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })), null, 2)).toEqual([]);
}

async function expectServiceIsolation(page: Page) {
  const proof = await (await page.request.get("/__qa__/proof.json")).json();
  expect(proof.synthetic).toBe(true);
  expect(proof.ready).toBe(true);
  expect(proof.firebaseRuntimeModules).toEqual([]);
  expect(proof.rejected).toEqual([]);
}

function contrastRatio(foreground: string, background: string, opacity = 1) {
  const parse = (value: string) => {
    const channels = value.match(/[\d.]+/g)?.map(Number);
    if (!channels || channels.length < 3) throw new Error(`브라우저 색상을 해석할 수 없습니다: ${value}`);
    return { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 };
  };
  const backdrop = parse(background), color = parse(foreground);
  if (backdrop.alpha !== 1) throw new Error(`투명 배경은 실제 표면 색상 확인이 필요합니다: ${background}`);
  const alpha = color.alpha * opacity;
  const composited = color.rgb.map((channel, index) => channel * alpha + backdrop.rgb[index] * (1 - alpha));
  const luminance = (channels: number[]) => {
    const linear = channels.map((channel) => { const normalized = channel / 255; return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const first = luminance(composited), second = luminance(backdrop.rgb);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

for (const theme of ["light", "dark"]) {
  test(`${theme} 실제 입력과 선택 탭은 충분한 색상 대비를 제공하고 가이드를 반복하지 않는다`, async ({ page }, info) => {
    await open(page, "actualProgram", "programEditor", theme, { workspace: "programs", program: "program-main", section: "overview" });
    const input = page.locator("#program-place");
    await expect(input).toBeVisible();
    const inputColors = await input.evaluate((element) => {
      const style = getComputedStyle(element), placeholder = getComputedStyle(element, "::placeholder");
      return { border: style.borderTopColor, background: style.backgroundColor, placeholder: placeholder.color, placeholderOpacity: Number(placeholder.opacity) };
    });
    expect(contrastRatio(inputColors.border, inputColors.background), JSON.stringify(inputColors)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(inputColors.placeholder, inputColors.background, inputColors.placeholderOpacity), JSON.stringify(inputColors)).toBeGreaterThanOrEqual(4.5);
    if ((page.viewportSize()?.width ?? 1280) <= 640) {
      const menu = page.locator(".program-mobile-section-nav select");
      await expect(menu).toBeVisible();
      const colors = await menu.evaluate((element) => { const style = getComputedStyle(element); return { text: style.color, background: style.backgroundColor, border: style.borderTopColor }; });
      expect(contrastRatio(colors.text, colors.background), JSON.stringify(colors)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.border, colors.background), JSON.stringify(colors)).toBeGreaterThanOrEqual(3);
    } else {
      const selected = page.locator("#program-tab-overview");
      const unselected = page.locator("#program-tab-posts");
      await expect(selected).toHaveAttribute("aria-selected", "true");
      const colors = await selected.evaluate((element) => { const style = getComputedStyle(element); return { text: style.color, background: style.backgroundColor }; });
      const unselectedBackground = await unselected.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(contrastRatio(colors.text, colors.background), JSON.stringify(colors)).toBeGreaterThanOrEqual(4.5);
      expect(colors.background).not.toBe(unselectedBackground);
    }
    await expect(page.locator(".program-start-guide, .program-section-hint, .program-workspace-note")).toHaveCount(0);
    const width = page.viewportSize()?.width ?? 1280;
    if (width < 768 || width > 900) {
      if (width > 900) await page.getByRole("button", { name: "사역팀", exact: true }).click();
      const currentMenu = page.locator(width < 768 ? '.portal-mobile-bottom-nav a[aria-current="page"]' : '.portal-nav-link[aria-expanded="true"]').first();
      await expect(currentMenu).toBeVisible();
      await expect.poll(() => currentMenu.evaluate((element) => getComputedStyle(element).backgroundColor.startsWith("rgb("))).toBe(true);
      const currentMenuColors = await currentMenu.evaluate((element) => { const style = getComputedStyle(element); return { text: style.color, background: style.backgroundColor }; });
      expect(contrastRatio(currentMenuColors.text, currentMenuColors.background), JSON.stringify(currentMenuColors)).toBeGreaterThanOrEqual(4.5);
      expect(currentMenuColors.background).not.toBe("rgba(0, 0, 0, 0)");
      if (width > 900) await page.keyboard.press("Escape");
    }
    await expectAccessible(page);
    await expectNoOverflow(page);
    await expectServiceIsolation(page);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`program-contrast-${theme}.png`), fullPage: true });
  });
}

async function programSection(page: Page, key: string) {
  if ((page.viewportSize()?.width ?? 1280) <= 640) await page.locator(".program-mobile-section-nav select").selectOption(key);
  else await page.locator(`#program-tab-${key}`).click();
}

async function programWorkspace(page: Page, key: string) {
  await page.getByRole("combobox", { name: "수련회 프로그램 준비 메뉴" }).selectOption(key);
}

test("실제 프로그램 총괄 화면과 유일한 선택 목록을 구분하고 두 진행 형식을 보존한다", async ({ page }, info) => {
  await open(page, "actualProgram", "programEditor");
  await expect(page.locator(".program-catalog-row")).toHaveCount(2);
  await programWorkspace(page, "overview");
  await expect(page.getByRole("heading", { name: "수련회 준비 공간", exact: true })).toBeVisible();
  await expect(page.locator(".program-catalog-row")).toHaveCount(0);
  await programWorkspace(page, "programs");
  await expect(page.getByRole("heading", { name: "프로그램 준비", exact: true })).toBeVisible();
  await expect(page.locator(".program-catalog-row")).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("actual-program-catalog.png"), fullPage: true });
  await page.getByRole("button", { name: /합성 전체 프로그램/ }).click();
  await expect(page).toHaveURL(/program=program-main/);
  await expect(page.getByRole("combobox", { name: "유형", exact: true })).toHaveValue("main");
  await page.getByRole("button", { name: "프로그램 목록", exact: true }).click();
  await page.getByRole("button", { name: /합성 조별 프로그램/ }).click();
  await expect(page).toHaveURL(/program=program-post/);
  await expect(page.getByRole("combobox", { name: "유형", exact: true })).toHaveValue("post");
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptionEvents.filter((event) => event.active && event.name === "programs").length)).toBe(1);
});

test("실제 프로그램 수동 초안은 섹션·이동 취소·재연결을 거쳐 보존되고 계정 변경 때 폐기된다", async ({ page }, info) => {
  await open(page, "actualProgram", "programEditor", "light", { workspace: "programs", program: "program-main", section: "posts" });
  const draft = "합성 작성 중 진행안 — 자동 저장하지 않습니다";
  await page.locator(".program-flow-notes > summary").click();
  await page.locator("#program-flow").fill(draft);
  await expect(page.getByText("저장하지 않은 초안", { exact: true })).toBeVisible();
  await programSection(page, "overview");
  await programSection(page, "posts");
  await expect(page.locator("#program-flow")).toHaveValue(draft);
  const leave = page.getByRole("button", { name: "프로그램 목록", exact: true });
  await leave.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "저장하지 않은 변경", exact: true });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath("actual-program-draft-cancel.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(leave).toBeFocused();
  await expect(page.locator("#program-flow")).toHaveValue(draft);
  await leave.click();
  await dialog.getByRole("button", { name: "계속 작성", exact: true }).click();
  await expect(page.locator("#program-flow")).toHaveValue(draft);
  await page.evaluate(() => window.__NEW_STAFF_QA__.fail("programs", "synthetic-retreat"));
  await expect(page.getByRole("alert")).toContainText("준비 자료의 최신 내용을 확인하지 못했습니다.");
  await expect(page.getByRole("alert")).not.toContainText("Synthetic private diagnostic path");
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("#program-flow")).toHaveValue(draft);
  await expect(page).toHaveURL(/program=program-main.*section=posts/);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("programEditor", "synthetic-staff-b"));
  await expect(page.locator("#program-flow")).toHaveValue("합성 원본 진행안");
  await expect(page.getByText("저장하지 않은 초안", { exact: true })).toHaveCount(0);
  await expectNoOverflow(page);
});

test("실제 프로그램 조회자는 비공개 회의를 구독하지 않고 일반 스탭은 전체 자료 접근이 차단된다", async ({ page }) => {
  await open(page, "actualProgram", "programViewer", "light", { workspace: "programs", program: "program-main", section: "posts" });
  await expect(page.getByRole("heading", { name: "합성 전체 프로그램", exact: true })).toBeVisible();
  await expect(page.getByText("프로그램 준비 자료", { exact: false }).first()).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).not.toContain("programMeetings");
  await expect(page.getByRole("button", { name: "회의 시작", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "초안 저장", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("ready"));
  await expect(page.getByRole("heading", { name: "프로그램 준비 접근 권한이 필요합니다.", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptionEvents.filter((event) => event.active))).toEqual([]);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
});

test("실시간 프로그램 목록이 다섯 개에서 네 개로 줄어도 검색을 해제할 수 있다", async ({ page }, info) => {
  await open(page, "actualProgram", "programEditor", "light", { workspace: "programs" });
  await page.evaluate(() => {
    const items = Array.from({ length: 5 }, (_, index) => ({ id: `live-${index + 1}`, title: index === 4 ? "찾을 프로그램" : `나머지 프로그램 ${index + 1}`, order: index + 1, kind: "main", status: "draft", createdAt: 1, updatedAt: 1 }));
    window.__NEW_STAFF_QA__.emit("programs", "synthetic-retreat", items);
  });
  await expect(page.locator(".program-catalog-row")).toHaveCount(5);
  const search = page.getByRole("textbox", { name: "프로그램 찾기", exact: true });
  await search.fill("찾을 프로그램");
  await expect(page.locator(".program-catalog-row")).toHaveCount(1);
  await page.evaluate(() => window.__NEW_STAFF_QA__.emit("programs", "synthetic-retreat", Array.from({ length: 4 }, (_, index) => ({ id: `live-${index + 1}`, title: `나머지 프로그램 ${index + 1}`, order: index + 1, kind: "main", status: "draft", createdAt: 1, updatedAt: 1 }))));
  await expect(search).toBeVisible();
  await expect(search).toHaveValue("찾을 프로그램");
  await expect(page.locator(".program-catalog-row")).toHaveCount(0);
  await expect(page.getByText("검색 결과가 없습니다", { exact: true })).toBeVisible();
  await search.fill("");
  await expect(page.locator(".program-catalog-row")).toHaveCount(4);
  await page.screenshot({ path: info.outputPath("actual-program-live-search-recovery.png"), fullPage: true });
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
});

test("실제 프로그램 회의록 링크는 기존 비공개 회의를 열고 닫은 뒤에도 프로그램 선택을 유지한다", async ({ page }) => {
  await open(page, "actualProgram", "programEditor", "light", { workspace: "programs", program: "program-main", section: "overview", meeting: "1", meetingId: "meeting-private" });
  const dialog = page.getByRole("dialog", { name: "프로그램 준비회의", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("합성 비공개 회의");
  await dialog.getByRole("button", { name: "회의 모드 닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/meeting(?:Id)?=/);
  await expect(page.getByRole("combobox", { name: "준비할 프로그램", exact: true })).toHaveValue("program-main");
  await page.getByRole("combobox", { name: "준비할 프로그램", exact: true }).selectOption("program-post");
  await expect(page.getByRole("heading", { name: "합성 조별 프로그램", exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
});

for (const theme of ["light", "dark"]) {
  test(`${theme} 홈의 인사말·우선 업무·다른 업무가 구분되고 키보드와 동작 줄이기를 지원한다`, async ({ page, browserName }, info) => {
    await open(page, "actualHome", "admin", theme);
    const hero = page.locator(".home-hero");
    const priority = page.getByRole("region", { name: "내 업무 시작", exact: true });
    const otherWork = page.getByRole("region", { name: "다른 담당 업무", exact: true });
    const surfaceColors = [];
    for (const surface of [hero, priority, otherWork.locator(":scope > div")]) {
      const colors = await surface.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, border: style.borderTopColor, borderWidth: style.borderTopWidth };
      });
      expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(colors.borderWidth).toBe("1px");
      expect(contrastRatio(colors.border, colors.background)).toBeGreaterThanOrEqual(3);
      surfaceColors.push(colors.background);
    }
    expect(surfaceColors[1]).not.toBe(surfaceColors[0]);
    const description = await priority.locator("p").evaluate((element) => ({ text: getComputedStyle(element).color, background: getComputedStyle(element.closest("section")!).backgroundColor }));
    expect(contrastRatio(description.text, description.background)).toBeGreaterThanOrEqual(4.5);
    const action = priority.getByRole("link", { name: "업무 열기" });
    const workLink = otherWork.getByRole("link").first();
    await expect(workLink.locator('svg[aria-hidden="true"]')).toHaveCount(2);
    for (const link of [action, workLink]) {
      await link.focus();
      await expect(link).toBeFocused();
      await expect(link).toHaveCSS("outline-style", "solid");
      await expect(link).toHaveCSS("outline-width", "3px");
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const link of [action, workLink]) {
      await link.focus();
      await expect(link.locator("svg").last()).toHaveCSS("transform", "none");
    }
    // macOS WebKit의 기본 링크 탐색 키는 Option+Tab이다.
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    await expect(otherWork.getByRole("link").nth(1)).toBeFocused();
    await expectAccessible(page);
    await expectNoOverflow(page);
    await expectServiceIsolation(page);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
    await hero.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`home-hierarchy-${theme}.png`), fullPage: true });
  });
}

test("실제 홈은 담당 업무 하나와 다음 일정 세 건을 먼저 보여주고 전체 달력을 접는다", async ({ page }, info) => {
  await open(page, "actualHome", "viewer");
  const ownWork = page.getByRole("region", { name: "내 업무", exact: true });
  await expect(ownWork).toContainText("학기 찬양팀 조회자");
  await expect(ownWork).not.toContainText("사역팀(미지정)");
  await expect(ownWork.getByRole("link", { name: "업무 열기" })).toHaveCount(1);
  await expect(ownWork.getByRole("link", { name: "업무 열기" })).toHaveAttribute("href", "/teams/praise");
  const upcoming = page.getByRole("region", { name: "다음 일정", exact: true });
  await expect(upcoming.locator("li")).toHaveCount(3);
  for (const day of [7, 8, 9]) await expect(upcoming).toContainText(`합성 준비 일정 ${day}`);
  await expect(upcoming).not.toContainText("합성 휴강");
  await expect(upcoming).not.toContainText("합성 준비 일정 11");
  const calendar = page.locator("details").filter({ has: page.locator("summary", { hasText: "전체 일정 보기·관리" }) });
  await expect(calendar).not.toHaveAttribute("open", "");
  await expect(page.getByRole("heading", { name: "공유 사역 캘린더" })).not.toBeVisible();
  await page.screenshot({ path: info.outputPath("actual-home-first-view.png"), fullPage: true });
  await calendar.locator("summary").click();
  await expect(page.getByRole("heading", { name: "공유 사역 캘린더" })).toBeVisible();
  await expect(calendar).toContainText("합성 준비 일정 11");
  await expect(page.getByRole("button", { name: "+ 일정 추가", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.navigation)).toEqual([]);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
});

test("팀 운영 학기 선택은 네 업무·현황을 함께 바꾸고 실시간 목록 갱신 뒤에도 유지한다", async ({ page }, info) => {
  await open(page, "team", "ready", "light", { terms: "multi" });
  const term = page.getByRole("combobox", { name: "운영 학기", exact: true });
  await expect(term).toHaveCount(1);
  await expect(term).toHaveValue("2026-2");
  for (const sid of ["2026-1", "2027-1"]) {
    await term.selectOption(sid);
    await expect(page.getByRole("region", { name: "팀 전체 현황", exact: true })).toContainText(sid === "2026-1" ? "합성 2026년 1학기" : "합성 2027년 1학기");
    for (const task of ["roster", "curriculum", "records"]) await expect(page.locator(`main a[href="/teams/praise/terms/${sid}/${task}"]`).first()).toBeVisible();
    const attendanceLinks = await page.locator('main a[href^="/teams/praise/ongoing?"]').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
    expect(attendanceLinks.some((href) => { const query = new URL(href).searchParams; return query.get("semester") === sid && query.get("tab") === "attendance"; })).toBe(true);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptionEvents.filter((event) => event.active && ["applications", "sessions"].includes(event.name)).map((event) => ({ name: event.name, key: event.key })).sort((a, b) => a.name.localeCompare(b.name)))).toEqual([{ name: "applications", key: sid }, { name: "sessions", key: sid }]);
  }
  await page.evaluate(() => window.__NEW_STAFF_QA__.emit("semesters", "", [
    { id: "2026-1", meta: { title: "합성 2026년 1학기 갱신", startDate: "2026-01-01", endDate: "2026-06-30", createdAt: "2026-01-01" } },
    { id: "2026-2", meta: { title: "합성 2026년 2학기 갱신", startDate: "2026-08-29", endDate: "2026-11-21", createdAt: "2026-08-01" } },
    { id: "2027-1", meta: { title: "합성 2027년 1학기 갱신", startDate: "2027-01-01", endDate: "2027-06-30", createdAt: "2027-01-01" } },
  ]));
  await expect(term).toHaveValue("2027-1");
  await expect(page.getByRole("region", { name: "팀 전체 현황", exact: true })).toContainText("합성 2027년 1학기 갱신");
  await page.screenshot({ path: info.outputPath("actual-team-selected-term.png"), fullPage: true });
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("ready", "synthetic-staff-b"));
  await expect(term).toHaveValue("2026-2");
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
});

for (const theme of ["light", "dark"]) {
  test(`${theme} 팀 첫 화면에서 주간 업무와 명단·출석을 스크롤 없이 찾는다`, async ({ page }, info) => {
    const viewport = page.viewportSize()!;
    const mobile = viewport.width < 768;
    if (mobile) await page.setViewportSize({ width: viewport.width, height: 605 });
    for (const state of mobile ? ["ready", "viewer"] : ["ready"]) {
      await page.goto(`/teams/praise?${new URLSearchParams({ scenario: "team", state, theme })}`);
      const work = page.getByRole("region", { name: "주간 업무와 학기 기록", exact: true });
      const weekly = work.locator('a[href="/teams/praise/ongoing?semester=2026-2"]');
      const roster = work.getByRole("link", { name: "선택 학기 명단·연락처 열기", exact: true });
      const attendance = work.getByRole("link", { name: "선택 학기 출석 열기", exact: true });
      for (const action of [weekly, roster, attendance]) {
        await expect(action).toBeInViewport({ ratio: 1 });
        const position = await action.evaluate((element) => {
          const fixedMenu = document.querySelector(".portal-mobile-bottom-nav");
          const bottom = fixedMenu && getComputedStyle(fixedMenu).display !== "none" ? fixedMenu.getBoundingClientRect().top : innerHeight;
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, availableBottom: bottom, scrollY };
        });
        expect(position.scrollY).toBe(0);
        expect(position.top).toBeGreaterThanOrEqual(0);
        expect(position.bottom, JSON.stringify({ state, ...position })).toBeLessThanOrEqual(position.availableBottom);
      }
      const overview = page.getByRole("region", { name: "팀 전체 현황", exact: true });
      expect(await work.evaluate((element, other) => !!(element.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await overview.elementHandle())).toBe(true);
      await page.screenshot({ path: info.outputPath(`team-work-first-screen-${state}-${theme}.png`) });
      await expectNoOverflow(page);
      await expectServiceIsolation(page);
      expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
    }
  });
}

test("실제 홈은 인증 확인 중과 권한 오류 때 구독·자동 이동을 막고 재시도로 복구한다", async ({ page }) => {
  await open(page, "actualHome", "loading");
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.navigation)).toEqual([]);
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("roleErrorAssigned"));
  await expect(page.getByRole("heading", { name: "담당 사역을 확인하지 못했습니다" })).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.navigation)).toEqual([]);
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("region", { name: "내 업무", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.retries)).toBe(1);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.navigation)).toEqual(["/teams/praise"]);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual(expect.arrayContaining(["retreats", "semesters", "milestones", "sessions", "periods"]));
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("unapproved", "synthetic-staff-b"));
  await expect(page.getByRole("heading", { name: "접근 승인이 필요합니다" })).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptionEvents.filter((event) => event.active))).toEqual([]);
});

test("실제 홈은 계정 교체 뒤 이전 일정 응답을 무시하고 일정 편집 취소는 저장하지 않는다", async ({ page }) => {
  await open(page, "actualHome", "admin");
  await expect(page.getByRole("region", { name: "다음 일정", exact: true }).locator("li")).toHaveCount(3);
  const previous = await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptionEvents.find((event) => event.name === "milestones")!.id);
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("admin", "synthetic-staff-b"));
  await page.evaluate((id) => window.__NEW_STAFF_QA__.deliver(id, [{ id: "old", title: "이전 계정의 늦은 응답", targetDate: "2026-10-06", done: false }]), previous);
  await expect(page.getByText("이전 계정의 늦은 응답", { exact: false })).toHaveCount(0);
  await page.locator("summary", { hasText: "전체 일정 보기·관리" }).click();
  const add = page.getByRole("button", { name: "+ 일정 추가", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "공유 일정 추가" });
  await dialog.getByRole("textbox", { name: "일정 내용" }).fill("저장하지 않을 합성 일정");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  await dialog.getByRole("textbox", { name: "일정 내용" }).fill("이전 관리 계정의 미저장 초안");
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("ready", "synthetic-staff-c"));
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ 일정 추가", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
});

test("실제 마이페이지의 관리 세 탭은 일반 스탭에게 안내만 제공하고 제한 조회를 시작하지 않는다", async ({ page }) => {
  await open(page, "actualMyPage", "ready", "light", { tab: "team" });
  await page.getByRole("button", { name: "마이페이지 열기" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "마이페이지", exact: true });
  await expect(dialog.getByRole("tab")).toHaveCount(6);
  for (const [label, area] of [["팀원 관리", "팀원 관리"], ["요청사항", "요청 관리"], ["활동 로그", "활동 로그"]]) {
    await dialog.getByRole("tab", { name: new RegExp(`^${label}`) }).click();
    await expect(dialog.getByRole("tabpanel")).toContainText(`${area} 접근 권한이 필요합니다.`);
    await expect(dialog.getByRole("tabpanel")).toContainText("synthetic-staff-a@example.invalid");
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  }
  await dialog.getByRole("tab", { name: /^팀원 관리/ }).focus();
  await page.keyboard.press("End");
  await expect(dialog.getByRole("tab", { name: /^활동 로그/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "마이페이지 열기" })).toBeFocused();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
});

test("실제 마이페이지 관리 동선은 운영센터 한 곳으로 연결되고 같은 주소에서도 닫힌다", async ({ page }, info) => {
  const choices = [["팀원 관리", "team", "운영센터에서 계정·권한 열기", "/operations/accounts"], ["요청사항", "requests", "운영센터에서 요청 관리 열기", "/operations/requests"], ["활동 로그", "activity", "운영센터에서 활동 로그 열기", "/operations/activity"]];
  for (const [label, tab, action, href] of choices) {
    await page.goto(`${href}?scenario=actualMyPage&state=admin&tab=${tab}`);
    await page.getByRole("button", { name: "마이페이지 열기" }).click();
    const dialog = page.getByRole("dialog", { name: "마이페이지", exact: true });
    await expect(dialog.getByRole("tab", { name: label, exact: true })).toHaveAttribute("aria-selected", "true");
    const shortcut = dialog.getByRole("link", { name: action, exact: true });
    await expect(shortcut).toHaveAttribute("href", href);
    await page.screenshot({ path: info.outputPath(`actual-mypage-${tab}.png`), fullPage: true });
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
    await shortcut.click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.closeCalls)).toBe(1);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.navigation)).toEqual([href]);
  }
  await expectNoOverflow(page);
});

test("실제 마이페이지 운영센터 링크를 새 탭으로 열면 현재 작업 창을 유지한다", async ({ page, context, browser, browserName }) => {
  await open(page, "actualMyPage", "admin", "light", { tab: "team" });
  await page.getByRole("button", { name: "마이페이지 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "마이페이지", exact: true });
  const originalUrl = page.url();
  const destination = new URL("/operations/accounts", originalUrl).href;
  await expect(page.locator("iframe")).toHaveCount(0);
  const nativeClicks: unknown[] = [];
  const middle = browserName === "chromium";
  const cdp = middle ? await browser.newBrowserCDPSession() : null;
  const previousTargets = cdp ? (await cdp.send("Target.getTargets")).targetInfos : [];
  const previousTargetIds = new Set(previousTargets.map((target) => target.targetId));
  const contextId = previousTargets.find((target) => target.type === "page" && target.url === originalUrl)?.browserContextId;
  if (cdp) expect(contextId).toBeTruthy();
  let destinationTargetId: string | undefined;
  page.on("console", (message) => {
    if (message.text().startsWith("QA_NATIVE_SHORTCUT ")) nativeClicks.push(JSON.parse(message.text().slice("QA_NATIVE_SHORTCUT ".length)));
  });
  // 실제 trusted 입력을 읽기만 한다. event flag와 source handler를 수정하지 않는다.
  await page.evaluate((isMiddle) => document.addEventListener(isMiddle ? "auxclick" : "click", (event) => {
    const href = event.target instanceof Element ? event.target.closest("a[href]")?.getAttribute("href") : null;
    if (href === "/operations/accounts") console.debug("QA_NATIVE_SHORTCUT " + JSON.stringify({ trusted: event.isTrusted, button: event.button, meta: event.metaKey, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, prevented: event.defaultPrevented }));
  }, { capture: true, passive: true }), middle);
  // 새 탭의 native 입력은 Chromium에서 Shift+가운데 버튼, 모바일 WebKit에서 Ctrl/Meta+Shift를 사용한다.
  // 단독 Ctrl/Meta의 source handler 계약은 MyPageModal.render.test.tsx에서 별도로 검사한다.
  const responsePromise = cdp ? context.waitForEvent("response", (response) => {
    const request = response.request();
    return response.url() === destination && request.method() === "GET"
      && request.resourceType() === "document" && request.isNavigationRequest();
  }) : null;
  const popupPromise = cdp ? null : context.waitForEvent("page");
  try {
    await dialog.getByRole("link", { name: "운영센터에서 계정·권한 열기", exact: true }).click(middle ? { button: "middle", modifiers: ["Shift"] } : { modifiers: ["ControlOrMeta", "Shift"] });
    if (cdp) {
      const response = await responsePromise!;
      expect(response.status()).toBe(200);
      expect(await response.finished()).toBeNull();
      // Page 초기화 대기에 의존하지 않고 같은 context의 새 최상위 문서를 필수로 확인한다.
      await expect.poll(async () => {
        const targets = (await cdp.send("Target.getTargets")).targetInfos;
        destinationTargetId = targets.find((target) => target.type === "page" && target.subtype !== "prerender"
          && target.browserContextId === contextId && !previousTargetIds.has(target.targetId) && target.url === destination)?.targetId;
        return destinationTargetId;
      }).toBeTruthy();
    } else {
      await expect(await popupPromise!).toHaveURL(destination);
    }
    await expect(page).toHaveURL(originalUrl);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.closeCalls)).toBe(0);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.navigation)).toEqual([]);
    expect(nativeClicks).toEqual([{ trusted: true, button: middle ? 1 : 0, meta: !middle && process.platform === "darwin", ctrl: !middle && process.platform !== "darwin", shift: true, alt: false, prevented: false }]);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  } finally {
    if (cdp) {
      try { if (destinationTargetId) await cdp.send("Target.closeTarget", { targetId: destinationTargetId }); }
      finally { await cdp.detach(); }
    }
    await Promise.all(context.pages().filter((opened) => opened !== page).map((opened) => opened.close()));
  }
});

test("실제 마이페이지 개인 요청은 계정 변경 후 이전 응답을 표시하지 않는다", async ({ page }) => {
  await open(page, "actualMyPage", "ready", "light", { tab: "myRequests" });
  await page.getByRole("button", { name: "마이페이지 열기" }).click();
  await expect(page.getByRole("dialog", { name: "마이페이지", exact: true }).getByRole("heading", { name: "내 요청", exact: true })).toHaveCount(2);
  const previous = await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptionEvents.find((event) => event.name === "myRequests")!.id);
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("ready", "synthetic-staff-b"));
  await expect.poll(() => page.evaluate(() => window.__NEW_STAFF_QA__.subscriptionEvents.filter((event) => event.active && event.name === "myRequests").map((event) => event.key))).toEqual(["synthetic-staff-b"]);
  await page.evaluate((id) => window.__NEW_STAFF_QA__.deliver(id, [{ id: "old-request", title: "이전 계정의 비공개 요청", kind: "suggestion", status: "pending", createdAt: 1, updatedAt: 1 }]), previous);
  await expect(page.getByText("이전 계정의 비공개 요청", { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
});

for (const theme of ["light", "dark"]) {
  const cases: Array<[string, string, Record<string, string>]> = [["actualHome", "viewer", {}], ["actualMyPage", "admin", { tab: "team" }], ["actualProgram", "programEditor", { workspace: "programs" }]];
  for (const [scenario, state, options] of cases) {
    test(`${theme} ${scenario} 실제 개편 화면의 접근성·넘침·서비스 격리를 검사한다`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await open(page, scenario, state, theme, options);
      if (scenario === "actualMyPage") await page.getByRole("button", { name: "마이페이지 열기" }).click();
      if (scenario === "actualProgram") await expect(page.getByRole("heading", { name: "프로그램 준비", exact: true })).toBeVisible();
      if (scenario === "actualHome") await expect(page.getByRole("region", { name: "다음 일정", exact: true }).locator("li")).toHaveCount(3);
      await page.screenshot({ path: info.outputPath(`${scenario}-${theme}.png`), fullPage: true });
      await expectNoOverflow(page);
      await expectAccessible(page);
      await expectServiceIsolation(page);
      expect(errors).toEqual([]);
    });
  }
}

test("첫 방문·재방문·계정 변경에도 팀 업무를 안내 없이 바로 보여준다", async ({ page }) => {
  await open(page, "team");
  const title = page.getByRole("heading", { name: "찬양팀", exact: true });
  await expect(title).toBeVisible();
  await expect(page.locator("#team-first-guide")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /안내 닫기|사용 안내 열기/ })).toHaveCount(0);
  await page.reload();
  await expect(title).toBeVisible();
  await expect(page.locator("#team-first-guide")).toHaveCount(0);
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("ready", "synthetic-staff-b"));
  await expect(title).toBeVisible();
  await expect(page.getByRole("navigation", { name: "선택 학기 업무" }).getByRole("link")).toHaveCount(4);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
});

test("팀 전체 현황에서 선택한 학기 업무로 바로 연결한다", async ({ page }) => {
  await open(page, "team");
  await expect(page.getByRole("heading", { name: "팀 전체 현황" })).toBeVisible();
  await expect(page.getByRole("region", { name: "팀 전체 현황" })).toContainText("2명");
  await expect(page.getByRole("region", { name: "팀 전체 현황" })).toContainText("1명");
  await expect(page.getByRole("region", { name: "팀 전체 현황" })).toContainText("2026-10-10");
  await expect(page.getByRole("region", { name: "팀 전체 현황" })).not.toContainText("합성 휴강");
  await expect(page.getByRole("navigation", { name: "선택 학기 업무" }).getByRole("link", { name: "선택 학기 명단·연락처 열기", exact: true })).toHaveAttribute("href", "/teams/praise/terms/2026-2/roster");
  await expect(page.getByRole("link", { name: /이번.*모임/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "처음이라면 사용 안내로 이동" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "사이트 사용법 보기" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "학기 개요 보기" })).toHaveCount(0);
  await expectNoOverflow(page);
});

test("브라우저 저장이 막혀도 팀 현황과 업무를 바로 이용한다", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Synthetic blocked storage", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Synthetic blocked storage", "SecurityError"); };
  });
  await open(page, "team");
  await expect(page.getByRole("heading", { name: "팀 전체 현황" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "선택 학기 업무" }).getByRole("link")).toHaveCount(4);
  await expect(page.locator("#team-first-guide")).toHaveCount(0);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
});

test("홈의 업무 링크와 팀 화면을 사용 안내 없이 바로 이용한다", async ({ page }) => {
  await open(page, "homeGuide");
  await expect(page.locator("details")).toHaveCount(0);
  const entry = page.getByRole("link", { name: "업무 열기", exact: true });
  await expect(entry).toHaveAttribute("href", "/teams/praise");
  await entry.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/teams\/praise$/);
  await expect(page.getByRole("heading", { name: "팀 전체 현황" })).toBeVisible();
  await expect(page.locator("#team-first-guide")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "팀 전체 현황" })).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
});

test("조회자는 반복 가이드 대신 조회 권한 상태를 확인한다", async ({ page }) => {
  await open(page, "homeGuide", "viewer");
  await expect(page.locator("details")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "내 업무 시작" })).toContainText("팀 기록 조회 전용");
  await open(page, "team", "viewer");
  await expect(page.getByRole("region", { name: "주간 업무와 학기 기록" })).toContainText("조회");
  await expect(page.getByRole("region", { name: "주간 업무와 학기 기록" })).not.toContainText("주간·주일 입력");
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
});

test("권한·연결·출결 도움말로 바로 이동하면 해당 답변이 자동 펼쳐진다", async ({ page }) => {
  for (const anchor of ["access", "connection", "attendance"]) {
    await page.goto(`/library/help#${anchor}`);
    const answer = page.locator(`details#${anchor}`);
    await expect(answer).toHaveAttribute("open", "");
    await expect(answer.locator("p")).toBeVisible();
  }
  await expectNoOverflow(page);
});

test("권한 조회 실패는 승인 거절과 구분되고 재시도로 복구한다", async ({ page }) => {
  await open(page, "team", "roleError");
  await expect(page.getByRole("alert")).toContainText(/확인하지 못|불러오지 못/);
  await expect(page.getByText("계정 승인은 완료됐지만", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "접속 문제 도움말" })).toHaveAttribute("href", "/library/help#connection");
  await page.getByRole("button", { name: /다시/ }).click();
  await expect(page.getByRole("heading", { name: "찬양팀", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.retries)).toBe(1);
  await expectNoOverflow(page);
});

test("도움말을 확인한 뒤 이전 팀 업무 화면으로 돌아갈 수 있다", async ({ page }) => {
  await open(page, "team");
  await page.goto("/library/help");
  await expect(page).toHaveURL(/\/library\/help$/);
  await expect(page.getByRole("heading", { name: "사이트 사용법", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "이전 화면으로" }).click();
  await expect(page).toHaveURL(/scenario=team/);
  await expect(page.getByRole("heading", { name: "찬양팀", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
  await expectNoOverflow(page);
});

test("일반 스탭도 전체 상단 메뉴를 보고 모바일 메뉴를 키보드로 닫을 수 있다", async ({ page }, info) => {
  await open(page, "header");
  if ((page.viewportSize()?.width ?? 1280) <= 900) {
    if ((page.viewportSize()?.width ?? 1280) < 768) await expectReadableMobileMenu(page);
    const trigger = page.getByRole("button", { name: "사이트 메뉴 열기" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "사이트 메뉴" });
    await expect(dialog).toBeVisible();
    const myPage = dialog.getByRole("button", { name: "마이페이지", exact: true });
    await expect(myPage).toBeInViewport({ ratio: 1 });
    expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
    const nav = dialog.getByRole("navigation", { name: "모바일 통합 사역 메뉴" });
    await expect(nav.getByRole("link")).toHaveCount(9);
    for (const [label, href] of [["사역팀", "/teams"], ["신앙훈련", "/training"], ["수련회", "/events"], ["회의록", "/meetings"], ["운영센터", "/operations"], ["자료", "/library"]]) {
      await expect(nav.locator(`a[href="${href}"]`)).toContainText(label);
    }
    await expect(dialog.getByRole("navigation", { name: "모바일 팀 메뉴" }).getByRole("link")).toHaveCount(6);
    await expect(nav.locator('a[href="/operations"]')).toHaveAttribute("data-qa-prefetch", "disabled");
    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toBeVisible();
    await page.screenshot({ path: info.outputPath("navigation-sheet.png") });
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
    await page.keyboard.press("Enter");
    await myPage.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    const account = page.getByRole("dialog", { name: "마이페이지", exact: true });
    await expect(account).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(account).toHaveCount(0);
    await expect(trigger).toBeFocused();
  } else {
    const nav = page.getByRole("navigation", { name: "통합 사역 메뉴" });
    for (const href of ["/training", "/events", "/meetings", "/operations", "/library"]) await expect(nav.locator(`a[href="${href}"]`)).toBeVisible();
    await expect(nav.locator('a[href="/operations"]')).toHaveAttribute("data-qa-prefetch", "disabled");
    await page.screenshot({ path: info.outputPath("navigation-desktop.png") });
    await expectAccessible(page);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  }
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectServiceIsolation(page);
  await expectNoOverflow(page);
});

test("일반 스탭에게 전체 팀과 운영센터의 모든 업무 메뉴를 표시한다", async ({ page }) => {
  await open(page, "teams");
  await expect(page.getByRole("region", { name: "전체 팀 목록" }).getByRole("link")).toHaveCount(6);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  await open(page, "operations");
  for (const href of ["/operations/semesters", "/operations/accounts", "/operations/requests", "/operations/activity"]) await expect(page.locator(`main a[href="${href}"]`)).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  await expectNoOverflow(page);
});

test("보이는 타팀 메뉴를 열어도 실제 팀 화면과 제한 데이터 구독은 차단된다", async ({ page }) => {
  await open(page, "teams");
  await page.getByRole("region", { name: "전체 팀 목록" }).locator('a[href="/teams/media"]').click();
  await expect(page).toHaveURL(/\/teams\/media$/);
  await expect(page.getByRole("heading", { name: /권한|접근|연결/ }).first()).toBeVisible();
  await expect(page.getByText("synthetic-staff-a@example.invalid", { exact: false }).first()).toBeVisible();
  await expect(page.locator('main a[href="/library/help#access"]')).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
  await expectNoOverflow(page);
});

test("권한 확인 중이거나 조회 오류가 있으면 이전 팀 권한이 있어도 구독하지 않는다", async ({ page }) => {
  await open(page, "team", "loading");
  await expect(page.getByRole("status").first()).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  await open(page, "team", "roleErrorAssigned");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  await page.getByRole("button", { name: /다시/ }).click();
  await expect(page.getByRole("heading", { name: "팀 전체 현황" })).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toContain("applications");
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.retries)).toBe(1);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
});

test("실제 운영 gate는 거부·로딩·권한 오류에서 제한 자녀를 마운트하지 않는다", async ({ page }) => {
  for (const state of ["ready", "loading", "roleErrorAssigned"]) {
    await open(page, "operationsGateProbe", state);
    if (state === "loading") await expect(page.getByRole("status").first()).toBeVisible();
    else if (state === "roleErrorAssigned") await expect(page.getByRole("alert")).toBeVisible();
    else await expect(page.getByRole("heading", { name: /권한|접근/ }).first()).toBeVisible();
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.childMounts)).toBe(0);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  }
});

test("수련회 메뉴는 모두 보이지만 권한 없는 목적지는 미리 요청하지 않는다", async ({ page }) => {
  await open(page, "retreatNav");
  const nav = page.getByRole("navigation", { name: "수련회 업무 영역" });
  await expect(nav.getByRole("link")).toHaveCount(3);
  await expect(nav.getByRole("link", { name: "현장 업무(이가드) 권한 필요", exact: true })).toBeInViewport({ ratio: 1 });
  for (const area of ["administration", "programs", "field"]) {
    const link = nav.locator(`a[href="/events/synthetic-retreat/${area}"]`);
    await expect(link).toHaveAttribute("data-qa-prefetch", "disabled");
    await expect(link).toContainText("권한 필요");
    await link.focus();
    await link.hover();
  }
  await expectNoOverflow(page);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.prefetches)).toEqual([]);
  await nav.locator('a[href="/events/synthetic-retreat/administration"]').click();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.navigation)).toContain("/events/synthetic-retreat/administration");
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
});

test("보완 검증: 다크 메뉴의 접근성과 데스크톱 팀 메뉴 키보드 복귀", async ({ page }, info) => {
  await open(page, "header", "ready", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  if ((page.viewportSize()?.width ?? 1280) <= 900) {
    const trigger = page.getByRole("button", { name: "사이트 메뉴 열기" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "사이트 메뉴" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("navigation", { name: "모바일 팀 메뉴" }).getByRole("link")).toHaveCount(6);
    await page.screenshot({ path: info.outputPath("navigation-dark.png") });
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  } else {
    const trigger = page.getByRole("navigation", { name: "통합 사역 메뉴" }).getByRole("button", { name: "사역팀", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const links = page.locator('.portal-dropdown-panel a[href^="/teams/"]');
    await expect(links).toHaveCount(6);
    await page.screenshot({ path: info.outputPath("navigation-dark.png") });
    await expectAccessible(page);
    await page.keyboard.press("Tab");
    await expect(page.locator('.portal-dropdown-panel a[href="/teams"]')).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(links.first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(links).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
  await expectNoOverflow(page);
});

test("보완 검증: 운영 메뉴와 실제 권한 거부 화면의 light·dark 품질", async ({ page }, info) => {
  for (const theme of ["light", "dark"]) {
    await open(page, "operations", "ready", theme);
    await expect(page.getByRole("heading", { name: "운영센터", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`operations-${theme}.png`), fullPage: true });
    await expectNoOverflow(page);
    await expectAccessible(page);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
    await open(page, "operationsGateProbe", "ready", theme);
    await expect(page.getByRole("heading", { name: "운영센터 접근 권한이 필요합니다." })).toBeVisible();
    await expect(page.getByText("synthetic-staff-a@example.invalid", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`operations-denied-${theme}.png`), fullPage: true });
    await expectNoOverflow(page);
    await expectAccessible(page);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.childMounts)).toBe(0);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  }
});

test("보완 검증: 수련회 밝은 배경 메뉴의 light·dark 접근성과 줄바꿈", async ({ page }, info) => {
  for (const theme of ["light", "dark"]) {
    await open(page, "retreatNavSurface", "ready", theme);
    const nav = page.getByRole("navigation", { name: "수련회 업무 영역" });
    await expect(nav.getByRole("link")).toHaveCount(3);
    for (const link of await nav.getByRole("link").all()) {
      await expect(link).toHaveAttribute("data-qa-prefetch", "disabled");
      await expect(link).toContainText("권한 필요");
      await link.focus();
      await link.hover();
    }
    await page.screenshot({ path: info.outputPath(`retreat-navigation-${theme}.png`) });
    await expectNoOverflow(page);
    await expectAccessible(page);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.prefetches)).toEqual([]);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  }
});

test("승인 전 계정과 팀 미배정 계정에 다른 안내와 해결 경로를 제공한다", async ({ page }) => {
  await open(page, "teams", "unapproved");
  await expect(page.getByText(/승인|권한/, { exact: false }).first()).toBeVisible();
  await expect(page.getByText("계정 승인은 완료됐지만", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /문의|문제 제보/ }).first()).toBeVisible();
  await open(page, "teams", "unassigned");
  await expect(page.getByText(/담당 팀.*연결|담당 팀.*지정/, { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /문의|문제 제보/ }).first()).toBeVisible();
  await expectNoOverflow(page);

  await open(page, "actualHome", "unassigned");
  const connection = page.getByRole("region", { name: "담당 팀 연결 안내", exact: true });
  await expect(connection.getByRole("heading", { name: "담당 팀 연결이 필요합니다", exact: true })).toBeVisible();
  await expect(connection).toContainText("synthetic-staff-a@example.invalid");
  await expect(connection.getByRole("link", { name: "팀 연결 문의하기", exact: true })).toHaveAttribute("href", "/help/feedback");
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.navigation)).toEqual([]);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
  await open(page, "actualHome", "unapproved");
  await expect(page.getByRole("heading", { name: "접근 승인이 필요합니다", exact: true })).toBeVisible();
  await expect(connection).toHaveCount(0);
  for (const state of ["ready", "viewer"]) {
    await open(page, "actualHome", state);
    await expect(page.getByRole("region", { name: "내 업무 시작", exact: true })).toBeVisible();
    await expect(connection).toHaveCount(0);
  }
  await expectServiceIsolation(page);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
});

test("사용법 검색·업무 필터·검색 초기화·문의 링크가 동작한다", async ({ page }) => {
  await open(page, "help");
  const search = page.getByRole("searchbox", { name: "사용법 검색" });
  await search.fill("출결 저장");
  await expect(page.getByText(/선택하면 바로 저장|선택하면.*저장|선택하면 즉시 저장/, { exact: false }).first()).toBeVisible();
  await expect(page.locator("details[open]")).not.toHaveCount(0);
  await page.getByRole("combobox", { name: "업무 종류" }).selectOption("접속·권한");
  await expect(page.locator("details#save")).toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "검색 초기화" })).toHaveCount(0);
  await search.fill("없는사용법XYZ");
  await expect(page.getByText("검색 결과가 없습니다.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "검색 초기화" })).toBeVisible();
  await page.getByRole("button", { name: "검색 초기화" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "업무 종류" })).toHaveValue("전체");
  await expect(page.getByRole("link", { name: /사용법 문의·문제 제보/ })).toHaveAttribute("href", "/help/feedback");
  await expectNoOverflow(page);
});

for (const [query, answer] of [["출석 삭제", "attendance"], ["권한 오류", "connection"], ["로그인 오류", "connection"]]) {
  test(`일상적인 표현 '${query}'로도 필요한 사용법을 찾는다`, async ({ page }) => {
    await open(page, "help");
    await page.getByRole("searchbox", { name: "사용법 검색" }).fill(query);
    await expect(page.locator(`details#${answer}`)).toHaveAttribute("open", "");
    await expect(page.locator(`details#${answer} p`)).toBeVisible();
    await expect(page.getByRole("button", { name: "검색 초기화" })).toHaveCount(0);
  });
}

test("준비 중인 팀의 주요 업무는 사용 가능한 학기 기록으로 연결된다", async ({ page }) => {
  await page.goto("/?scenario=team&team=media");
  await expect(page.getByRole("heading", { name: "미디어팀", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "팀 전체 현황", exact: true })).toContainText("현재 학기 · 합성 2026년 2학기");
  await expect(page.getByRole("combobox", { name: "운영 학기", exact: true })).toHaveValue("2026-2");
  const termActions = page.getByRole("navigation", { name: "선택 학기 업무", exact: true });
  await expect(termActions.getByRole("link")).toHaveCount(4);
  for (const [label, section] of [["명단·연락처", "roster"], ["출석", "attendance"], ["커리큘럼", "curriculum"], ["자료·기록", "records"]]) {
    const link = termActions.getByRole("link", { name: `선택 학기 ${label} 열기`, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `/teams/media/terms/2026-2/${section}`);
  }
  await expect(page.locator('a[href^="/teams/media/ongoing"]')).toHaveCount(0);
  const work = page.getByRole("region", { name: "주간 업무와 학기 기록", exact: true });
  await expect(work.getByRole("heading", { name: "주간·주일 운영 준비 중", exact: true })).toBeVisible();
  const plannedCard = work.locator(".team-action-card").filter({ has: page.getByRole("heading", { name: "주간·주일 운영 준비 중", exact: true }) });
  expect(await termActions.evaluate((element, other) => !!(element.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await plannedCard.elementHandle())).toBe(true);
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    const actionsBox = (await termActions.boundingBox())!;
    expect(actionsBox.y + actionsBox.height).toBeLessThanOrEqual((await plannedCard.boundingBox())!.y + 1);
  }
  await expect(work.getByRole("link", { name: "팀 기능 문의하기", exact: true })).toHaveAttribute("href", "/help/feedback");
  const back = page.locator('.team-workspace-title a[href="/teams"]');
  const backBox = (await back.boundingBox())!;
  expect(backBox.width).toBeGreaterThanOrEqual(44);
  expect(backBox.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("#team-first-guide")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /안내 닫기|사용 안내 열기/ })).toHaveCount(0);
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
});

test("UX 보완: 320·360px에서도 홈 안내·메뉴·팀 복귀·검색 설명을 읽고 누른다", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile390", "작은 너비는 Chromium 한 프로젝트에서만 검사합니다.");
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await open(page, "actualHome", "unassigned");
    const connection = page.getByRole("region", { name: "담당 팀 연결 안내", exact: true });
    await expect(connection.getByRole("link", { name: "팀 연결 문의하기", exact: true })).toBeVisible();
    await expectReadableMobileMenu(page);
    // 문서 폭만으로는 overflow:hidden 안의 글자 잘림을 발견할 수 없다.
    const clippedText = await page.locator('.home-hero .page-title, [aria-label="담당 팀 연결 안내"] h2, [aria-label="담당 팀 연결 안내"] p, [aria-label="담당 팀 연결 안내"] span').evaluateAll((elements) => elements.flatMap((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const box = element.getBoundingClientRect();
      return [...range.getClientRects()].filter(rect => rect.left < box.left - 1 || rect.right > box.right + 1).map(() => element.textContent);
    }));
    expect(clippedText).toEqual([]);
    await expectNoOverflow(page);
    await page.screenshot({ path: info.outputPath(`unassigned-${width}.png`) });

    await page.goto("/teams/media?scenario=team&team=media");
    const back = page.locator('.team-workspace-title a[href="/teams"]');
    await expect(back).toBeVisible();
    const backBox = (await back.boundingBox())!;
    expect(backBox.width).toBeGreaterThanOrEqual(44);
    expect(backBox.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("navigation", { name: "선택 학기 업무", exact: true }).getByRole("link")).toHaveCount(4);
    await expectNoOverflow(page);

    await open(page, "actualAccounts", "admin");
    await page.getByRole("button", { name: "인물 통합검색 열기" }).click();
    const dialog = page.getByRole("dialog", { name: "인물 통합검색", exact: true });
    const criteria = dialog.locator("summary").filter({ hasText: "기록 연결 기준" });
    await expect(criteria).toBeVisible();
    expect((await criteria.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expectNoOverflow(page);
    await expectServiceIsolation(page);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  }
});

for (const [term, label] of [["past", "지난 학기"], ["upcoming", "예정 학기"]]) {
  test(`${label}만 연결돼 있을 때 현재 업무로 오해하게 안내하지 않는다`, async ({ page }) => {
    await page.goto(`/?scenario=team&term=${term}`);
    await expect(page.getByRole("heading", { name: "팀 전체 현황" })).toBeVisible();
    const overview = page.getByRole("region", { name: "팀 전체 현황", exact: true });
    await expect(overview).toContainText(`${label} · 합성 2026년 2학기`);
    const selectedTerm = page.getByRole("combobox", { name: "운영 학기", exact: true });
    await expect(selectedTerm).toHaveValue("2026-2");
    await expect(selectedTerm.locator('option[value="2026-2"]')).toHaveText(`합성 2026년 2학기 · ${label}`);
    const work = page.getByRole("region", { name: "주간 업무와 학기 기록" });
    await expect(work).toContainText(label);
    await expect(work).not.toContainText("이번 주");
    await expect(work).not.toContainText("이번 학기");
    const weeklyTitle = term === "past" ? "지난 학기 주간·주일 기록" : "예정 학기 업무 준비";
    await expect(work.getByRole("heading", { name: weeklyTitle, exact: true })).toBeVisible();
    await expect(work.locator('a[href="/teams/praise/ongoing?semester=2026-2"]')).toBeVisible();
    const termActions = work.getByRole("navigation", { name: "선택 학기 업무", exact: true });
    await expect(termActions.getByRole("link")).toHaveCount(4);
    for (const [name, section] of [["명단·연락처", "roster"], ["커리큘럼", "curriculum"], ["자료·기록", "records"]]) {
      const link = termActions.getByRole("link", { name: `선택 학기 ${name} 열기`, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `/teams/praise/terms/2026-2/${section}`);
    }
    await expect(termActions.getByRole("link", { name: "선택 학기 출석 열기", exact: true })).toHaveAttribute("href", "/teams/praise/ongoing?semester=2026-2&tab=attendance");
    await expect(page.locator("#team-first-guide")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /안내 닫기|사용 안내 열기/ })).toHaveCount(0);
    await expectNoOverflow(page);
    await expectServiceIsolation(page);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  });
}

test("로그인 실패는 사람에게 필요한 해결 방법을 표시하고 다시 시도할 수 있다", async ({ page }) => {
  await open(page, "teams", "loginError");
  await page.getByRole("button", { name: "Google로 로그인" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("사이트 주소를 담당자에게 알려 주세요.");
  await expect(alert).not.toContainText(/Firebase|Authentication|Settings|Authorized domains|Synthetic|auth\//);
  await expect(alert.getByRole("link", { name: "로그인 문제 해결 방법" })).toHaveAttribute("href", "/library/help#connection");
  await page.getByRole("button", { name: "Google로 로그인" }).click();
  await expect(page.getByRole("link", { name: /찬양팀/ })).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.signInCalls)).toBe(2);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
  await expectNoOverflow(page);
});

test("출결 기록 지우기는 확인 전 저장하지 않고 키보드 취소 후 포커스를 돌려준다", async ({ page }) => {
  await open(page, "attendance");
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
  const group = page.getByRole("group", { name: "합성학생가 출결" });
  const trigger = group.getByRole("button", { name: "합성학생가 출결 지우기" });
  await expect(trigger).toHaveText("기록 지우기");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "합성학생가 출결 기록 지우기" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("확인하면 바로 저장됩니다.");
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
  await expect(group.getByRole("button", { name: "출석", exact: true })).toHaveAttribute("aria-pressed", "true");
  await trigger.click();
  await dialog.getByRole("button", { name: "취소" }).click();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
  await trigger.click();
  await dialog.getByRole("button", { name: "기록 지우기", exact: true }).click();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([{ type: "attendance.set", meetingId: "meeting-1", personId: "student-1", status: null, expectedRevision: 5 }]);
  await expectNoOverflow(page);
});

for (const theme of ["light", "dark"]) {
  for (const scenario of ["team", "help", "attendance"]) {
    test(`${theme} ${scenario} 화면의 접근성·가로 넘침·SDK 격리를 검사한다`, async ({ page }, info) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await open(page, scenario, "ready", theme);
      await page.screenshot({ path: info.outputPath(`${scenario}-${theme}.png`), fullPage: true });
      await expectNoOverflow(page);
      await expectAccessible(page);
      const proof = await (await page.request.get("/__qa__/proof.json")).json();
      expect(proof.synthetic).toBe(true);
      expect(proof.firebaseRuntimeModules).toEqual([]);
      expect(proof.rejected).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
}

test("보강 회귀: 실제 커리큘럼 실패 초안은 팀 전환·읽기 재시도 뒤에도 보존된다", async ({ page }, info) => {
  await open(page, "actualCurriculum", "admin");
  await page.evaluate(() => { window.__NEW_STAFF_QA__.writeFailures = { updateTeam: 1, updateCurriculumEntry: 1 }; });
  const goal = page.getByRole("textbox", { name: "찬양팀 이번 학기 목표" });
  const plan = page.getByRole("textbox", { name: "2026-10-10 계획" });
  await goal.fill("보존할 팀 목표");
  await goal.press("Tab");
  await expect(page.getByRole("button", { name: "팀 목표 다시 저장" })).toBeVisible();
  await plan.fill("보존할 회차 계획");
  await plan.press("Tab");
  await expect(page.getByRole("button", { name: "2026-10-10 계획 다시 저장" })).toBeVisible();
  await page.getByRole("tab", { name: "미디어팀", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "미디어팀 이번 학기 목표" })).toHaveValue("합성 미디어 목표");
  await expect(plan).not.toHaveValue("보존할 회차 계획");
  await page.getByRole("tab", { name: "찬양팀", exact: true }).click();
  await expect(goal).toHaveValue("보존할 팀 목표");
  await expect(plan).toHaveValue("보존할 회차 계획");
  await page.evaluate(() => window.__NEW_STAFF_QA__.fail("curriculum", "2026-2/praise-semester-team"));
  await expect(page.getByRole("alert")).toContainText("커리큘럼을 불러오지 못했습니다");
  await expect(plan).toBeDisabled();
  await page.screenshot({ path: info.outputPath("curriculum-failed-drafts.png"), fullPage: true });
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(plan).toBeEnabled();
  await expect(goal).toHaveValue("보존할 팀 목표");
  await expect(plan).toHaveValue("보존할 회차 계획");
  await page.getByRole("button", { name: "팀 목표 다시 저장" }).click();
  await page.getByRole("button", { name: "2026-10-10 계획 다시 저장" }).click();
  await expect(page.getByRole("button", { name: /다시 저장/ })).toHaveCount(0);
  await expect(goal).toHaveValue("보존할 팀 목표");
  await expect(plan).toHaveValue("보존할 회차 계획");
  expect(await page.evaluate(() => (window.__NEW_STAFF_QA__.writes as { name: string }[]).map((write) => write.name))).toEqual(["updateTeam", "updateCurriculumEntry", "updateTeam", "updateCurriculumEntry"]);
  await expect(page.locator("body")).not.toContainText("Synthetic private");
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
});

test("보강 회귀: 실제 훈련 커리큘럼은 새 반 대기 중 이전 반과 늦은 응답을 숨긴다", async ({ page }, info) => {
  await open(page, "actualCurriculum", "admin");
  await page.evaluate(() => { window.__NEW_STAFF_QA__.heldSubscriptions = ["curriculum:2026-2/training-2"]; });
  await page.getByRole("tab", { name: "훈련 2개", exact: true }).click();
  const plan = page.getByRole("textbox", { name: "2026-10-10 계획" });
  await expect(plan).toHaveValue("training-1 합성 원본 계획");
  const firstId = await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptionEvents.findLast((event) => event.active && event.name === "curriculum" && event.key === "2026-2/training-1")!.id);
  await page.getByRole("tab", { name: "합성 둘째 반", exact: true }).click();
  await expect(plan).toHaveValue("");
  await expect(plan).toBeDisabled();
  await page.evaluate((id) => window.__NEW_STAFF_QA__.deliver(id, { "meeting-1": { plan: "늦게 온 이전 반 계획" } }), firstId);
  await expect(plan).toHaveValue("");
  await page.screenshot({ path: info.outputPath("curriculum-delayed-group.png"), fullPage: true });
  await page.evaluate(() => window.__NEW_STAFF_QA__.emit("curriculum", "2026-2/training-2", { "meeting-1": { plan: "합성 둘째 반 최신 계획" } }));
  await expect(plan).toHaveValue("합성 둘째 반 최신 계획");
  await expect(plan).toBeEnabled();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
});

test("보강 회귀: 실제 출석의 여러 읽기 실패는 재구독으로 복구하고 늦은 응답을 무시한다", async ({ page }, info) => {
  await open(page, "actualAttendance", "admin");
  await page.getByRole("tab", { name: "표로 보기", exact: true }).click();
  const old = await page.evaluate(() => {
    const qa = window.__NEW_STAFF_QA__;
    qa.fail("allAttendance", "2026-2/team");
    qa.fail("allAttendance", "2026-2/training");
    qa.fail("completion", "2026-2");
    return qa.subscriptionEvents.filter((event) => event.active && ["allAttendance", "completion"].includes(event.name)).map((event) => event.id);
  });
  await expect(page.getByRole("alert")).toContainText("출석 기록을 불러오지 못했습니다");
  const cell = page.getByRole("button", { name: "합성학생가 2026-10-10 출석 상태", exact: true });
  await expect(cell).toBeDisabled();
  await page.screenshot({ path: info.outputPath("attendance-read-retry.png"), fullPage: true });
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(cell).toBeEnabled();
  expect(await page.evaluate((ids) => window.__NEW_STAFF_QA__.subscriptionEvents.filter((event) => ids.includes(event.id)).every((event) => !event.active), old)).toBe(true);
  await page.evaluate((ids) => ids.forEach((id) => window.__NEW_STAFF_QA__.deliver(id, { "meeting-1": { "1_student-1": { s: "결석" } } })), old);
  await expect(cell).toHaveText("·");
  await page.getByRole("tab", { name: "주차별 체크", exact: true }).click();
  await page.evaluate(() => window.__NEW_STAFF_QA__.fail("sessionAttendance", "2026-2/team/meeting-1"));
  await expect(page.getByRole("button", { name: "합성학생가 출석", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  const present = page.getByRole("button", { name: "합성학생가 출석", exact: true });
  await expect(present).toBeEnabled();
  await page.evaluate(() => { window.__NEW_STAFF_QA__.writeFailures.setAttendance = 1; });
  await present.click();
  await expect(page.getByRole("status")).toContainText("저장 실패");
  await present.click();
  await expect(page.getByRole("status")).toContainText("저장 완료");
  await expect(page.locator("body")).not.toContainText("Synthetic private");
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
});

test("보강 회귀: 실제 자료 삭제는 부분 실패·새로고침·자료 목록을 거쳐 안전하게 재시도한다", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "actualArchive", "admin");
  await page.getByRole("button", { name: "링크 연결", exact: true }).click();
  await page.getByRole("textbox", { name: "자료 제목", exact: true }).fill("보존할 자료 입력");
  await page.getByRole("textbox", { name: "자료 링크", exact: true }).fill("https://example.invalid/synthetic");
  await page.evaluate(() => window.__NEW_STAFF_QA__.fail("archiveLinks", "2026-2"));
  await expect(page.getByRole("alert")).toContainText("학기 자료를 불러오지 못했습니다");
  await expect(page.getByRole("textbox", { name: "자료 제목", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "자료 제목", exact: true })).toHaveValue("보존할 자료 입력");
  await expect(page.getByRole("textbox", { name: "자료 링크", exact: true })).toHaveValue("https://example.invalid/synthetic");
  await page.evaluate(() => { window.__NEW_STAFF_QA__.writeFailures.removeArchiveLink = 1; });
  const remove = page.getByRole("button", { name: "합성 보관 파일 삭제", exact: true });
  await remove.focus(); await page.keyboard.press("Enter");
  const confirm = page.getByRole("dialog", { name: "'합성 보관 파일' 자료를 삭제할까요?", exact: true });
  await page.keyboard.press("Escape");
  await expect(remove).toBeFocused();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await remove.click();
  await confirm.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("자료 삭제를 완료하지 못했습니다");
  await expect(page.getByRole("link", { name: /합성 보관 파일/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "합성 보관 파일 삭제 다시 시도", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window.__NEW_STAFF_QA__.writes as { name: string }[]).map((write) => write.name))).toEqual(["markArchiveLinkDeleting", "deleteSemesterArchiveFile", "removeArchiveLink"]);
  await page.screenshot({ path: info.outputPath("archive-partial-delete.png"), fullPage: true });
  await page.reload();
  await expect(page.getByRole("button", { name: "합성 보관 파일 삭제 다시 시도", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /합성 보관 파일/ })).toHaveCount(0);
  await open(page, "actualLibrary", "admin");
  await expect(page.getByText("아직 접근 가능한 학기 자료가 없습니다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /합성 보관 파일|합성 삭제 대기 자료/ })).toHaveCount(0);
  await open(page, "actualArchive", "admin");
  await page.getByRole("button", { name: "합성 보관 파일 삭제 다시 시도", exact: true }).click();
  await expect(page.getByRole("button", { name: /합성 보관 파일/ })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window.__NEW_STAFF_QA__.writes as { name: string }[]).map((write) => write.name))).toEqual(["markArchiveLinkDeleting", "deleteSemesterArchiveFile", "removeArchiveLink"]);
  expect(errors).toEqual([]);
  await expect(page.locator("body")).not.toContainText("Synthetic private");
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
});

test("보강 회귀: 삭제 표식을 저장하지 못하면 실제 자료 파일 정리를 시작하지 않는다", async ({ page }) => {
  await open(page, "actualArchive", "admin");
  await page.evaluate(() => { window.__NEW_STAFF_QA__.writeFailures.markArchiveLinkDeleting = 1; });
  await page.getByRole("button", { name: "합성 보관 파일 삭제", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("자료 삭제를 완료하지 못했습니다");
  await expect(page.getByRole("link", { name: /합성 보관 파일/ })).toBeVisible();
  expect(await page.evaluate(() => (window.__NEW_STAFF_QA__.writes as { name: string }[]).map((write) => write.name))).toEqual(["markArchiveLinkDeleting"]);
  await expectServiceIsolation(page);
});

test("보강 회귀: 일반 스탭의 실제 마이페이지는 활성 팀 바로가기와 권한 표시를 갱신한다", async ({ page }, info) => {
  await open(page, "actualMyPage");
  await page.getByRole("button", { name: "마이페이지 열기", exact: true }).click();
  const shortcuts = page.getByRole("region", { name: "내 사역 바로가기", exact: true });
  const team = shortcuts.getByRole("link", { name: /찬양팀/ });
  await expect(team).toHaveAttribute("href", "/teams/praise");
  await expect(team).toContainText("담당");
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("viewer"));
  await expect(team).toContainText("조회");
  await page.screenshot({ path: info.outputPath("mypage-active-team.png"), fullPage: true });
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("unassigned"));
  await expect(team).toHaveCount(0);
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("ready"));
  await team.click();
  await expect(page.getByRole("dialog", { name: "마이페이지", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.navigation)).toEqual(["/teams/praise"]);
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
});

test("보강 회귀: 일상 표현으로 명단·권한·저장 도움말을 찾고 업무별 저장 방식을 확인한다", async ({ page }, info) => {
  await open(page, "help");
  const search = page.getByRole("searchbox", { name: "사용법 검색", exact: true });
  for (const [query, answer] of [["학생 안 보여요", "group"], ["학생안보여요", "group"], ["권한 없어요", "access"], ["저장이 안 돼요", "save"], ["저장이안돼요", "save"]]) {
    await search.fill(query);
    await expect(page.locator(`details#${answer}`)).toHaveAttribute("open", "");
    await expect(page.locator(`details#${answer} p`)).toBeVisible();
    await expect(page.getByRole("button", { name: "검색 초기화", exact: true })).toHaveCount(0);
  }
  await expect(page.locator("details#save")).toContainText("커리큘럼은 입력 칸을 벗어나면 자동 저장");
  await expect(page.locator("details#save")).toContainText("파일 저장·링크 저장 버튼");
  await page.screenshot({ path: info.outputPath("help-natural-save-query.png"), fullPage: true });
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
});

test("보강 회귀: 빈 회차와 빈 출석 명단은 권한에 맞는 실제 다음 행동을 제공한다", async ({ page }, info) => {
  for (const scenario of ["actualCurriculum", "actualAttendance"]) {
    await open(page, scenario, "admin", "light", { empty: "sessions" });
    await expect(page.getByRole("link", { name: "학기 운영 설정 열기", exact: true })).toHaveAttribute("href", "/operations/semesters/2026-2/settings");
    await open(page, scenario, "ready", "light", { empty: "sessions" });
    await expect(page.getByText(/담당 교역자 또는 행정팀에 이 학기의 회차 등록을 요청/)).toBeVisible();
    await expect(page.getByRole("link", { name: "학기 운영 설정 열기", exact: true })).toHaveCount(0);
  }
  await open(page, "actualAttendance", "admin", "light", { empty: "applications" });
  await page.getByRole("tab", { name: "주차별 체크", exact: true }).click();
  await expect(page.getByRole("link", { name: "학기 배치 확인하기", exact: true })).toHaveAttribute("href", "/operations/semesters/2026-2/placements");
  await page.screenshot({ path: info.outputPath("attendance-empty-next-action.png"), fullPage: true });
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
});

test("보강 회귀: 실제 홈은 오늘의 공유 일정과 개인 팀 업무의 의미를 구분한다", async ({ page }, info) => {
  await open(page, "actualHome", "viewer");
  const shared = page.getByRole("region", { name: "오늘의 공유 일정", exact: true });
  await expect(shared).toContainText("고등부가 함께 보는 일정과 미완료 준비입니다.");
  await expect(page.getByRole("region", { name: "내 업무", exact: true })).toContainText("학기 찬양팀 조회자");
  await expect(page.getByRole("region", { name: "내 업무", exact: true }).getByRole("link", { name: "업무 열기", exact: true })).toHaveAttribute("href", "/teams/praise");
  await expect(page.getByRole("region", { name: "다음 일정", exact: true })).toContainText("공유 준비");
  await page.screenshot({ path: info.outputPath("home-shared-agenda-label.png"), fullPage: true });
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
  await expectNoOverflow(page);
  await expectServiceIsolation(page);
});

for (const theme of ["light", "dark"]) {
  test(`보강 회귀: ${theme} 실제 학기 오류 복구 화면의 접근성·모바일 배치를 확인한다`, async ({ page }, info) => {
    for (const [scenario, subscription, key] of [["actualCurriculum", "curriculum", "2026-2/praise-semester-team"], ["actualAttendance", "sessionAttendance", "2026-2/team/meeting-1"], ["actualArchive", "archiveLinks", "2026-2"]]) {
      await open(page, scenario, "admin", theme);
      const target = scenario === "actualAttendance" && (page.viewportSize()?.width ?? 1280) > 900
        ? { subscription: "allAttendance", key: "2026-2/team" } : { subscription, key };
      await expect.poll(() => page.evaluate(({ subscription, key }) => window.__NEW_STAFF_QA__.subscriptionEvents.some((event) => event.active && event.name === subscription && event.key === key), target)).toBe(true);
      await page.evaluate(({ subscription, key }) => window.__NEW_STAFF_QA__.fail(subscription, key), target);
      await expect(page.getByRole("alert").first()).toBeVisible();
      await expectAccessible(page);
      await expectNoOverflow(page);
      await expectServiceIsolation(page);
      await page.screenshot({ path: info.outputPath(`${scenario}-read-error-${theme}.png`), fullPage: true });
      await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
  });
}
