// 소셜 로그인(Google)으로 넘어갈 창과 돌아올 주소를 정한다. 순수 함수라 시험에서 가짜 창으로 검사한다.
// 2026-11-12 실사고: 데스크톱 화면은 사이트 전체를 같은 출처의 틀(iframe, `?__portalFrame=desktop`) 안에
// 띄우는데, 틀 자체를 Google 로그인 주소로 보내면 Google 이 403 으로 막았다(틀 안 로그인 차단).
// Firebase 때는 팝업 창이라 문제가 없었다. 그래서 틀 안이면 맨 바깥 창을 보낸다.
import { stripDesktopFrameSearch } from "@/context/viewMode";

type LocationLike = { origin: string; pathname: string; search: string };
export type WindowLike = { location: LocationLike; top?: WindowLike | null };

/** 로그인 페이지로 이동할 창: 같은 출처 틀 안이면 맨 바깥 창, 아니면 자기 창. */
export function oauthTargetWindow<W extends WindowLike>(win: W): W {
  try {
    const top = win.top as W | null | undefined;
    if (top && top !== win && top.location.origin === win.location.origin) return top;
  } catch {
    // 다른 출처 틀이면 바깥 창 주소를 읽을 수 없다 → 자기 창으로 간다.
  }
  return win;
}

/** 로그인 뒤 돌아올 주소: 이동할 창의 현재 주소(틀 표시는 뺀다). */
export function oauthReturnUrl(win: WindowLike): string {
  const { origin, pathname, search } = oauthTargetWindow(win).location;
  return `${origin}${pathname}${stripDesktopFrameSearch(search)}`;
}
