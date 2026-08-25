"use client";

import { Desktop, DeviceMobile } from "@phosphor-icons/react";
import { useViewMode, type ViewMode } from "@/context/ViewModeContext";

const OPTIONS: Array<{ mode: ViewMode; label: string; Icon: typeof Desktop }> = [
  { mode: "desktop", label: "PC버전", Icon: Desktop },
  { mode: "mobile", label: "모바일버전", Icon: DeviceMobile },
];

export default function ViewModeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, isViewportMobile, setMode } = useViewMode();
  if (isViewportMobile) return null;

  return (
    <div className={`view-mode-toggle${compact ? " view-mode-toggle--compact" : ""}`} role="group" aria-label="화면 보기 방식">
      {OPTIONS.map(({ mode: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => setMode(option)}
          title={`${label}으로 보기`}
        >
          <Icon aria-hidden="true" size={14} weight={mode === option ? "fill" : "regular"} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
