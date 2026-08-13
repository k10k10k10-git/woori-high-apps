"use client";

import { useTheme } from "@/context/ThemeContext";

export default function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const nextThemeLabel = theme === "dark" ? "라이트 모드" : "다크 모드";

  return (
    <button
      type="button"
      className={`theme-toggle${showLabel ? " theme-toggle--labelled" : ""}`}
      onClick={toggleTheme}
      aria-label={`${nextThemeLabel}로 전환`}
      title={`${nextThemeLabel}로 전환`}
    >
      <span className="theme-toggle__glyph" aria-hidden="true" />
      {showLabel && <span className="theme-toggle__label">{nextThemeLabel}</span>}
    </button>
  );
}
