/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./passwordClient", () => ({ requestAccountPassword: mocks.request }));
import AccountPasswordTool from "./AccountPasswordTool";

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("계정 이메일"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/새 비밀번호/), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "비밀번호 정하기" }));
}

it("규칙에 맞지 않으면 서버에 보내지 않고 이유를 알려 준다", () => {
  render(<AccountPasswordTool />);
  fill("pastor@gmail.com", "abcd1234");
  expect(screen.getByRole("alert")).toHaveTextContent("@woorihigh.com 계정의 비밀번호만");
  expect(mocks.request).not.toHaveBeenCalled();
});

it("성공하면 새로 만든 계정인지 알려 주고 입력한 비밀번호를 지운다", async () => {
  mocks.request.mockResolvedValue({ created: true });
  render(<AccountPasswordTool />);
  fill("Team01@woorihigh.com", "abcd1234");
  expect(await screen.findByRole("status")).toHaveTextContent("team01@woorihigh.com 계정을 새로 만들고 비밀번호를 정했습니다.");
  expect(screen.getByLabelText(/새 비밀번호/)).toHaveValue("");
});

it("서버 거절 안내를 그대로 보여 준다", async () => {
  mocks.request.mockRejectedValue(new Error("통합관리자만 비밀번호를 정할 수 있습니다."));
  render(<AccountPasswordTool />);
  fill("team01@woorihigh.com", "abcd1234");
  expect(await screen.findByRole("alert")).toHaveTextContent("통합관리자만");
});
