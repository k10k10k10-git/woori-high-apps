/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sheet = vi.hoisted(() => ({ rows: [] as unknown[][] }));
vi.mock("xlsx", () => ({ read: () => ({ SheetNames: ["명단"], Sheets: { "명단": {} } }), utils: { sheet_to_json: () => sheet.rows } }));
import { PraiseImport } from "./PraiseImport";
import { praiseFixture } from "./praiseTestFixtures";
beforeEach(() => { vi.stubGlobal("crypto", { randomUUID: () => "new-person", subtle: { digest: async () => new Uint8Array([1, 2, 3]).buffer } }); sheet.rows = [["이름", "학년", "성별", "부서", "팀"], ["새합성학생", "고2", "여", "1부", "싱어"]]; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function upload(name = "synthetic.xlsx") {
  const file = new File(["synthetic"], name); Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(8) });
  fireEvent.change(screen.getByLabelText("CSV · XLSX 파일"), { target: { files: [file] } });
}
describe("찬양팀 명단 미리보기", () => {
  it("선택한 파일을 미리보기로만 읽고 명시 확인 후 검증된 팀원만 등록한다", async () => {
    const execute = vi.fn().mockResolvedValue(true); render(<PraiseImport view={praiseFixture()} execute={execute} busy={false} />); upload();
    expect(await screen.findByText("새합성학생")).toBeInTheDocument(); expect(execute).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "검증된 1명 등록" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("열 연결과 중복 주의 사항을 확인했습니다")); fireEvent.click(screen.getByRole("button", { name: "검증된 1명 등록" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "people.import", checksum: "010203", source: "학생 명단 XLSX", people: [expect.objectContaining({ name: "새합성학생", grade: 2, gender: "FEMALE", department: "FIRST", kind: "STUDENT" })] })));
  });
  it("이미 등록된 이름은 확인 체크를 해도 중복 등록할 수 없다", async () => {
    sheet.rows[1][0] = "합성학생가"; const execute = vi.fn(); render(<PraiseImport view={praiseFixture()} execute={execute} busy={false} />); upload();
    expect(await screen.findByText(/같은 이름의 팀원은 일괄 등록할 수 없습니다/)).toBeInTheDocument(); fireEvent.click(screen.getByLabelText("열 연결과 중복 주의 사항을 확인했습니다"));
    expect(screen.getByRole("button", { name: "검증된 1명 등록" })).toBeDisabled(); expect(execute).not.toHaveBeenCalled();
  });
  it("지원하지 않는 파일과 중복 파일 열 이름을 저장 전에 거부한다", async () => {
    const execute = vi.fn(); render(<PraiseImport view={praiseFixture()} execute={execute} busy={false} />); upload("synthetic.txt");
    expect(await screen.findByRole("alert")).toHaveTextContent("CSV 또는 XLSX");
    sheet.rows[0] = ["이름", "이름"]; upload(); await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("열 이름")); expect(execute).not.toHaveBeenCalled();
  });
});
