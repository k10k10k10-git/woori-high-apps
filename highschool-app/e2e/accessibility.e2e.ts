import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { AUTHENTICATED_ROUTES, expectAuthenticatedAppFrame } from "./authenticated-app";

test.describe("authenticated accessibility gate", () => {
  for (const route of AUTHENTICATED_ROUTES) {
    test(`${route} has no serious WCAG violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });

      // AxeBuilder는 모든 프레임을 재귀 검사한다. 먼저 실제 앱 프레임에서
      // 로그인과 이 경로의 역할 통과를 확인해 로그인 화면의 거짓 통과를 막는다.
      const appFrame = await expectAuthenticatedAppFrame(page, route);
      await expect(appFrame.locator("body")).toBeVisible();

      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = result.violations.filter(violation =>
        violation.impact === "serious" || violation.impact === "critical",
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
});
