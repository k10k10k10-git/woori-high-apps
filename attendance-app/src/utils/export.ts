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
export async function downloadXLSX(rows: string[][], sheetName: string, filename: string) {
  const { utils, writeFile } = await import('xlsx');
  const ws = utils.aoa_to_sheet(rows);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, sheetName);
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
