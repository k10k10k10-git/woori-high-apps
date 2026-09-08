import { calcStats, type AppState } from '@/store/AppContext';
import type { Student } from '@/types';
import { downloadCSV, downloadXLSX, escapeHtml, openPrintWindow } from '@/utils/export';
import { evKey } from '@/utils/dates';
import { showToast } from '@/utils/toast';

export function attendanceExport(state: AppState, ck: string, activeStudents: Student[], viewWeeks: string[], close: () => void) {
  const { months, events, attData, curView, curYear } = state;
  function exportCSV() {
    const header = ['번호', '이름', ...viewWeeks.map(k => {
      const [mi, di] = k.split('-').map(Number);
      return `${months[mi]?.month}/${months[mi]?.sundays[di]}`;
    })];
    const rows = [header, ...activeStudents.map(s => [
      String(s.num ?? ''),
      s.name,
      ...viewWeeks.map(k => attData[ck]?.[s.id]?.[k] ?? ''),
    ])];
    downloadCSV(rows, `출석_${curYear}_${ck}.csv`);
    close();
  }

  async function exportXLSX() {
    const header = ['번호', '이름', ...viewWeeks.map(k => {
      const [mi, di] = k.split('-').map(Number);
      return `${months[mi]?.month}/${months[mi]?.sundays[di]}`;
    })];
    const rows = [header, ...activeStudents.map(s => [
      String(s.num ?? ''),
      s.name,
      ...viewWeeks.map(k => attData[ck]?.[s.id]?.[k] ?? ''),
    ])];
    await downloadXLSX(rows, '출석', `출석_${curYear}_${ck}.xlsx`);
    close();
  }

  function exportPDF() {
    close();
    const PAGE_SIZE = 10;
    const pages: typeof activeStudents[] = [];
    for (let i = 0; i < activeStudents.length; i += PAGE_SIZE) pages.push(activeStudents.slice(i, i + PAGE_SIZE));
    if (pages.length === 0) return;

    // PDF용 주차: 이벤트 포함, 학기 필터만 적용
    const pdfWeeks = months.flatMap(({ sundays }, mi) =>
      sundays.map((_, di) => evKey(mi, di))
    ).filter(k => {
      const [mi] = k.split('-').map(Number);
      const month = months[mi]?.month ?? 0;
      if (curView === 'first')  return month >= 1 && month <= 6;
      if (curView === 'second') return month >= 7 && month <= 12;
      return true;
    });

    // 월 헤더 span 계산 (pdfWeeks 기준 — 이벤트 포함)
    const monthSpans: { month: number; span: number }[] = [];
    months.forEach(({ month, sundays }, mi) => {
      const vis = sundays.filter(() => {
        const m = months[mi].month;
        if (curView === 'first'  && !(m >= 1 && m <= 6))  return false;
        if (curView === 'second' && !(m >= 7 && m <= 12)) return false;
        return true; // 이벤트 포함
      });
      if (vis.length > 0) monthSpans.push({ month, span: vis.length });
    });

    const monthHdr = monthSpans.map(ms =>
      `<th colspan="${ms.span}" style="background:#F2EFF9;color:#6B5AAF;font-weight:700;">${escapeHtml(ms.month)}월</th>`
    ).join('');

    const dayHdr = pdfWeeks.map(k => {
      const [mi, di] = k.split('-').map(Number);
      const day = months[mi]?.sundays[di];
      const ev = events[k];
      return ev
        ? `<th style="background:#fef3c7;color:#92400e;font-size:6pt;word-break:keep-all;">${escapeHtml(ev)}</th>`
        : `<th style="background:#f8fafc;">${escapeHtml(day ?? '')}</th>`;
    }).join('');

    // ck 예: "1-1-1" → "1부 1학년 1반"
    const [ckPart, ckGrade, ckClass] = ck.split('-');
    const ckLabel = `${ckPart}부 ${ckGrade}학년 ${ckClass}반`;

    const pagesHTML = pages.map((group, pi) => {
      const isLast = pi === pages.length - 1;
      const rows = group.map(s => {
        const stats = calcStats(state, ck, s.id);
        const rec = stats.present + stats.absent;
        const rate = rec > 0 ? Math.round((stats.present / rec) * 100) : 0;
        const grade = rate >= 90 ? 'A' : rate >= 80 ? 'B' : rate >= 70 ? 'C' : 'D';
        const cells = pdfWeeks.map(k => {
          const ev = events[k];
          const val = attData[ck]?.[s.id]?.[k] ?? '';
          if (ev) return `<td style="background:#fef3c7;color:#92400e;font-size:6pt;word-break:keep-all;">${escapeHtml(ev)}</td>`;
          const bg = val === 'O' ? '#ecfdf5' : val === 'X' ? '#fef2f2' : '';
          const fg = val === 'O' ? '#059669' : val === 'X' ? '#dc2626' : '';
          return `<td style="background:${bg};color:${fg};font-weight:${val ? '700' : '400'};">${escapeHtml(val)}</td>`;
        }).join('');
        return `<tr class="data-row">
          <td style="color:#94a3b8;text-align:center;">${escapeHtml(s.num ?? '')}</td>
          <td style="text-align:left;padding:3px 6px;font-weight:500;">${escapeHtml(s.name)}</td>
          ${cells}
          <td style="background:#f8fafc;">${rec > 0 ? `${stats.present}/${rec}` : '-'}</td>
          <td style="background:#f8fafc;">${rec > 0 ? rate + '%' : '-'}</td>
          <td style="background:#f8fafc;">${rec > 0 ? grade : '-'}</td>
        </tr>`;
      }).join('');
      return `<div ${isLast ? '' : 'style="page-break-after:always;"'}>
        <div style="font-size:10pt;font-weight:700;margin-bottom:5px;">${escapeHtml(curYear)}년 ${escapeHtml(ckLabel)} 출석부 &nbsp;${pi + 1}페이지</div>
        <table><thead>
          <tr>
            <th rowspan="2" style="background:#f8fafc;">순</th>
            <th rowspan="2" style="background:#f8fafc;">이름</th>
            ${monthHdr}
            <th rowspan="2" style="background:#f8fafc;">출석/주차</th>
            <th rowspan="2" style="background:#f8fafc;">출석률</th>
            <th rowspan="2" style="background:#f8fafc;">등급</th>
          </tr>
          <tr>${dayHdr}</tr>
        </thead><tbody>${rows}</tbody></table>
      </div>`;
    }).join('');

    const ok = openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        *{box-sizing:border-box;}
        body{font-family:sans-serif;font-size:9pt;margin:0;padding:0;}
        @page{size:landscape;margin:6mm;}
        table{border-collapse:collapse;width:100%;}
        th,td{border:1px solid #e2e8f0;padding:3px 4px;text-align:center;white-space:nowrap;font-size:8pt;}
        thead{display:table-header-group;}
        tr.data-row{height:17mm;}
      </style></head><body>
      ${pagesHTML}
      <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
    </body></html>`);
    if (!ok) showToast('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해 주세요.');
  }

  return { exportCSV, exportXLSX, exportPDF };
}
