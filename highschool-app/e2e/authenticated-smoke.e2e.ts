import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { AUTHENTICATED_ROUTES, expectAuthenticatedAppFrame } from "./authenticated-app";

const statePath = process.env.E2E_STORAGE_STATE;
const hasSignedInState = Boolean(statePath && existsSync(statePath));

test.describe("로그인 운영 화면 smoke", () => {
  test.skip(!hasSignedInState, "E2E_STORAGE_STATE에 로그인 storage state 파일을 지정해야 합니다.");

  for (const route of AUTHENTICATED_ROUTES) {
    test(`${route}가 오류와 가로 넘침 없이 열린다`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.goto(route, { waitUntil: "networkidle" });
      const appFrame = await expectAuthenticatedAppFrame(page, route);
      await expect(appFrame.locator("body")).toBeVisible();
      await expect(appFrame.locator("body")).not.toContainText("Application error");
      const overflow = await appFrame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(pageErrors).toEqual([]);
    });
  }

  test("마이페이지가 포커스를 가두고 닫힌 뒤 배경 스크롤을 복구한다", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const appFrame = await expectAuthenticatedAppFrame(page, "/");
    const trigger = appFrame.getByRole("button", { name: /마이페이지/ }).or(appFrame.getByRole("link", { name: /마이페이지/ }));
    if (await trigger.first().isVisible()) {
      await trigger.first().click();
    } else {
      await appFrame.getByRole("button", { name: "사이트 메뉴 열기" }).click();
      const siteMenu = appFrame.getByRole("dialog", { name: "사이트 메뉴" });
      await expect(siteMenu).toBeVisible();
      await siteMenu.getByRole("button", { name: "마이페이지" }).click();
    }
    const dialog = appFrame.getByRole("dialog", { name: "마이페이지" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect.poll(() => appFrame.locator("body").evaluate(element => getComputedStyle(element).position)).not.toBe("fixed");
  });
});
