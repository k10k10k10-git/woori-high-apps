import { expect, type Frame, type Locator, type Page } from "@playwright/test";

export const AUTHENTICATED_ROUTES = [
  "/",
  "/semesters",
  "/sunday-ministry",
  "/retreats",
  "/ministry-guide",
] as const;

export type AuthenticatedRoute = (typeof AUTHENTICATED_ROUTES)[number];

// 각 표식은 로그인뿐 아니라 해당 경로에 필요한 역할 판정을 통과한 뒤에만 렌더된다.
// 최상위 PortalViewportShell에는 나타나지 않으므로 iframe 보기에서도 실제 앱 문서를 고른다.
const ROLE_READY_SELECTOR: Record<AuthenticatedRoute, string> = {
  "/": ".app-page main.page-container",
  "/semesters": ".semester-scope main.page-container",
  "/sunday-ministry": ".semester-scope",
  "/retreats": "main.page-container.max-w-7xl",
  "/ministry-guide": ".ministry-guide-page main.page-container",
};

async function anyVisible(locators: Locator[]): Promise<boolean> {
  for (const locator of locators) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible()) return true;
    }
  }
  return false;
}

async function isAuthenticatedRouteFrame(frame: Frame, route: AuthenticatedRoute): Promise<boolean> {
  try {
    if (new URL(frame.url()).pathname !== route) return false;

    const roleReady = frame.locator(ROLE_READY_SELECTOR[route]).first();
    if (!(await roleReady.isVisible())) return false;

    return anyVisible([
      frame.getByRole("button", { name: "로그아웃" }),
      frame.getByRole("button", { name: "사이트 메뉴 열기" }),
    ]);
  } catch {
    // 주소 전환 중 분리된 프레임은 다음 poll에서 다시 확인한다.
    return false;
  }
}

/**
 * 저장된 세션이 실제 로그인과 경로별 역할 판정까지 통과했는지 확인하고,
 * PortalViewportShell이 iframe을 쓰면 그 안의 앱 프레임을 반환한다.
 */
export async function expectAuthenticatedAppFrame(page: Page, route: AuthenticatedRoute): Promise<Frame> {
  let appFrame: Frame | null = null;

  await expect
    .poll(async () => {
      // 자식 프레임을 먼저 보아 모바일 미리보기 바깥 헤더를 앱 본문으로 오인하지 않는다.
      for (const frame of [...page.frames()].reverse()) {
        if (await isAuthenticatedRouteFrame(frame, route)) {
          appFrame = frame;
          return true;
        }
      }
      return false;
    }, {
      timeout: 15_000,
      message: `${route}에서 로그인과 역할 판정을 통과한 앱 프레임을 찾지 못했습니다. E2E_STORAGE_STATE 만료와 계정 역할을 확인하세요.`,
    })
    .toBe(true);

  const resolvedFrame = appFrame ?? page.mainFrame();
  await expect(resolvedFrame.getByRole("button", { name: /^(로그인|Google로 로그인)$/ })).toHaveCount(0);
  await expect(resolvedFrame.getByRole("heading", { name: /접근 (?:승인이 필요합니다|권한이 없습니다)/ })).toHaveCount(0);
  return resolvedFrame;
}
