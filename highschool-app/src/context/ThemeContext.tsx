"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { isTheme, resolveTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const THEME_CHANGE_EVENT = "woori-high:theme-change";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const appliedTheme = document.documentElement.dataset.theme;
  if (isTheme(appliedTheme)) return appliedTheme;
  return resolveTheme(readSavedTheme(), systemPrefersDark());
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function subscribe(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function notify() {
    onStoreChange();
  }

  function onStorage(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyTheme(resolveTheme(event.newValue, systemPrefersDark()));
    notify();
  }

  function onSystemChange() {
    if (readSavedTheme() !== null) return;
    applyTheme(resolveTheme(null, systemPrefersDark()));
    notify();
  }

  window.addEventListener(THEME_CHANGE_EVENT, notify);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, notify);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemChange);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => "light");

  const setTheme = useCallback((nextTheme: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // 저장소가 차단된 브라우저에서도 현재 탭의 테마 전환은 유지한다.
    }
    applyTheme(nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(readTheme() === "dark" ? "light" : "dark");
  }, [setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [setTheme, theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
