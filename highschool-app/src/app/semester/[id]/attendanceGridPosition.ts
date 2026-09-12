export function attendanceMenuPosition(
  rect: Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width">,
  viewport: { width: number; height: number },
  menu: { width: number; height: number } = { width: 148, height: 190 },
) {
  const maxLeft = Math.max(8, viewport.width - menu.width - 8);
  const left = Math.min(Math.max(rect.left + rect.width / 2 - menu.width / 2, 8), maxLeft);
  const below = viewport.height - rect.bottom;
  const top = below < menu.height + 8 ? rect.top - menu.height - 4 : rect.bottom + 4;
  return { left, top: Math.max(top, 8) };
}
