/** @vitest-environment jsdom */
// 모달 3종 세트 회귀 테스트 — 이 저장소의 하드룰이자, 소스 읽기 테스트로는
// 검증할 수 없던 부분이다(CLAUDE.md 컨벤션 / 디자인 스킬 함정 4).
//
//   role="dialog" + aria-modal="true" + ESC 닫기
//
// 특히 aria-modal이 빠지면 조용히 깨진다 — 화면은 멀쩡해 보이는데, 스크롤 잠금이
// `[aria-modal="true"]`를 키로 잡기 때문에 배경이 계속 스크롤된다. 그래서 세 가지를
// 함께 고정한다.
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import OverlayShell from "./OverlayShell";

afterEach(cleanup);

// jsdom에는 레이아웃이 없어 getClientRects()가 항상 빈 배열이다. OverlayShell은 이걸로
// "화면에 보이는 요소"를 거르므로, 스텁하지 않으면 포커스 가능한 요소가 0개로 보인다.
// 컴포넌트 버그가 아니라 jsdom 한계라 테스트 쪽에서 보이는 것으로 취급한다.
beforeAll(() => {
  Element.prototype.getClientRects = function () {
    return [{ width: 1, height: 1 }] as unknown as DOMRectList;
  };
});

/** 실제 키 이벤트를 document에 흘려보낸다 — 컴포넌트가 capture 단계에서 듣는다. */
const pressKey = (key: string, init: KeyboardEventInit = {}) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));

describe("OverlayShell — 모달 3종 세트", () => {
  it("role=dialog와 aria-modal=true를 함께 갖는다", () => {
    render(<OverlayShell label="테스트 모달" onClose={() => {}}><p>본문</p></OverlayShell>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("접근 가능한 이름이 label로 연결된다", () => {
    render(<OverlayShell label="참가자 상세" onClose={() => {}}><p>본문</p></OverlayShell>);
    expect(screen.getByRole("dialog", { name: "참가자 상세" })).toBeInTheDocument();
  });

  it("ESC로 닫힌다", () => {
    const onClose = vi.fn();
    render(<OverlayShell label="테스트 모달" onClose={onClose}><p>본문</p></OverlayShell>);
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  const clickBackdrop = () =>
    (document.querySelector(".overlay-shell") as HTMLElement)
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

  it("배경을 누르면 닫는다", () => {
    const onClose = vi.fn();
    render(<OverlayShell label="테스트 모달" onClose={onClose}><p>본문</p></OverlayShell>);
    clickBackdrop();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closeOnBackdrop=false면 배경을 눌러도 닫지 않는다", () => {
    const onClose = vi.fn();
    render(
      <OverlayShell label="테스트 모달" onClose={onClose} closeOnBackdrop={false}><p>본문</p></OverlayShell>,
    );
    clickBackdrop();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("OverlayShell — 포커스", () => {
  it("조 추가 팝업을 닫으면 열기 버튼으로 포커스가 돌아온다", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "조 추가";
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <OverlayShell label="조 추가" onClose={() => {}}>
        <input data-autofocus aria-label="조 이름" />
      </OverlayShell>,
    );
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "조 이름" }));
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("data-autofocus가 있으면 그 요소로 포커스를 옮긴다", () => {
    render(
      <OverlayShell label="테스트 모달" onClose={() => {}}>
        <button type="button">먼저</button>
        <input data-autofocus aria-label="이름" />
      </OverlayShell>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("이름"));
  });

  it("data-autofocus가 없으면 패널 자신이 포커스를 받는다", () => {
    render(<OverlayShell label="테스트 모달" onClose={() => {}}><p>본문</p></OverlayShell>);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("Tab이 마지막 요소에서 첫 요소로 순환한다 (포커스 트랩)", () => {
    render(
      <OverlayShell label="테스트 모달" onClose={() => {}}>
        <button type="button">첫째</button>
        <button type="button">마지막</button>
      </OverlayShell>,
    );
    const first = screen.getByRole("button", { name: "첫째" });
    const last = screen.getByRole("button", { name: "마지막" });

    last.focus();
    pressKey("Tab");
    expect(document.activeElement).toBe(first);

    first.focus();
    pressKey("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("선택 탭만 Tab 순서에 있을 때 비선택 탭을 건너뛰고 양방향으로 순환한다", () => {
    render(
      <OverlayShell label="마이페이지" onClose={() => {}}>
        <div role="tablist" aria-label="메뉴">
          <button type="button" role="tab" tabIndex={-1} aria-selected={false}>대시보드</button>
          <button type="button" role="tab" tabIndex={0} aria-selected={true}>내 사역</button>
          <button type="button" role="tab" tabIndex={-1} aria-selected={false}>내 요청</button>
        </div>
        <button type="button">닫기</button>
        <button type="button" tabIndex={-1}>프로그램으로만 초점 이동</button>
      </OverlayShell>,
    );
    const selected = screen.getByRole("tab", { name: "내 사역" });
    const last = screen.getByRole("button", { name: "닫기" });

    selected.focus();
    pressKey("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);

    last.focus();
    pressKey("Tab");
    expect(document.activeElement).toBe(selected);
  });
});
