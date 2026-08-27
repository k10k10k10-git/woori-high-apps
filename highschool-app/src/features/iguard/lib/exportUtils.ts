import { escapeHtml } from "@/lib/exportUtils";

/** 인쇄용 HTML을 새 창에 띄워 브라우저 인쇄(PDF 저장 포함)로 출력.
 *  lib/exportUtils의 printAsPDF와 이름은 같지만 계약이 다르다 — 이쪽은 팝업 차단 시
 *  alert로 직접 알리고 void를 반환하고, lib판은 false를 반환해 호출부가 토스트로
 *  처리한다. 현장 화면은 토스트 컨텍스트 없이 쓰이는 곳이 있어 분리해 둔다.
 *  xlsx에 의존하지 않는 것도 이 파일이 따로 있는 이유다. */
export function printAsPDF(htmlContent: string, title: string, landscape = false) {
  const win = window.open("", "_blank");
  if (!win) { alert("팝업을 허용해주세요."); return; }
  const orientation = landscape ? "landscape" : "portrait";
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>${escapeHtml(title)}</title>
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
}
