import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/", "/semesters", "/sunday-ministry", "/retreats", "/ministry-guide"] as const;

test.describe("authenticated accessibility gate", () => {
  for (const route of routes) {
    test(`${route} has no serious WCAG violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
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
