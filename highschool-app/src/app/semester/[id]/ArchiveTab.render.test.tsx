/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ add: vi.fn(), upload: vi.fn(), toast: vi.fn() }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mock.toast, uiConfirm: vi.fn() }) }));
vi.mock("@/features/semester/db", () => ({
  addArchiveLink: mock.add, removeArchiveLink: vi.fn(),
  subscribeArchiveLinks: (_sid: string, receive: (value: unknown[]) => void) => { receive([]); return () => {}; },
}));
vi.mock("@/features/semester/archiveStorage", () => ({ uploadSemesterArchiveFile: mock.upload, deleteSemesterArchiveFile: vi.fn() }));
import ArchiveTab from "./ArchiveTab";
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("링크는 명시적으로 저장하고 진행률 대신 저장 상태를 표시하며 중복 입력을 막는다", async () => {
  let resolve!: () => void;
  mock.add.mockImplementation(() => new Promise<void>((yes) => { resolve = yes; }));
  render(<ArchiveTab sid="2026-2" />);
  fireEvent.click(screen.getByRole("button", { name: "링크 연결" }));
  fireEvent.change(screen.getByRole("textbox", { name: "자료 제목" }), { target: { value: "합성 자료" } });
  fireEvent.change(screen.getByRole("textbox", { name: "자료 링크" }), { target: { value: "https://example.invalid/record" } });
  expect(mock.add).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "링크 저장" }));
  expect(screen.getByRole("button", { name: "저장 중…" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "자료 제목" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "파일 업로드" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("저장 중");
  expect(screen.queryByText("0%")).not.toBeInTheDocument();
  await act(async () => resolve());
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장 완료"));
  expect(mock.add).toHaveBeenCalledOnce();
  expect(mock.add).toHaveBeenCalledWith("2026-2", { title: "합성 자료", url: "https://example.invalid/record", kind: "doc" });
  expect(mock.upload).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "자료 제목" }), { target: { value: "다음 자료" } });
  expect(screen.getByRole("status")).toHaveTextContent("미저장 · 링크 저장을 눌러 주세요");
});

it("링크 저장이 실패하면 입력과 실패 상태를 남겨 다시 저장할 수 있다", async () => {
  mock.add.mockRejectedValueOnce(new Error("합성 저장 오류")).mockResolvedValue(undefined);
  render(<ArchiveTab sid="2026-2" />);
  fireEvent.click(screen.getByRole("button", { name: "링크 연결" }));
  const title = screen.getByRole("textbox", { name: "자료 제목" });
  fireEvent.change(title, { target: { value: "합성 자료" } });
  fireEvent.change(screen.getByRole("textbox", { name: "자료 링크" }), { target: { value: "https://example.invalid/record" } });
  fireEvent.click(screen.getByRole("button", { name: "링크 저장" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장 실패"));
  expect(title).toHaveValue("합성 자료");
  fireEvent.click(screen.getByRole("button", { name: "링크 저장" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장 완료"));
});
