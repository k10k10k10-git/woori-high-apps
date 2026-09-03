/** @vitest-environment jsdom */
// 조회 전용 배너는 "잠그는 것"과 "알리는 것"이 다른 일이라는 판단으로 만들어졌다.
// fieldset disabled는 생김새를 바꾸지 않아서, 배너가 없으면 사용자는 눌러 보고 나서야
// 조회 전용임을 안다. 그래서 배너가 실제로 읽히는지(role=status, 문구)를 고정한다.
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ReadOnlyBanner from "./ReadOnlyBanner";

afterEach(cleanup);

describe("ReadOnlyBanner", () => {
  it("보조기술이 읽도록 role=status로 알린다", () => {
    render(<ReadOnlyBanner what="참가자 명단" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("무엇이 조회 전용인지 문장으로 알린다", () => {
    render(<ReadOnlyBanner what="참가자 명단" />);
    expect(screen.getByRole("status")).toHaveTextContent("참가자 명단를 볼 수는 있지만 저장은 되지 않습니다.");
  });

  it("이유가 있으면 함께 보이고, 없으면 문장만 남는다", () => {
    const { rerender } = render(<ReadOnlyBanner what="조편성" why="스탭팀장은 조회만 가능합니다" />);
    expect(screen.getByRole("status")).toHaveTextContent("스탭팀장은 조회만 가능합니다");

    rerender(<ReadOnlyBanner what="조편성" />);
    expect(screen.getByRole("status")).not.toHaveTextContent("스탭팀장은 조회만 가능합니다");
  });
});
