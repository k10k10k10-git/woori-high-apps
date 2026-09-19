/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OverlayShell from "@/components/OverlayShell";
import { UIProvider, useUI } from "./UIContext";

function ConfirmTrigger() {
  const { uiConfirm } = useUI();
  return <button type="button" onClick={() => void uiConfirm("권한을 변경할까요?")}>역할 변경</button>;
}

describe("UIProvider 확인창", () => {
  it("중첩된 화면보다 위에 열리고 ESC는 확인창만 닫는다", () => {
    const closeParent = vi.fn();
    render(
      <UIProvider>
        <OverlayShell label="마이페이지" onClose={closeParent}>
          <ConfirmTrigger />
        </OverlayShell>
      </UIProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "역할 변경" }));
    const confirm = screen.getByRole("dialog", { name: "권한을 변경할까요?" });
    expect(confirm.parentElement).toHaveClass("z-[140]");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "권한을 변경할까요?" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "마이페이지" })).toBeInTheDocument();
    expect(closeParent).not.toHaveBeenCalled();
  });
});
