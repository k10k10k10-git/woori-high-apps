'use client';
import { useRef, useState } from 'react';
import { db, ref, get, push, set, runTransaction } from '@/lib/db';
import { useApp, useClassKey } from '@/store/AppContext';
import { createPersonId, findHistoricalStudentPersonId } from '@/utils/personId';
import { adminActor, buildAdminChangeEntry } from '@/utils/adminChange';
import { sameStoredValue } from '@/utils/studentPersistence';
import { parseRosterInput, planRosterImport } from '@/utils/rosterImport';
import { trashRecordKey } from '@/utils/trash';
import ManagementDialog from './ManagementDialog';
import type { Student } from '@/types';

type ClassSnapshot = { students?: Record<string, Student>; teacher?: string; adminChanges?: Record<string, unknown> };
type Preview = { plan: ReturnType<typeof planRosterImport>; snapshot: ClassSnapshot; operationId: string; history: Record<string, unknown> };
export default function RosterModal({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const ck = useClassKey(state);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  function changeText(value: string) { setText(value); setPreview(null); setConfirmed(false); setError(null); }
  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || busyRef.current) return;
    if (file.size > 2 * 1024 * 1024) { setError('CSV 파일은 2MB 이하로 나누어 주세요.'); return; }
    busyRef.current = true; setBusy(true);
    try { changeText(await file.text()); }
    catch { setError('파일을 읽지 못했습니다. UTF-8 CSV 파일을 다시 선택해 주세요.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function makePreview() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setPreview(null); setConfirmed(false);
    try {
      const rows = parseRosterInput(text);
      if (!rows.length) throw new Error('학생 이름을 한 줄에 한 명씩 입력해 주세요.');
      const all = await get(ref(db, 'classes'));
      const history = all.val() ?? {};
      const snapshot: ClassSnapshot | undefined = history[state.curYear]?.[ck];
      if (!snapshot) throw new Error('반이 없습니다. 먼저 반을 추가해 주세요.');
      const operationId = crypto.randomUUID();
      setPreview({ plan: planRosterImport(rows, snapshot.students ?? {}, mode, operationId), snapshot, history, operationId });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '미리보기를 만들지 못했습니다. 연결을 확인해 주세요.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function apply() {
    if (!preview || busyRef.current || (mode === 'replace' && !confirmed)) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const { plan, snapshot, operationId, history } = preview;
      const students = Object.fromEntries(Object.entries(plan.students).map(([id, student]) => [id, student.personId ? student : {
        ...student, personId: findHistoricalStudentPersonId(student, [history], { year: state.curYear, classKey: ck, allowSameYearClassMatch: true }) ?? createPersonId('student'),
      }]));
      if (mode === 'replace' && Object.keys(snapshot.students ?? {}).length) {
        // 기존 명단을 먼저 보관하고, 이후 원장이 바뀌면 조건부 저장을 중단한다.
        await set(ref(db, `trash/${state.curYear}/classes/${trashRecordKey(ck, 'roster', operationId)}`), { ...snapshot, ck, deletedAt: Date.now() });
      }
      const changeId = push(ref(db, `classes/${state.curYear}/${ck}/adminChanges`)).key!;
      const change = buildAdminChangeEntry({ classKey: ck, teacher: snapshot.teacher,
        studentName: `명단 (${Object.keys(students).length}명)`, action: '명단 일괄 반영',
        changeSummary: `신규 ${plan.added}명 · 기존 연결 ${plan.retained}명 · 제외 ${plan.removed}명`, actor: adminActor(state.userRole) });
      const target = ref(db, `classes/${state.curYear}/${ck}`);
      await get(target);
      const result = await runTransaction(target, current => sameStoredValue(current, snapshot) ? {
        ...current, students, adminChanges: { ...current.adminChanges, [changeId]: change },
      } : undefined, { applyLocally: false });
      if (!result.committed) { setPreview(null); throw new Error('미리보기 이후 명단이 변경되었습니다. 입력은 유지됩니다. 새 미리보기를 만들어 주세요.'); }
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '반영하지 못했습니다. 입력은 유지됩니다. 연결 상태를 확인해 주세요.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <ManagementDialog title="명단 일괄 입력" description={`${state.curPart}부 ${state.curGrade}학년 ${state.curClass}반 · 기존 학생의 ID와 출석 연결을 보존합니다.`}
    busy={busy} dirty={Boolean(text)} onClose={onClose}>{dismiss => <>
    {error && <p className="management-error" role="alert">{error}</p>}
    <fieldset disabled={busy} style={{ border: 0, minWidth: 0 }}>
      <div className="form-field"><label className="form-label" htmlFor="roster-file">CSV 파일 불러오기</label><input id="roster-file" type="file" accept=".csv,text/csv" onChange={readFile} className="management-file-input" /></div>
      <div className="form-field"><label className="form-label" htmlFor="roster-text">학생 명단</label>
        <textarea id="roster-text" className="form-input" rows={6} value={text} onChange={event => changeText(event.target.value)} placeholder={'이름, 생년월일, 연락처\n예: 홍길동, 2010-01-01, 010-0000-0000'} />
        <p className="management-hint">한 줄에 한 명씩 입력합니다. CSV의 이름·생년월일·연락처 열 또는 탭으로 구분한 목록을 사용할 수 있습니다.</p></div>
      <div className="form-field"><label className="form-label" htmlFor="roster-mode">반영 방식</label>
        <select id="roster-mode" className="form-input" value={mode} onChange={event => { setMode(event.target.value as 'append' | 'replace'); setPreview(null); setConfirmed(false); }}>
          <option value="append">기존 명단 유지하고 새 학생 추가</option><option value="replace">입력한 명단으로 교체</option></select></div>
      <button className="btn-secondary" onClick={makePreview}>최신 명단과 비교하기</button>
    </fieldset>
    {preview && <section aria-label="명단 반영 미리보기" className="management-status">
      <strong>신규 {preview.plan.added}명 · 기존 연결 {preview.plan.retained}명 · 제외 {preview.plan.removed}명</strong>
      <p className="management-hint">기존 학생의 개인정보는 일괄 입력으로 바꾸지 않습니다. 정보 수정은 학생 수정에서 처리해 주세요.</p>
      <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 12 }} tabIndex={0} aria-label="반영 후 학생 목록"><ol style={{ paddingLeft: 24 }}>{Object.values(preview.plan.students).map(student => <li key={student.id}>{student.name}</li>)}</ol></div>
      {mode === 'replace' && <label className="management-hint" style={{ display: 'flex', gap: 10, marginTop: 16 }}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
        <span>기존 명단을 삭제 목록에 보관한 후 교체합니다. 제외 학생은 현재 명단에서 빠지며, 출석 기록은 삭제하지 않습니다. 복원은 같은 반이 없는 경우에만 가능합니다.</span></label>}
    </section>}
    <div className="btn-row"><button className="btn-secondary" disabled={busy} onClick={dismiss}>취소</button>
      <button className="btn-primary" disabled={busy || !preview || (mode === 'replace' && !confirmed)} onClick={apply}>{busy ? '처리 중…' : '확인한 명단 반영'}</button></div>
  </>}</ManagementDialog>;
}
