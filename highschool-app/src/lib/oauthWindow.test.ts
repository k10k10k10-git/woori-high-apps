import { describe, expect, it } from "vitest";
import { oauthReturnUrl, oauthTargetWindow, type WindowLike } from "./oauthWindow";

const loc = (href: string) => { const u = new URL(href); return { origin: u.origin, pathname: u.pathname, search: u.search }; };

describe("Google 로그인으로 넘어갈 창 (2026-11-12 틀 안 403 회귀)", () => {
  it("틀이 아니면 자기 창으로 가고, 돌아올 주소는 지금 주소다", () => {
    const win: WindowLike = { location: loc("https://woorihigh-app.vercel.app/teams?tab=a") };
    win.top = win;
    expect(oauthTargetWindow(win)).toBe(win);
    expect(oauthReturnUrl(win)).toBe("https://woorihigh-app.vercel.app/teams?tab=a");
  });

  it("데스크톱 틀(같은 출처) 안이면 바깥 창으로 가고, 돌아올 주소에 틀 표시가 없다", () => {
    const top: WindowLike = { location: loc("https://woorihigh-app.vercel.app/teams?tab=a") };
    top.top = top;
    const frame: WindowLike = { location: loc("https://woorihigh-app.vercel.app/teams?tab=a&__portalFrame=desktop"), top };
    expect(oauthTargetWindow(frame)).toBe(top);
    expect(oauthReturnUrl(frame)).toBe("https://woorihigh-app.vercel.app/teams?tab=a");
  });

  it("틀 주소만 읽을 수 있어도 틀 표시는 빼고 돌아온다", () => {
    const win: WindowLike = { location: loc("https://woorihigh-app.vercel.app/?__portalFrame=desktop") };
    win.top = win;
    expect(oauthReturnUrl(win)).toBe("https://woorihigh-app.vercel.app/");
  });

  it("다른 출처 틀이면(바깥 창을 못 읽으면) 자기 창으로 간다", () => {
    const blocked = { get location(): never { throw new DOMException("Blocked a frame", "SecurityError"); } } as unknown as WindowLike;
    const frame: WindowLike = { location: loc("https://woorihigh-app.vercel.app/"), top: blocked };
    expect(oauthTargetWindow(frame)).toBe(frame);
    const other: WindowLike = { location: loc("https://example.org/") };
    const frame2: WindowLike = { location: loc("https://woorihigh-app.vercel.app/"), top: other };
    expect(oauthTargetWindow(frame2)).toBe(frame2);
  });
});
