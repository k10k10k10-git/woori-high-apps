/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ArchiveLink } from "@/features/semester/types";

const mock = vi.hoisted(() => ({ add: vi.fn(), upload: vi.fn(), toast: vi.fn(), subscribe: vi.fn(), mark: vi.fn(), remove: vi.fn(), deleteFile: vi.fn(), confirm: vi.fn() }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mock.toast, uiConfirm: mock.confirm }) }));
vi.mock("@/features/semester/db", () => ({
  addArchiveLink: mock.add, removeArchiveLink: mock.remove, markArchiveLinkDeleting: mock.mark,
  subscribeArchiveLinks: mock.subscribe,
}));
vi.mock("@/features/semester/archiveStorage", () => ({ uploadSemesterArchiveFile: mock.upload, deleteSemesterArchiveFile: mock.deleteFile }));
import ArchiveTab from "./ArchiveTab";
import { SemesterEditProvider } from "@/features/semester/EditContext";
beforeEach(() => {
  mock.subscribe.mockImplementation((_sid: string, receive: (value: unknown[]) => void) => { receive([]); return () => {}; });
  mock.confirm.mockResolvedValue(true);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("자료가 비어 있는 조회 화면은 담당자 요청을 안내하고 업로드를 요구하지 않는다", () => {
  render(<SemesterEditProvider canEdit={false}><ArchiveTab sid="2026-2" /></SemesterEditProvider>);
  expect(screen.getByText(/담당 교역자 또는 행정팀에 학기 공용 자료 등록을 요청/)).toBeInTheDocument();
  expect(screen.queryByText(/위에서 파일을 올리거나/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "파일 저장" })).not.toBeInTheDocument();
});

it("중앙 운영 담당자는 팀 자료 조회 화면에서 같은 학기의 자료 등록으로 이동한다", () => {
  render(<SemesterEditProvider canEdit={false}><ArchiveTab sid="2026-2" operationsBaseHref="/operations/semesters/2026-2" /></SemesterEditProvider>);
  expect(screen.getByRole("link", { name: "학기 자료 등록하러 가기" })).toHaveAttribute("href", "/operations/semesters/2026-2/archive");
});

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

it.each(["file", "record"])("자료 삭제의 %s 단계가 실패해도 새로고침 뒤 이어서 삭제한다", async (failure) => {
  let link: ArchiveLink = { id: "link", title: "합성 파일", url: "https://example.invalid/file", kind: "doc", filePath: "semesters/2026-2/archive/file" };
  let receive: (links: ArchiveLink[]) => void;
  mock.subscribe.mockImplementation((_sid, callback) => { receive = callback; callback([link]); return () => {}; });
  mock.mark.mockImplementation(async () => { link = { ...link, deletionPending: true }; receive([link]); return true; });
  mock.deleteFile.mockResolvedValue(undefined);
  mock.remove.mockResolvedValue(undefined);
  if (failure === "file") mock.deleteFile.mockRejectedValueOnce(new Error("Storage unavailable"));
  else mock.remove.mockRejectedValueOnce(new Error("DB unavailable"));
  const first = render(<ArchiveTab sid="2026-2" />);
  fireEvent.click(screen.getByRole("button", { name: "합성 파일 삭제" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("link", { name: /합성 파일/ })).not.toBeInTheDocument();
  expect(mock.mark.mock.invocationCallOrder[0]).toBeLessThan(mock.deleteFile.mock.invocationCallOrder[0]);
  if (failure === "file") expect(mock.remove).not.toHaveBeenCalled();
  first.unmount();
  render(<ArchiveTab sid="2026-2" />);
  fireEvent.click(screen.getByRole("button", { name: "합성 파일 삭제 다시 시도" }));
  await waitFor(() => expect(mock.toast).toHaveBeenCalledWith("자료를 삭제했습니다", "success"));
  expect(mock.confirm).toHaveBeenCalledOnce();
  expect(mock.remove).toHaveBeenLastCalledWith("2026-2", "link");
});

it("자료 재구독은 작성 중 입력을 보존하며 기술 오류를 노출하지 않는다", () => {
  let fail!: (error: Error) => void;
  mock.subscribe.mockImplementationOnce((_sid, _receive, onError) => { fail = onError; return () => {}; });
  render(<ArchiveTab sid="2026-2" />);
  fireEvent.change(screen.getByRole("textbox", { name: "자료 제목" }), { target: { value: "유지할 입력" } });
  act(() => fail(new Error("PERMISSION_DENIED/private")));
  expect(screen.queryByText(/PERMISSION_DENIED/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(screen.getByRole("textbox", { name: "자료 제목" })).toHaveValue("유지할 입력");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it.each(["거절", "이미 삭제됨"])("삭제 표식이 %s 상태면 실제 파일 삭제를 시작하지 않는다", async (state) => {
  mock.subscribe.mockImplementation((_sid, receive) => { receive([{ id: "link", title: "보호할 자료", url: "https://example.invalid/file", kind: "doc", filePath: "archive/file" }]); return () => {}; });
  if (state === "거절") mock.mark.mockRejectedValueOnce(new Error("권한 없음"));
  else mock.mark.mockResolvedValueOnce(false);
  render(<ArchiveTab sid="2026-2" />);
  fireEvent.click(screen.getByRole("button", { name: "보호할 자료 삭제" }));
  await waitFor(() => expect(mock.mark).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByRole("button", { name: /보호할 자료 삭제/ })).toBeEnabled());
  expect(mock.deleteFile).not.toHaveBeenCalled();
  expect(mock.remove).not.toHaveBeenCalled();
});
