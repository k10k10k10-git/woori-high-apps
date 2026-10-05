/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LoginButton from "./LoginButton";
vi.mock("./InAppBrowserNotice", () => ({ default: () => null }));
afterEach(cleanup);

it("처음 사용하는 스탭에게 기술 오류 원문 대신 복구 방법을 안내한다", async () => {
  render(<LoginButton signIn={vi.fn().mockRejectedValue(new Error("internal backend stack token"))} />);
  fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("로그인을 완료하지 못했습니다");
  expect(screen.queryByText(/internal backend/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "로그인 문제 해결 방법" })).toHaveAttribute("href", "/library/help#connection");
  expect(screen.getByRole("button", { name: "Google로 로그인" })).not.toBeDisabled();
});

it("팝업 차단에는 팝업 허용 안내를 유지하고 중복 로그인을 막는다", async () => {
  let reject!: (error: unknown) => void;
  const signIn = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  render(<LoginButton signIn={signIn} />);
  fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
  expect(screen.getByRole("button", { name: "로그인 중…" })).toBeDisabled();
  reject({ code: "auth/popup-blocked" });
  expect(await screen.findByRole("alert")).toHaveTextContent("팝업이 차단되었습니다");
  expect(signIn).toHaveBeenCalledTimes(1);
});
