'use client';
import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { showToast } from '@/utils/toast';
import { downloadCSV, downloadXLSX, openPrintWindow } from '@/utils/export';

function sortClassKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const [pa, ga, ca] = a.split('-').map(Number);
    const [pb, gb, cb] = b.split('-').map(Number);
    if (pa !== pb) return pa - pb;
    if (ga !== gb) return ga - gb;
    return ca - cb;
  });
}

const thStyle: React.CSSProperties = { padding: '6px 10px', fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };

export default function StudentListSection() {
  const { state } = useApp();
  const { classData, curYear, curPart } = state;

  const [rosterView, setRosterView] = useState<'card' | 'table'>('card');
  const [rosterPart, setRosterPart] = useState(curPart);
  const [rosterExportOpen, setRosterExportOpen] = useState(false);

  const rosterClassKeys = sortClassKeys(Object.keys(classData).filter(ck => ck.startsWith(`${rosterPart}-`)));
  const gradeGroups = rosterClassKeys.reduce((acc, ck) => {
    const g = ck.split('-')[1];
    if (!acc[g]) acc[g] = [];
    acc[g].push(ck);
    return acc;
  }, {} as Record<string, string[]>);
  const maxStudents = rosterClassKeys.reduce((max, ck) => Math.max(max, classData[ck]?.students.length ?? 0), 0);
  const totalStudents = rosterClassKeys.reduce((sum, ck) => sum + (classData[ck]?.students.length ?? 0), 0);

  function exportRosterPDF() {
    setRosterExportOpen(false);
    const hdr1 = Object.entries(gradeGroups).map(([g, cks]) =>
      `<th colspan="${cks.length}" style="background:#F2EFF9;color:#6B5AAF;font-weight:700;border-left:2px solid #cbd5e1;">${g}학년</th>`
    ).join('');
    const hdr2 = rosterClassKeys.map((ck, i) => {
      const c = ck.split('-')[2];
      const first = i === 0 || ck.split('-')[1] !== rosterClassKeys[i-1].split('-')[1];
      return `<th style="border-left:${first ? '2px solid #cbd5e1' : '1px solid #e2e8f0'};">${c}반</th>`;
    }).join('');
    const hdr3 = rosterClassKeys.map((ck, i) => {
      const first = i === 0 || ck.split('-')[1] !== rosterClassKeys[i-1].split('-')[1];
      return `<th style="border-left:${first ? '2px solid #cbd5e1' : '1px solid #e2e8f0'};font-weight:400;color:#64748b;">${classData[ck]?.teacher || '-'}</th>`;
    }).join('');
    const bodyRows = Array.from({ length: maxStudents }, (_, i) => {
      const cells = rosterClassKeys.map((ck, ci) => {
        const s = classData[ck]?.students[i];
        const first = ci === 0 || ck.split('-')[1] !== rosterClassKeys[ci-1].split('-')[1];
        return `<td style="border-left:${first ? '2px solid #cbd5e1' : '1px solid #e2e8f0'};text-align:center;">${s?.name ?? ''}</td>`;
      }).join('');
      return `<tr><td style="color:#94a3b8;text-align:center;font-weight:600;">${i + 1}</td>${cells}</tr>`;
    }).join('');

    const ok = openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{font-family:sans-serif;font-size:9pt;}@page{size:landscape;margin:8mm;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #e2e8f0;padding:4px 6px;white-space:nowrap;font-size:8pt;}thead{display:table-header-group;}h2{font-size:11pt;margin-bottom:8px;}</style>
    </head><body>
      <h2>${curYear}년 ${rosterPart}부 전체 학생 명단</h2>
      <table><thead>
        <tr><th></th>${hdr1}</tr>
        <tr><th style="color:#94a3b8;">번호</th>${hdr2}</tr>
        <tr><th style="color:#94a3b8;">담임</th>${hdr3}</tr>
      </thead><tbody>${bodyRows}</tbody></table>
      <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
    </body></html>`);
    if (!ok) showToast('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해 주세요.');
  }

  async function exportRosterXLSX() {
    setRosterExportOpen(false);
    const header = ['번호', ...rosterClassKeys.map(ck => {
      const [, g, c] = ck.split('-');
      return `${g}학년 ${c}반 (${classData[ck]?.teacher || '교사미정'})`;
    })];
    const rows = [header, ...Array.from({ length: maxStudents }, (_, i) => [
      String(i + 1),
      ...rosterClassKeys.map(ck => classData[ck]?.students[i]?.name ?? ''),
    ])];
    await downloadXLSX(rows, '전체명단', `전체명단_${curYear}_${rosterPart}부.xlsx`);
  }

  function exportRosterCSV() {
    setRosterExportOpen(false);
    const header = ['번호', ...rosterClassKeys.map(ck => {
      const [, g, c] = ck.split('-');
      return `${g}학년 ${c}반 (${classData[ck]?.teacher || '교사미정'})`;
    })];
    const rows = [header, ...Array.from({ length: maxStudents }, (_, i) => [
      String(i + 1),
      ...rosterClassKeys.map(ck => classData[ck]?.students[i]?.name ?? ''),
    ])];
    downloadCSV(rows, `전체명단_${curYear}_${rosterPart}부.csv`);
  }

  return (
    <div className="overall-card">
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="overall-card-title">전체 학생 명단</span>
          <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 999 }}>{totalStudents}명</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['1', '2'] as const).map(p => (
            <button key={p} className={`view-btn${rosterPart === p ? ' active' : ''}`}
              onClick={() => setRosterPart(p)}>{p}부</button>
          ))}
          <div style={{ width: 1, height: 16, background: 'var(--border2)', margin: '0 2px' }} />
          <button className={`view-btn${rosterView === 'card' ? ' active' : ''}`} onClick={() => setRosterView('card')}>목록</button>
          <button className={`view-btn${rosterView === 'table' ? ' active' : ''}`} onClick={() => setRosterView('table')}>표</button>
          <div style={{ position: 'relative', marginLeft: 'auto' }}>
            <button
              aria-label="명단 내보내기 메뉴 열기"
              style={{ padding: '5px 12px', fontSize: 12, borderRadius: 999, border: '1.5px solid var(--border2)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' }}
              onClick={() => setRosterExportOpen(o => !o)}
            >내보내기 &#9662;</button>
            {rosterExportOpen && (
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, boxShadow: 'var(--shadow)', zIndex: 100, minWidth: 140 }}>
                {[
                  { label: 'CSV 다운로드', fn: exportRosterCSV },
                  { label: 'Excel 다운로드', fn: exportRosterXLSX },
                  { label: 'PDF 인쇄', fn: exportRosterPDF },
                ].map(({ label, fn }) => (
                  <button key={label} onClick={fn}
                    style={{ display: 'block', width: '100%', padding: '8px 14px', fontSize: 12, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {rosterView === 'card' ? (
        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {rosterClassKeys.map(ck => {
            const info = classData[ck];
            if (!info || info.students.length === 0) return null;
            const [, g, c] = ck.split('-');
            return (
              <div key={ck} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface2)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-text)', marginBottom: 2 }}>
                  {g}학년 {c}반 · {info.students.length}명
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>{info.teacher || '교사 미정'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {info.students.map(s => (
                    <div key={s.id} style={{ fontSize: 12, padding: '2px 0', color: 'var(--text)' }}>
                      {s.num}. {s.name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', padding: '14px 16px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ background: 'var(--primary-bg)' }}>
                <th style={thStyle}></th>
                {Object.entries(gradeGroups).map(([g, cks]) => (
                  <th key={g} colSpan={cks.length}
                    style={{ ...thStyle, color: 'var(--primary-text)', fontWeight: 700, textAlign: 'center', borderLeft: '2px solid var(--border2)' }}>
                    {g}학년
                  </th>
                ))}
              </tr>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ ...thStyle, color: 'var(--text3)' }}>번호</th>
                {rosterClassKeys.map((ck, i) => {
                  const c = ck.split('-')[2];
                  const first = i === 0 || ck.split('-')[1] !== rosterClassKeys[i-1].split('-')[1];
                  return <th key={ck} style={{ ...thStyle, borderLeft: first ? '2px solid var(--border2)' : '1px solid var(--border)', textAlign: 'center' }}>{c}반</th>;
                })}
              </tr>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ ...thStyle, color: 'var(--text3)' }}>담임</th>
                {rosterClassKeys.map((ck, i) => {
                  const first = i === 0 || ck.split('-')[1] !== rosterClassKeys[i-1].split('-')[1];
                  return <th key={ck} style={{ ...thStyle, fontWeight: 400, color: 'var(--text2)', borderLeft: first ? '2px solid var(--border2)' : '1px solid var(--border)', textAlign: 'center' }}>{classData[ck]?.teacher || '-'}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxStudents }, (_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : 'var(--surface2)' }}>
                  <td style={{ ...tdStyle, color: 'var(--text3)', textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>
                  {rosterClassKeys.map((ck, ci) => {
                    const student = classData[ck]?.students[i];
                    const first = ci === 0 || ck.split('-')[1] !== rosterClassKeys[ci-1].split('-')[1];
                    return <td key={ck} style={{ ...tdStyle, borderLeft: first ? '2px solid var(--border2)' : '1px solid var(--border)', textAlign: 'center' }}>{student?.name ?? ''}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
