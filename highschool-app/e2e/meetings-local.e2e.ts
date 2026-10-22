import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`${theme}: 회의록은 선택한 수련회만 읽고 기존 프로그램 회의로 연결한다`, async ({ page }, info) => {
    const external: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4179") && !request.url().startsWith("data:")) external.push(request.url()); });
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`/?scenario=actualMeetings&state=admin&theme=${theme}`);
    await expect(page.getByRole("heading", { name: "수련회를 먼저 선택하세요" })).toBeVisible();
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptions)).not.toContain("programMeetings");
    await page.getByRole("combobox", { name: "회의록을 볼 수련회" }).selectOption("synthetic-retreat");
    expect((await page.getByRole("combobox", { name: "회의록을 볼 수련회" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page).toHaveURL(/retreat=synthetic-retreat/);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "회의록을 볼 수련회" })).toHaveValue("synthetic-retreat");
    await expect(page.getByRole("heading", { name: "합성 비공개 회의" })).toBeVisible();
    const link = page.getByRole("link", { name: "회의록 열기" });
    await expect(link).toHaveAttribute("href", "/events/synthetic-retreat/programs?workspace=programs&program=program-main&section=overview&meeting=1&meetingId=meeting-private");
    await page.getByRole("searchbox", { name: "회의록 검색" }).fill("없는회의");
    await expect(page.getByRole("heading", { name: "검색 결과가 없습니다" })).toBeVisible();
    await page.getByRole("button", { name: "검색 초기화" }).click();
    await expect(link).toBeVisible();
    await page.screenshot({ path: info.outputPath(`meetings-${theme}.png`), fullPage: true });
    await page.evaluate(() => window.__NEW_STAFF_QA__.setAuth("programViewer"));
    await expect(page.getByRole("heading", { name: "회의록 접근 권한이 필요합니다." })).toBeVisible();
    await expect(page.getByText("합성 비공개 회의")).toHaveCount(0);
    const activePrivate = await page.evaluate(() => window.__NEW_STAFF_QA__.subscriptionEvents.filter(event => event.active && event.name === "programMeetings"));
    expect(activePrivate).toEqual([]);
    expect(await page.evaluate(() => window.__NEW_STAFF_QA__.writes)).toEqual([]);
    const proof = await (await page.request.get("/__qa__/proof.json")).json();
    expect(proof.firebaseRuntimeModules).toEqual([]);
    expect(proof.rejected).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(external).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
