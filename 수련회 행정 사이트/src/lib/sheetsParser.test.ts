import { describe, it, expect } from "vitest";
import { parseCSV, parseCSVLine, parseSheetUrl, buildSheetUrl } from "./sheetsParser";

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

  it("handles CR-only line endings", () => {
    const result = parseCSV("a,b\rc,d");
    expect(result).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("handles CRLF inside quoted fields", () => {
    const result = parseCSV('a,"line1\r\nline2"');
    expect(result).toEqual([["a", "line1\r\nline2"]]);
  });

  it("keeps empty cells", () => {
    const result = parseCSV("a,,c");
    expect(result).toEqual([["a", "", "c"]]);
  });

  it("treats a comma-only line as an empty row and skips it", () => {
    const result = parseCSV("a,b\n,,\nc,d");
    expect(result).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("parses a realistic form export with a multiline note field", () => {
    const realCSV = `타임스탬프,이름,성별,어느 부서인가요?,몇 학년 인가요?,몇 반 인가요?,기타사항
2026. 6. 1 오후 1:23:45,김철수,남,1부,2학년,3반 (이선생T),
2026. 6. 1 오후 2:00:00,이영희,여,1부,1학년,1반,"알레르기 있음
견과류 주의"
2026. 6. 2 오전 9:10:00,박지민,남,1부,2학년,1반,`;
    const rows = parseCSV(realCSV);
    expect(rows).toHaveLength(4);
    expect(rows[2][6]).toBe("알레르기 있음\n견과류 주의");
    expect(rows[1][5]).toBe("3반 (이선생T)");
  });
});

// ── parseCSVLine ─────────────────────────────────────────────
describe("parseCSVLine", () => {
  it("parses a single line with quoted commas", () => {
    expect(parseCSVLine('x,"y,z",w')).toEqual(["x", "y,z", "w"]);
  });

  it("handles an empty string", () => {
    expect(parseCSVLine("")).toEqual([""]);
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
