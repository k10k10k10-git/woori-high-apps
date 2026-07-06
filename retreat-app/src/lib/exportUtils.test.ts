import { describe, it, expect, vi } from "vitest";

// Mock xlsx before importing the module
vi.mock("xlsx", () => ({
  writeFile: vi.fn(),
}));

// Mock window.open for browser API tests
const mockWrite = vi.fn();
const mockClose = vi.fn();
const mockAddEventListener = vi.fn();

import { saveWorkbook, printAsPDF, exportAsJPG, rowsToHtmlTable, escapeHtml } from "./exportUtils";

describe("escapeHtml (XSS 방지)", () => {
  it("스크립트/이벤트 핸들러 페이로드를 무력화한다", () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(escapeHtml('<script>alert(1)</script>')).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
  it("따옴표와 앰퍼샌드를 이스케이프한다", () => {
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
  });
  it("null/undefined/숫자를 안전하게 문자열로 처리한다", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });
  it("일반 한글 이름은 그대로 둔다", () => {
    expect(escapeHtml("김철수")).toBe("김철수");
  });
  it("rowsToHtmlTable은 셀 값을 이스케이프한다", () => {
    const html = rowsToHtmlTable("제목", "부제", [{ 이름: "<b>x</b>" }]);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

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
