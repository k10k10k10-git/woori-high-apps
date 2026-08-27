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

export function buildDesktopFrameSrc(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.set(DESKTOP_FRAME_QUERY_KEY, DESKTOP_FRAME_QUERY_VALUE);
  return `${pathname}?${params.toString()}`;
}

export function stripDesktopFrameSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(DESKTOP_FRAME_QUERY_KEY);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}
