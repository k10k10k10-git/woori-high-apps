export type ViewMode = "desktop" | "mobile";

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

export function shouldLockDesktopViewport(mode: ViewMode, isViewportMobile: boolean): boolean {
  return mode === "desktop" && isViewportMobile;
}
