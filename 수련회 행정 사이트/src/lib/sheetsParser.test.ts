import { describe, it, expect } from "vitest";
import { parseCSV, parseSheetUrl, buildSheetUrl } from "./sheetsParser";

// ── parseCSV ─────────────────────────────────────────────────
describe("parseCSV", () => {
  it("parses normal CSV", () => {
    const result = parseCSV("a,b,c\n1,2,3");
    expect(result).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas", () => {
    const result = parseCSV('a,"b,c",d\n1,"2,3",4');
    expect(result).toEqual([
      ["a", "b,c", "d"],
      ["1", "2,3", "4"],
    ]);
  });

  it("handles quoted fields with newlines", () => {
    const result = parseCSV('a,"b\nc",d');
    expect(result).toEqual([["a", "b\nc", "d"]]);
  });

  it("handles escaped quotes (double-quote)", () => {
    const result = parseCSV('a,"say ""hello""",c');
    expect(result).toEqual([["a", 'say "hello"', "c"]]);
  });

  it("skips empty rows", () => {
    const result = parseCSV("a,b\n\n1,2");
    expect(result).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles CRLF line endings", () => {
    const result = parseCSV("a,b\r\n1,2\r\n3,4");
    expect(result).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

// ── parseSheetUrl ────────────────────────────────────────────
describe("parseSheetUrl", () => {
  it("parses URL with hash gid", () => {
    const url = "https://docs.google.com/spreadsheets/d/abc123/edit#gid=456";
    expect(parseSheetUrl(url)).toEqual({ sheetId: "abc123", sheetGid: "456" });
  });

  it("parses URL with query gid", () => {
    const url = "https://docs.google.com/spreadsheets/d/abc123/edit?gid=789";
    expect(parseSheetUrl(url)).toEqual({ sheetId: "abc123", sheetGid: "789" });
  });

  it("parses URL without gid", () => {
    const url = "https://docs.google.com/spreadsheets/d/abc123/edit?usp=sharing";
    expect(parseSheetUrl(url)).toEqual({ sheetId: "abc123", sheetGid: "" });
  });

  it("returns null for invalid URL", () => {
    expect(parseSheetUrl("https://example.com")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSheetUrl("")).toBeNull();
  });
});

// ── buildSheetUrl ────────────────────────────────────────────
describe("buildSheetUrl", () => {
  it("builds URL with sheetId and gid", () => {
    expect(buildSheetUrl("abc123", "456")).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/edit#gid=456"
    );
  });

  it("builds URL with sheetId only (no gid)", () => {
    expect(buildSheetUrl("abc123", "")).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/edit"
    );
  });

  it("returns empty string for empty sheetId", () => {
    expect(buildSheetUrl("", "456")).toBe("");
  });
});
