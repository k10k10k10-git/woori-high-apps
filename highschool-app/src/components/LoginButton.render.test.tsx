/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendEmailCode: vi.fn(), verifyEmailCode: vi.fn(), signInWithEmailPassword: vi.fn(), signInWithGoogle: vi.fn(), google: false,
}));
vi.mock("./InAppBrowserNotice", () => ({ default: () => <p>앱 안 브라우저 안내</p> }));
vi.mock("@/lib/supabaseAuth", () => ({
  sendEmailCode: mocks.sendEmailCode,
  verifyEmailCode: mocks.verifyEmailCode,
  signInWithEmailPassword: mocks.signInWithEmailPassword,
  signInWithGoogle: mocks.signInWithGoogle,
  isGoogleLoginEnabled: () => mocks.google,
}));
import LoginButton from "./LoginButton";

beforeEach(() => { vi.resetAllMocks(); mocks.google = false; });
afterEach(cleanup);

function open(email: string) {
  render(<LoginButton />);
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: email } });
}

it("처음 사용하는 스탭에게 기술 오류 원문 대신 복구 방법을 안내한다", async () => {
  mocks.sendEmailCode.mockRejectedValue(new Error("internal backend stack token"));
  open("staff@example.test");
  fireEvent.click(screen.getByRole("button", { name: "코드 받기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("로그인을 완료하지 못했습니다");
  expect(screen.queryByText(/internal backend/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "로그인 문제 해결 방법" })).toHaveAttribute("href", "/library/help#connection");
  expect(screen.getByRole("button", { name: "코드 받기" })).not.toBeDisabled();
});

it("요청 중에는 중복 전송을 막고, 요청이 많다는 거절은 기다릴 시간을 안내한다", async () => {
  let reject!: (error: unknown) => void;
  mocks.sendEmailCode.mockImplementation(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  open("staff@example.test");
  fireEvent.click(screen.getByRole("button", { name: "코드 받기" }));
  expect(screen.getByRole("button", { name: "처리 중…" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("button", { name: "처리 중…" }).closest("form")!);
  reject({ code: "auth/too-many-requests" });
  expect(await screen.findByRole("alert")).toHaveTextContent("1분쯤 뒤에");
  expect(mocks.sendEmailCode).toHaveBeenCalledTimes(1);
});

it("코드를 받은 뒤 숫자만 입력받아 확인하고, 성공하면 화면 전환을 기다린다", async () => {
  mocks.sendEmailCode.mockResolvedValue(undefined);
  mocks.verifyEmailCode.mockResolvedValue(undefined);
  open(" Staff@Example.test ");
  fireEvent.click(screen.getByRole("button", { name: "코드 받기" }));
  const input = await screen.findByLabelText("6자리 코드");
  expect(screen.getByText("staff@example.test")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "12 34-56" } });
  expect(input).toHaveValue("123456");
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  expect(await screen.findByText("로그인했습니다. 화면을 여는 중…")).toBeInTheDocument();
  expect(mocks.verifyEmailCode).toHaveBeenCalledWith("Staff@Example.test", "123456");
});

it("@woorihigh.com 계정은 코드를 보내지 않고 비밀번호로만 로그인한다", async () => {
  mocks.signInWithEmailPassword.mockRejectedValueOnce({ code: "auth/invalid-credential" }).mockResolvedValueOnce(undefined);
  open("team01@woorihigh.com");
  expect(screen.getByRole("button", { name: "이메일 코드" })).toBeDisabled();
  expect(screen.getByText(/메일함이 없어 코드를 받을 수 없습니다/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret-1234" } });
  fireEvent.click(screen.getAllByRole("button", { name: "로그인" }).at(-1)!);
  expect(await screen.findByRole("alert")).toHaveTextContent("이메일 또는 비밀번호가 맞지 않습니다");
  fireEvent.click(screen.getAllByRole("button", { name: "로그인" }).at(-1)!);
  expect(await screen.findByText("로그인했습니다. 화면을 여는 중…")).toBeInTheDocument();
  expect(mocks.sendEmailCode).not.toHaveBeenCalled();
  expect(mocks.signInWithEmailPassword).toHaveBeenCalledWith("team01@woorihigh.com", "secret-1234");
});

it("Google 로그인이 꺼져 있으면 이메일 로그인 창만, 켜져 있으면 창 없이 Google 단추 하나만 보인다", async () => {
  render(<LoginButton signIn={mocks.signInWithGoogle} />);
  expect(screen.queryByText("앱 안 브라우저 안내")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  expect(screen.queryByRole("button", { name: "Google로 로그인" })).not.toBeInTheDocument();
  cleanup();
  mocks.google = true;
  mocks.signInWithGoogle.mockReturnValue(new Promise(() => {}));
  render(<LoginButton signIn={mocks.signInWithGoogle} />);
  expect(screen.getByText("앱 안 브라우저 안내")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "로그인" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("이메일")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "로그인 중…" })).toBeDisabled();
  expect(mocks.signInWithGoogle).toHaveBeenCalledOnce();
});

it("허용되지 않은 주소의 Google 로그인 실패는 주소를 알려 달라고 안내하고 다시 시도할 수 있다", async () => {
  mocks.google = true;
  mocks.signInWithGoogle.mockRejectedValueOnce({ code: "auth/unauthorized-domain", message: "Synthetic provider detail" }).mockResolvedValueOnce(undefined);
  render(<LoginButton signIn={mocks.signInWithGoogle} />);
  fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("사이트 주소를 담당자에게 알려 주세요.");
  expect(screen.queryByText(/Synthetic provider/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "로그인 문제 해결 방법" })).toHaveAttribute("href", "/library/help#connection");
  fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(mocks.signInWithGoogle).toHaveBeenCalledTimes(2);
});
