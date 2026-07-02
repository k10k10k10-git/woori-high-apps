import * as XLSX from "xlsx";

export function saveWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function printAsPDF(htmlContent: string, title: string, landscape = false): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  const orientation = landscape ? "landscape" : "portrait";
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>${title}</title>
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif; font-size: 12px; margin: 0; padding: 20px; color: #222; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      .subtitle { font-size: 11px; color: #888; margin-bottom: 16px; }
      h2 { font-size: 13px; margin: 20px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 16px; font-size: 11px; }
      th { background: #f0f0f0; font-weight: 600; text-align: left; padding: 5px 8px; border: 1px solid #ccc; }
      td { padding: 4px 8px; border: 1px solid #e0e0e0; }
      tr:nth-child(even) td { background: #fafafa; }
      .section { page-break-inside: avoid; margin-bottom: 24px; }
      @media print { @page { margin: 1cm; size: A4 ${orientation}; } }
    </style>
  </head><body>${htmlContent}</body></html>`);
  win.document.close();
  win.addEventListener("load", () => win.print(), { once: true });
  return true;
}
