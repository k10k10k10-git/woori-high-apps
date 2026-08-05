import * as XLSX from "xlsx";

/**
 * HTML 이스케이프 — 인쇄/JPG 출력 HTML에 사용자 입력(이름·특이사항 등)을 넣기 전 반드시 통과시킨다.
 * 신청폼에 <img src=x onerror=...> 같은 값을 넣으면 관리자가 인쇄하는 순간 관리자 컨텍스트에서
 * 스크립트가 실행되는 저장형 XSS가 되므로, 데이터가 HTML에 삽입되는 모든 지점에서 이 함수로 감싼다.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function saveWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// 순수 데이터 배열을 간단한 표 HTML로 변환 — XLSX만 있던 탭(의료일지/단체티)에서 JPG 저장용으로 재사용.
export function rowsToHtmlTable(title: string, subtitle: string, rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return `<h1 style="margin:0 0 4px">${escapeHtml(title)}</h1><p style="font-size:11px;color:#888">${escapeHtml(subtitle)}</p>`;
  const cols = Object.keys(rows[0]);
  const head = cols.map(c => `<th style="border:1px solid #cbd5e1;padding:5px 8px;background:#f1f5f9;text-align:left;font-size:11px">${escapeHtml(c)}</th>`).join("");
  const body = rows.map(r => `<tr>${cols.map(c => `<td style="border:1px solid #e2e8f0;padding:4px 8px;font-size:11px">${escapeHtml(r[c] ?? "")}</td>`).join("")}</tr>`).join("");
  return `
    <h1 style="margin:0 0 4px">${escapeHtml(title)}</h1>
    <p style="font-size:11px;color:#888;margin:0 0 12px">${escapeHtml(subtitle)}</p>
    <table style="border-collapse:collapse;width:100%"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  `;
}

// SVG foreignObject는 내용이 well-formed XML이어야 한다 — &nbsp; 같은 HTML 전용 named entity가 있으면
// (XML 기본 엔티티는 &amp; &lt; &gt; &apos; &quot; 뿐) 이미지 로딩이 조용히 실패한다(GroupsTab의 &nbsp; 사례).
// 브라우저의 관대한 HTML 파서로 한 번 해석한 뒤 XMLSerializer로 다시 직렬화해 임의의 html이 들어와도 안전하게 만든다.
function toXhtmlSafe(html: string): string {
  const doc = new DOMParser().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml">${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;
  return new XMLSerializer().serializeToString(root);
}

// htmlContent(printAsPDF와 동일한 인라인 스타일 HTML 문자열)를 캔버스로 렌더링해 JPG로 저장.
// html2canvas 등 외부 라이브러리 없이 SVG foreignObject + Canvas로 처리(의존성 최소화 유지).
export async function exportAsJPG(htmlContent: string, filename: string, landscape = false): Promise<boolean> {
  try {
    const width = landscape ? 1600 : 1100;
    // printAsPDF와 동일한 기본 표 스타일 — 인라인 스타일이 없는 html(class 기반, 예: InsuranceTab)도 동일하게 보이도록.
    // .jpg-export-root로 스코프해 document.body에 잠깐 붙는 동안 다른 화면 요소에 영향 없게 함.
    const wrapped = `<div xmlns="http://www.w3.org/1999/xhtml" class="jpg-export-root" style="font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif;font-size:12px;color:#222;background:#fff;padding:20px;width:${width - 40}px;box-sizing:border-box">
      <style>
        .jpg-export-root h1 { font-size: 16px; margin: 0 0 4px; }
        .jpg-export-root .subtitle { font-size: 11px; color: #888; margin-bottom: 16px; }
        .jpg-export-root h2 { font-size: 13px; margin: 20px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
        .jpg-export-root table { border-collapse: collapse; width: 100%; margin-bottom: 16px; font-size: 11px; }
        .jpg-export-root th { background: #f0f0f0; font-weight: 600; text-align: left; padding: 5px 8px; border: 1px solid #ccc; }
        .jpg-export-root td { padding: 4px 8px; border: 1px solid #e0e0e0; }
        .jpg-export-root tr:nth-child(even) td { background: #fafafa; }
        .jpg-export-root .section { margin-bottom: 24px; }
      </style>
      ${htmlContent}
    </div>`;

    // 1) 실제 컨텐츠 높이 측정 (foreignObject는 고정 높이가 필요) — 반드시 별도 문서(iframe)에서 측정한다.
    //    GroupsTab 등 일부 htmlContent가 자체 <style> 블록(h1, table, .badge 같은 범용 선택자)을 포함하는데,
    //    document.body에 직접 붙이면 그 <style>이 문서 전역에 적용돼 잠깐이라도 실제 화면 요소에 새어나갈 수 있다.
    const iframe = document.createElement("iframe");
    iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:1px;border:0;`;
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument;
    if (!idoc) { document.body.removeChild(iframe); return false; }
    idoc.open();
    idoc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0">${wrapped}</body></html>`);
    idoc.close();
    // scrollHeight를 읽으면 브라우저가 그 자리에서 강제로 동기 레이아웃을 계산한다 — 페인트(rAF)를 기다릴 필요 없음.
    // 탭이 백그라운드/비활성 상태면 requestAnimationFrame이 아예 발동하지 않아 무한 대기에 빠질 수 있어 사용하지 않는다.
    const height = Math.max(100, Math.ceil(idoc.documentElement.scrollHeight));
    document.body.removeChild(iframe);

    // 2) SVG(foreignObject)로 감싸 이미지로 로드 — XML로 파싱되므로 XHTML-safe 버전을 사용
    const xmlSafeWrapped = toXhtmlSafe(wrapped);
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xmlSafeWrapped}</foreignObject></svg>`;
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("이미지 렌더링에 실패했습니다."));
    });
    img.src = svgUrl;
    await loaded;

    // 3) 캔버스에 그려 JPG로 내보내기 (2배 스케일로 선명하게)
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${filename}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

export function printAsPDF(htmlContent: string, title: string, landscape = false): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
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
  return true;
}
