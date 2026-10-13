'use client';

import { useEffect, useRef, useState } from 'react';
import { isDataReady, useApp } from '@/store/AppContext';
import { auth } from '@/lib/firebase/client';
import { isDemoAccount } from '@/lib/demo';
import { canUseAdminWorkspace } from '@/lib/adminNavigation';
import { downloadXLSX } from '@/utils/export';
import { pastoralContactWorkbook, type ContactExportKind, type PastoralReportData } from '@/utils/pastoralContactExport';
import type { ReportSort } from '@/utils/pastoralReport';

export default function PastoralContactExport({ report, order }: { report: PastoralReportData; order: ReportSort }) {
  const { state, getState } = useApp();
  const [busy, setBusy] = useState<ContactExportKind | null>(null);
  const [status, setStatus] = useState<{ error?: string; success?: string }>({});
  const exporting = useRef(false);
  const active = useRef(true);
  const currentWeek = useRef(report.selectedWeek?.key);
  currentWeek.current = report.selectedWeek?.key;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const allowed = Boolean(auth.currentUser) && canUseAdminWorkspace(state.userRole, isDemoAccount(auth.currentUser?.email));
  const ready = allowed && isDataReady(state) && Boolean(report.selectedWeek);

  async function exportContacts(kind: ContactExportKind) {
    if (!ready || exporting.current || !(kind === 'absent' ? report.absent : report.recovered).length) return;
    exporting.current = true; setBusy(kind); setStatus({});
    const user = auth.currentUser;
    const year = state.curYear;
    const revision = state.dataRevision;
    const week = report.selectedWeek?.key;
    const assertScope = () => {
      const current = getState();
      if (!active.current || !auth.currentUser || auth.currentUser !== user || current.curYear !== year || current.dataRevision !== revision
        || currentWeek.current !== week || !isDataReady(current) || !canUseAdminWorkspace(current.userRole, isDemoAccount(auth.currentUser?.email))) {
        throw new Error('조회 주일·연도 또는 로그인 상태가 변경되었습니다. 현재 화면에서 다시 내려받아 주세요.');
      }
    };
    try {
      assertScope();
      const file = pastoralContactWorkbook(report, year, kind, order);
      await downloadXLSX(file.rows, file.label, file.filename, {
        headerRow: 5, columnWidths: [20, 24, 24, 12, 24, 20], columnFormats: { 5: 'yyyy-mm-dd' }, beforeDownload: assertScope,
      });
      if (active.current) setStatus({ success: `${file.label} 전체 ${file.count}명의 연락처 엑셀 내려받기를 시작했습니다.` });
    } catch (error) {
      if (active.current) setStatus({ error: error instanceof Error ? error.message : '엑셀을 만들지 못했습니다. 다시 시도해 주세요.' });
    } finally {
      exporting.current = false;
      if (active.current) setBusy(null);
    }
  }

  if (!allowed) return null;
  return <div className="pr-contact-export" role="group" aria-label="전체 학생 연락처 엑셀 내려받기">
    <div className="pr-contact-export-buttons">{(['absent', 'recovered'] as const).map(kind => {
      const label = kind === 'absent' ? '연속 결석' : '다시 출석';
      const count = (kind === 'absent' ? report.absent : report.recovered).length;
      return <button type="button" key={kind} disabled={!ready || busy !== null || !count} onClick={() => void exportContacts(kind)} aria-label={`${label} 전체 연락처 엑셀 내려받기`}>
        {busy === kind ? '엑셀 만드는 중…' : `${label} 연락처 엑셀`} <span>전체 {count}명</span>
      </button>;
    })}</div>
    <p className="pr-note">선택한 기준 주일의 전체 학생을 내려받습니다. 장결 포함 · 검색·부서·학년·반 필터 미적용 · 보호자 연락처 제외.</p>
    {!ready && <p role="status">명단·출석·행사 자료를 모두 불러온 뒤 내려받을 수 있습니다.</p>}
    {status.error && <p role="alert">{status.error}</p>}
    {status.success && <p role="status">{status.success}</p>}
  </div>;
}
