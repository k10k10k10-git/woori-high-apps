"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ViewMode = "desktop" | "mobile";

type ViewModeContextValue = {
  mode: ViewMode;
  isViewportMobile: boolean;
  isMobileView: boolean;
  setMode: (mode: ViewMode) => void;
};

const STORAGE_KEY = "woori-high-view-mode";
const MOBILE_QUERY = "(max-width: 900px)";

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

function savedMode(): ViewMode {
  if (typeof window === "undefined") return "desktop";
  return window.localStorage.getItem(STORAGE_KEY) === "mobile" ? "mobile" : "desktop";
}

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>("desktop");
  const [isViewportMobile, setViewportMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const apply = () => setViewportMobile(media.matches);
    const frame = window.requestAnimationFrame(() => {
      setModeState(savedMode());
      apply();
    });
    media.addEventListener("change", apply);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", apply);
    };
  }, []);

  const setMode = useCallback((nextMode: ViewMode) => {
    setModeState(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
  }, []);

  const isMobileView = isViewportMobile || mode === "mobile";

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
