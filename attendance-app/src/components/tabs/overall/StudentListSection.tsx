'use client';
import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import AdminIcon from '@/components/admin/AdminIcon';
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
      <div className="ao-students-heading">
        <h2 className="overall-card-title">전체 학생 명단</h2>
        <span>{totalStudents}명 · 장결 포함</span>
      </div>
      <div className="ao-students-tools" role="group" aria-label="학생 명단 보기 선택">
        {(['1', '2'] as const).map(p => (
          <button type="button" key={p} aria-pressed={rosterPart === p} className={`view-btn${rosterPart === p ? ' active' : ''}`}
            onClick={() => setRosterPart(p)}>{p}부</button>
        ))}
        <button type="button" aria-pressed={rosterView === 'card'} className={`view-btn${rosterView === 'card' ? ' active' : ''}`} onClick={() => setRosterView('card')}>목록</button>
        <button type="button" aria-pressed={rosterView === 'table'} className={`view-btn${rosterView === 'table' ? ' active' : ''}`} onClick={() => setRosterView('table')}>표</button>
        <div className="ao-export" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setRosterExportOpen(false); }}
          onKeyDown={event => { if (event.key === 'Escape') { setRosterExportOpen(false); event.currentTarget.querySelector('button')?.focus(); } }}>
          <button type="button" className="ao-quiet-button" aria-expanded={rosterExportOpen} aria-controls="ao-export-options"
            onClick={() => setRosterExportOpen(o => !o)}>내보내기 <AdminIcon name="chevron" size={12} /></button>
          {rosterExportOpen && <div id="ao-export-options" className="ao-export-menu">
            {[
              { label: 'CSV 다운로드', fn: exportRosterCSV },
              { label: 'Excel 다운로드', fn: exportRosterXLSX },
              { label: 'PDF 인쇄', fn: exportRosterPDF },
            ].map(({ label, fn }) => <button type="button" key={label} onClick={fn}>{label}</button>)}
          </div>}
        </div>
      </div>
      {totalStudents === 0 && <p className="ao-loading">{rosterPart}부에 등록된 학생이 없습니다.</p>}

      {rosterView === 'card' ? (
        <div className="ao-student-groups">
          {rosterClassKeys.map(ck => {
            const info = classData[ck];
            if (!info || info.students.length === 0) return null;
            const [, g, c] = ck.split('-');
            return (
              <section key={ck} className="ao-student-group" aria-label={`${g}학년 ${c}반 학생 명단`}>
                <h3>{g}학년 {c}반 <span>{info.students.length}명</span></h3>
                <p>{info.teacher || '담임 교사 미등록'}</p>
                <ul>{info.students.map(s => <li key={s.id}>
                  <span className="ao-student-number">{s.num}</span><span>{s.name}</span>
                  {s.jang === true && <span className="ao-jang-label">장결</span>}
                </li>)}</ul>
              </section>
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
