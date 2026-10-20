'use client';

import { useRef, useState } from 'react';
import { isDataReady, useApp } from '@/store/AppContext';
import { buildYouthHandoff, youthHandoffWorkbookRows, YOUTH_HANDOFF_COLUMNS } from '@/utils/youthHandoff';
import { downloadXLSX } from '@/utils/export';
import AdminStatusBadge from './AdminStatusBadge';

/** Operate: 기존 설정의 흰 작업면·보라색 버튼을 이어, 전체 대상과 추출 기준을 다운로드 앞에 둔다. */
export default function YouthHandoffSection() {
  const { state, getState } = useApp();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [status, setStatus] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState(false);
  const exporting = useRef(false);
  if (state.userRole?.role !== 'admin') return null;
  const ready = isDataReady(state);
  const report = buildYouthHandoff(state, nowMs);

  async function exportHandoff() {
    if (exporting.current || !ready || report.futureYear || !report.rows.length) return;
    exporting.current = true;
    setBusy(true); setStatus({});
    const scope = state.dataRevision;
    const year = state.curYear;
    const assertScope = () => {
      const current = getState();
      if (current.dataRevision !== scope || current.curYear !== year || current.userRole?.role !== 'admin' || !isDataReady(current)) throw new Error('조회 연도나 로그인 상태가 변경되었습니다. 현재 화면에서 다시 내려받아 주세요.');
    };
    try {
      assertScope();
      const now = Date.now();
      const snapshot = buildYouthHandoff(getState(), now);
      if (snapshot.futureYear || !snapshot.rows.length) throw new Error('현재 연도에 내려받을 고3 명단이 없습니다. 조회 연도와 명단을 확인해 주세요.');
      setNowMs(now);
      await downloadXLSX(youthHandoffWorkbookRows(snapshot), '청년부 인계', `청년부인계_고3_${year}_${snapshot.extractedOn}.xlsx`, {
        headerRow: 5, columnWidths: [18, 24, 24, 22, 22, 24, 60, 14, 14], columnFormats: { 2: 'yyyy-mm-dd', 7: '0%' }, beforeDownload: assertScope,
      });
      setStatus({ success: `전체 고3 ${snapshot.rows.length}명의 엑셀 내려받기를 시작했습니다.` });
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : '엑셀을 만들지 못했습니다. 다시 내려받아 주세요.' });
    } finally { exporting.current = false; setBusy(false); }
  }

  return <section className="as-handoff" aria-labelledby="youth-handoff-title">
    <div className="as-section-heading"><div><h3 id="youth-handoff-title">청년부 인계 <span>{state.curYear}년 고3</span></h3><p>11월 사전 배정용 명단입니다. 내려받아도 고등부 명단과 출석 기록은 그대로 유지됩니다.</p></div>
      <button type="button" className="as-button as-button-primary" disabled={!ready || busy || report.futureYear || !report.rows.length} onClick={() => void exportHandoff()}>{busy ? '엑셀 만드는 중…' : '전체 고3 엑셀 내려받기'}</button>
    </div>
    {!ready ? <p role="alert">명단·출석·행사 자료를 모두 불러온 뒤 내려받을 수 있습니다. 연결 상태를 확인해 주세요.</p> : report.futureYear ? <p role="status">아직 시작되지 않은 연도입니다. 상단 조회 연도에서 현재 또는 과거 연도를 선택해 주세요.</p> : <>
      <p className="as-handoff-count">전체 <strong>{report.rows.length}명</strong> · 1부 {report.firstPartCount}명 · 2부 {report.secondPartCount}명 <span>장결 학생 포함</span></p>
      <p className="as-handoff-note">출석 조회 {report.startsOn} ~ {report.endsOn} · 추출일 {report.extractedOn}</p>
      <p className="as-handoff-note">출석률은 행사·미입력을 제외한 기록 기준입니다. 기본 정보 확인 필요 {report.reviewCount}명 · 출석 산정 불가 {report.unratedCount}명. 누락된 학생도 모두 포함합니다.</p>
      {report.rows.length ? <details className="as-handoff-preview"><summary>인계 명단 미리보기 · {report.rows.length}명</summary><div className="as-handoff-table" role="region" aria-label="청년부 인계 명단" tabIndex={0}>
        <table><thead><tr>{YOUTH_HANDOFF_COLUMNS.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{report.rows.map(row => <tr key={`${row.classKey}/${row.student.id}`}>
          <th scope="row">{row.student.name || '미등록'}</th><td>{row.classLabel}</td>
          <td>{row.birth}</td><td>{row.student.phone || '미등록'}</td><td>{row.student.pphone || '미등록'}</td><td>{row.student.school || '미등록'}</td><td>{row.student.addr || '미등록'}</td><td>{row.rate === null ? '산정 불가' : `${row.rate}%`}</td><td><AdminStatusBadge label={row.grade} /></td>
        </tr>)}</tbody></table>
      </div></details> : <p className="as-empty-note">선택한 연도에 등록된 고3 학생이 없습니다.</p>}
    </>}
    {status.error && <p className="as-handoff-error" role="alert">{status.error}</p>}
    {status.success && <p role="status">{status.success}</p>}
  </section>;
}
