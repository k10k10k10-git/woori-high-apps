/**
 * Shared export utilities for CSV, XLSX, and PDF export.
 */

/** Download a CSV string as a file */
export function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download an XLSX file from an array of arrays */
export type XLSXOptions = {
  headerRow?: number;
  columnWidths?: number[];
  columnFormats?: Record<number, string>;
  beforeDownload?: () => void;
};

export async function downloadXLSX(rows: (string | number | Date)[][], sheetName: string, filename: string, options: XLSXOptions = {}) {
  const { utils, writeFile } = await import('xlsx');
  const ws = utils.aoa_to_sheet(rows);
  if (options.columnWidths) ws['!cols'] = options.columnWidths.map(wch => ({ wch }));
  if (options.headerRow !== undefined && rows.length > options.headerRow) {
    ws['!autofilter'] = { ref: utils.encode_range({ s: { r: options.headerRow, c: 0 }, e: { r: rows.length - 1, c: rows[options.headerRow].length - 1 } }) };
    for (let row = options.headerRow + 1; row < rows.length; row++) {
      for (const [column, format] of Object.entries(options.columnFormats ?? {})) {
        const cell = ws[utils.encode_cell({ r: row, c: Number(column) })];
        if (cell?.t === 'n') cell.z = format;
      }
    }
  }
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, sheetName);
  options.beforeDownload?.();
  writeFile(wb, filename);
}

/** 인쇄 문서에 넣는 사용자 문자열은 HTML로 해석하지 않는다. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** Open a print window with HTML content for PDF export */
export function openPrintWindow(htmlContent: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.opener = null;
  win.document.write(htmlContent);
  win.document.close();
  return true;
}
