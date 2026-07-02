import { describe, it, expect, vi } from "vitest";

// Mock xlsx before importing the module
vi.mock("xlsx", () => ({
  writeFile: vi.fn(),
}));

// Mock window.open for browser API tests
const mockWrite = vi.fn();
const mockClose = vi.fn();
const mockAddEventListener = vi.fn();

import { saveWorkbook, printAsPDF } from "./exportUtils";

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
});
