/**
 * Shared export utilities for CSV, XLSX, and PDF export.
 */

/** Download a CSV string as a file */
export function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
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

/** Open a print window with HTML content for PDF export */
export function openPrintWindow(htmlContent: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(htmlContent);
  win.document.close();
  return true;
}
