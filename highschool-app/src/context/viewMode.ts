export type ViewMode = "desktop" | "mobile";

export const DESKTOP_FRAME_QUERY_KEY = "__portalFrame";
export const DESKTOP_FRAME_QUERY_VALUE = "desktop";
export const DESKTOP_FRAME_NAME = "woori-high-desktop-frame";

export function resolveInitialViewMode(storedMode: string | null, isViewportMobile: boolean): ViewMode {
  if (storedMode === "desktop" || storedMode === "mobile") return storedMode;
  return isViewportMobile ? "mobile" : "desktop";
}

export function isMobileMode(mode: ViewMode): boolean {
  return mode === "mobile";
}

export function shouldUseMobilePreview(mode: ViewMode, isViewportMobile: boolean): boolean {
  return mode === "mobile" && !isViewportMobile;
}

export function shouldUseDesktopFrame(mode: ViewMode, isEmbeddedDesktopFrame: boolean): boolean {
  return mode === "desktop" && !isEmbeddedDesktopFrame;
}

/** 로그인 콜백 값(`?code=` 등)은 바깥 창만 처리한다. 틀 주소에 넘기면 같은 코드를 두 번 교환하려 한다. */
const AUTH_CALLBACK_KEYS = ["code", "error", "error_code", "error_description"];

export function stripAuthCallbackSearch(search: string): string {
  const params = new URLSearchParams(search);
  // 콜백 값이 없으면 받은 글자 그대로 돌려준다(평소 주소의 인코딩을 바꾸지 않는다).
  if (!AUTH_CALLBACK_KEYS.some((key) => params.has(key))) return search;
  for (const key of AUTH_CALLBACK_KEYS) params.delete(key);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

export function buildDesktopFrameSrc(pathname: string, search: string): string {
  const params = new URLSearchParams(stripAuthCallbackSearch(search));
  params.set(DESKTOP_FRAME_QUERY_KEY, DESKTOP_FRAME_QUERY_VALUE);
  return `${pathname}?${params.toString()}`;
}

export function stripDesktopFrameSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(DESKTOP_FRAME_QUERY_KEY);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}
