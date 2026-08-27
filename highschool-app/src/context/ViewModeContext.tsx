"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isMobileMode, resolveInitialViewMode, type ViewMode } from "./viewMode";

export type { ViewMode } from "./viewMode";

type ViewModeContextValue = {
  mode: ViewMode;
  isViewportMobile: boolean;
  isMobileView: boolean;
  setMode: (mode: ViewMode) => void;
};

const STORAGE_KEY = "woori-high-view-mode";
const MOBILE_QUERY = "(max-width: 900px)";

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

function savedMode(isViewportMobile: boolean): ViewMode {
  if (typeof window === "undefined") return "desktop";
  return resolveInitialViewMode(window.localStorage.getItem(STORAGE_KEY), isViewportMobile);
}

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>("desktop");
  const [isViewportMobile, setViewportMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const apply = () => setViewportMobile(media.matches);
    const frame = window.requestAnimationFrame(() => {
      setModeState(savedMode(media.matches));
      apply();
    });
    const syncStoredMode = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setModeState(resolveInitialViewMode(event.newValue, media.matches));
    };
    media.addEventListener("change", apply);
    window.addEventListener("storage", syncStoredMode);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", syncStoredMode);
    };
  }, []);

  const setMode = useCallback((nextMode: ViewMode) => {
    setModeState(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
  }, []);

  // 한 번 선택한 화면 모드는 브라우저 폭보다 우선한다. 실제 모바일의 최초
  // 접속만 화면 폭을 기본값으로 쓰고, 이후 리사이즈는 선택을 뒤집지 않는다.
  const isMobileView = isMobileMode(mode);

  useEffect(() => {
    document.documentElement.dataset.viewMode = isMobileView ? "mobile" : "desktop";
    document.documentElement.dataset.viewPreview = !isViewportMobile && mode === "mobile" ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.viewMode;
      delete document.documentElement.dataset.viewPreview;
    };
  }, [isMobileView, isViewportMobile, mode]);

  const value = useMemo(
    () => ({ mode, isViewportMobile, isMobileView, setMode }),
    [isMobileView, isViewportMobile, mode, setMode],
  );

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (!context) throw new Error("useViewMode must be used within ViewModeProvider");
  return context;
}
