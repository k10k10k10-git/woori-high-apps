import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// 이 파일은 playwright.new-staff.config.ts의 합성 loopback 환경에서만 실행한다.
// 기본 운영 E2E에 섞이면 테스트를 실행하지 않으며 실제 인증을 우회하지 않는다.
test.beforeEach(async ({ page, baseURL }) => {
  expect(baseURL, "합성 테스트는 loopback 전용 config가 필요합니다.").toBe("http://127.0.0.1:4179");
  await page.clock.install({ time: new Date("2026-10-05T01:00:00Z") });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "data:" || (url.hostname === "127.0.0.1" && url.port === "4179")) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

async function open(page: Page, scenario: string, state = "ready", theme = "light") {
  await page.goto(`/?scenario=${scenario}&state=${state}&theme=${theme}`);
  // 최초 Vite 모듈 변환 시간을 기다린다. 업무 상호작용 제한은 config의 8초를 유지한다.
  await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const violations = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  expect(violations, JSON.stringify(violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })), null, 2)).toEqual([]);
}

test("첫 방문 안내가 자동 열리고 닫기·재방문·다시 열기·계정 변경이 동작한다", async ({ page }) => {
  await open(page, "team");
  await expect(page.getByRole("heading", { name: "찬양팀, 이렇게 시작해요" })).toBeVisible();
  const close = page.getByRole("button", { name: "안내 닫기" });
  await expect(close).toHaveAttribute("aria-expanded", "true");
  await close.click();
  await expect(page.getByRole("button", { name: "사용 안내 열기" })).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(page.getByRole("button", { name: "사용 안내 열기" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "찬양팀, 이렇게 시작해요" })).toHaveCount(0);
  await page.getByRole("button", { name: "사용 안내 열기" }).click();
  await expect(page.getByRole("heading", { name: "찬양팀, 이렇게 시작해요" })).toBeVisible();
  await page.getByRole("button", { name: "안내 닫기" }).click();
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("ready", "synthetic-staff-b"));
  await expect(page.getByRole("heading", { name: "찬양팀, 이렇게 시작해요" })).toBeVisible();
  await expectNoOverflow(page);
});

test("팀 전체 현황과 명확한 업무 설명이 첫 화면에 제공된다", async ({ page }) => {
  await open(page, "team");
  const guideLink = page.getByRole("link", { name: "처음이라면 사용 안내로 이동" });
  await expect(guideLink).toBeInViewport();
  await expect(page.getByRole("link", { name: "업무 바로가기" })).toHaveAttribute("href", "#team-work-actions");
  await guideLink.click();
  await expect(page.getByRole("heading", { name: "찬양팀, 이렇게 시작해요" })).toBeInViewport();
  await expect(page.getByRole("heading", { name: "팀 전체 현황" })).toBeVisible();
  await expect(page.getByRole("region", { name: "팀 전체 현황" })).toContainText("2명");
  await expect(page.getByRole("region", { name: "팀 전체 현황" })).toContainText("1명");
  await expect(page.getByRole("region", { name: "팀 전체 현황" })).toContainText("2026-10-10");
  await expect(page.getByRole("region", { name: "팀 전체 현황" })).not.toContainText("합성 휴강");
  await expect(page.getByRole("link", { name: /명단.*누적 출석/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /이번.*모임/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "사이트 사용법 보기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "학기 개요 보기" })).toHaveCount(0);
  await expectNoOverflow(page);
});

test("브라우저 저장이 막혀도 첫 안내를 닫고 다시 열 수 있다", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Synthetic blocked storage", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Synthetic blocked storage", "SecurityError"); };
  });
  await open(page, "team");
  await page.getByRole("button", { name: "안내 닫기" }).click();
  await expect(page.getByRole("button", { name: "사용 안내 열기" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "사용 안내 열기" }).click();
  await expect(page.getByRole("heading", { name: "찬양팀, 이렇게 시작해요" })).toBeVisible();
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes.length)).toBe(0);
});

test("홈의 첫 안내를 닫아도 팀 첫 사용 안내는 별도로 자동 열린다", async ({ page }) => {
  await open(page, "homeGuide");
  const details = page.locator("details");
  await expect(details).toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).not.toHaveAttribute("open", "");
  await page.reload();
  await expect(details).not.toHaveAttribute("open", "");
  await open(page, "team");
  await expect(page.getByRole("heading", { name: "찬양팀, 이렇게 시작해요" })).toBeVisible();
  await page.getByRole("button", { name: "안내 닫기" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "사용 안내 열기" })).toBeVisible();
  await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("ready", "synthetic-staff-b"));
  await expect(page.getByRole("heading", { name: "찬양팀, 이렇게 시작해요" })).toBeVisible();
});

test("조회자에게는 입력·저장 대신 조회와 담당자 문의를 안내한다", async ({ page }) => {
  await open(page, "homeGuide", "viewer");
  const guide = page.locator("details");
  await expect(guide).toHaveAttribute("open", "");
  await expect(page.getByRole("region", { name: "내 업무 시작" })).toContainText("팀 기록 조회 전용");
  await expect(guide).toContainText("학기 명단·연락처와 기존 기록 조회");
  await expect(guide).not.toContainText("저장 결과 확인");
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
  await page.getByRole("link", { name: "사이트 사용법 보기" }).click();
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
    const trigger = page.getByRole("button", { name: "사이트 메뉴 열기" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "사이트 메뉴" });
    await expect(dialog).toBeVisible();
    const nav = dialog.getByRole("navigation", { name: "모바일 통합 사역 메뉴" });
    for (const [label, href] of [["팀", "/teams"], ["훈련", "/training"], ["행사", "/events"], ["운영센터", "/operations"], ["자료", "/library"]]) {
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
  } else {
    const nav = page.getByRole("navigation", { name: "통합 사역 메뉴" });
    for (const href of ["/training", "/events", "/operations", "/library"]) await expect(nav.locator(`a[href="${href}"]`)).toBeVisible();
    await expect(nav.locator('a[href="/operations"]')).toHaveAttribute("data-qa-prefetch", "disabled");
    await page.screenshot({ path: info.outputPath("navigation-desktop.png") });
    await expectAccessible(page);
  }
  expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).toEqual([]);
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
  for (const area of ["administration", "programs", "field"]) {
    const link = nav.locator(`a[href="/events/synthetic-retreat/${area}"]`);
    await expect(link).toHaveAttribute("data-qa-prefetch", "disabled");
    await expect(link).toContainText("권한 필요");
    await link.focus();
    await link.hover();
  }
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
    const trigger = page.getByRole("navigation", { name: "통합 사역 메뉴" }).getByRole("button", { name: "팀", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const links = page.locator('.portal-dropdown-panel a[href^="/teams/"]');
    await expect(links).toHaveCount(6);
    await page.screenshot({ path: info.outputPath("navigation-dark.png") });
    await expectAccessible(page);
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
});

test("사용법 검색·업무 필터·검색 초기화·문의 링크가 동작한다", async ({ page }) => {
  await open(page, "help");
  const search = page.getByRole("searchbox", { name: "사용법 검색" });
  await search.fill("출결 저장");
  await expect(page.getByText(/선택하면 바로 저장|선택하면.*저장|선택하면 즉시 저장/, { exact: false }).first()).toBeVisible();
  await expect(page.locator("details[open]")).not.toHaveCount(0);
  await page.getByRole("combobox", { name: "업무 종류" }).selectOption("접속·권한");
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
  const primary = page.getByRole("region", { name: "주간 업무와 학기 기록" }).locator(".team-action-card.is-primary");
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAttribute("href", /\/teams\/media\/terms\/2026-2\//);
  await expect(page.getByRole("region", { name: "주간 업무와 학기 기록" })).toContainText(/준비 중/);
  await expect(page.getByRole("region", { name: "미디어팀, 이렇게 시작해요" }).locator('a[href="/teams/media/terms/2026-2/roster"]')).toHaveCount(1);
  await expectNoOverflow(page);
});

for (const [term, label] of [["past", "지난 학기"], ["upcoming", "예정 학기"]]) {
  test(`${label}만 연결돼 있을 때 현재 업무로 오해하게 안내하지 않는다`, async ({ page }) => {
    await page.goto(`/?scenario=team&term=${term}`);
    await expect(page.getByRole("heading", { name: "팀 전체 현황" })).toBeVisible();
    const work = page.getByRole("region", { name: "주간 업무와 학기 기록" });
    await expect(work).toContainText(label);
    await expect(work).not.toContainText("이번 주");
    await expect(page.getByRole("region", { name: "찬양팀, 이렇게 시작해요" })).not.toContainText("이번 학기");
    await expectNoOverflow(page);
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
