export const THEME_STORAGE_KEY = "woori-high-theme";

export type Theme = "light" | "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveTheme(savedTheme: unknown, prefersDark: boolean): Theme {
  return isTheme(savedTheme) ? savedTheme : prefersDark ? "dark" : "light";
}
