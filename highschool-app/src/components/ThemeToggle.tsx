"use client";

import { useTheme } from "@/context/ThemeContext";
import { Moon, Sun } from "@phosphor-icons/react";

export default function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const nextThemeLabel = theme === "dark" ? "라이트 모드" : "다크 모드";
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      className={`theme-toggle${showLabel ? " theme-toggle--labelled" : ""}`}
      onClick={toggleTheme}
      aria-label={`${nextThemeLabel}로 전환`}
      title={`${nextThemeLabel}로 전환`}
    >
      <Icon className="theme-toggle__glyph" aria-hidden="true" weight="regular" />
      {showLabel && <span className="theme-toggle__label">{nextThemeLabel}</span>}
    </button>
  );
}
