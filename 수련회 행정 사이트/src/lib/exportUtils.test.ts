import { describe, it, expect, vi } from "vitest";

// Mock xlsx before importing the module
vi.mock("xlsx", () => ({
  writeFile: vi.fn(),
}));

// Mock window.open for browser API tests
const mockWrite = vi.fn();
const mockClose = vi.fn();
const mockAddEventListener = vi.fn();

import { saveWorkbook, printAsPDF, exportAsJPG, rowsToHtmlTable } from "./exportUtils";

describe("exportUtils", () => {
  it("saveWorkbook is a function", () => {
    expect(typeof saveWorkbook).toBe("function");
  });

  it("printAsPDF is a function", () => {
    expect(typeof printAsPDF).toBe("function");
  });

  it("printAsPDF returns false when window.open returns null (popup blocked)", () => {
    vi.stubGlobal("window", {
      open: vi.fn(() => null),
    });
    const result = printAsPDF("<p>test</p>", "Test");
    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });

  it("printAsPDF returns true when window.open succeeds", () => {
    const mockWin = {
      document: { write: mockWrite, close: mockClose },
      addEventListener: mockAddEventListener,
    };
    vi.stubGlobal("window", {
      open: vi.fn(() => mockWin),
    });
    const result = printAsPDF("<p>test</p>", "Test");
    expect(result).toBe(true);
    expect(mockWrite).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("exportAsJPG is a function", () => {
    expect(typeof exportAsJPG).toBe("function");
  });

  it("rowsToHtmlTable renders a header row per object key", () => {
    const html = rowsToHtmlTable("제목", "부제", [{ 이름: "김철수", 나이: 17 }]);
    expect(html).toContain("<th");
    expect(html).toContain("이름");
    expect(html).toContain("나이");
    expect(html).toContain("김철수");
    expect(html).toContain("17");
  });

  it("rowsToHtmlTable handles an empty row list without throwing", () => {
    const html = rowsToHtmlTable("제목", "부제", []);
    expect(html).toContain("제목");
    expect(html).not.toContain("<table");
  });
});
