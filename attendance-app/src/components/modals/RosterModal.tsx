'use client';
import { useRef, useState } from 'react';
import { ManagementSaveError, runManagementSave } from '@/lib/managementSave';
import { useManagementScope } from '@/hooks/useManagementScope';
import { createPersonId, findHistoricalStudentPersonId } from '@/utils/personId';
import { adminActor, buildAdminChangeEntry } from '@/utils/adminChange';
import { sameStoredValue } from '@/utils/studentPersistence';
import { parseRosterInput, planRosterImport } from '@/utils/rosterImport';
import { trashRecordKey } from '@/utils/trash';
import { assertNoNewStudentDuplicates, type DuplicateRoster } from '@/utils/studentDuplicates';
import ManagementDialog from './ManagementDialog';
import type { Student } from '@/types';

type ClassSnapshot = { students?: Record<string, Student>; teacher?: string; adminChanges?: Record<string, unknown> };
type Preview = { plan: ReturnType<typeof planRosterImport>; snapshot: ClassSnapshot; operationId: string; deletedAt: number };

function checkDuplicates(students: Record<string, Student>, current: ClassSnapshot, roster: DuplicateRoster, ck: string) {
  const proposed = { ...roster, [ck]: { ...roster[ck], students } };
  try {
    for (const [id, student] of Object.entries(students)) {
      // 교체에서 제외될 기존 학생도 검사해, 표기 차이로 새 ID가 생겨 출석 연결이 끊기지 않게 한다.
      assertNoNewStudentDuplicates(student, roster, { classKey: ck, studentId: id }, current.students?.[id]);
      assertNoNewStudentDuplicates(student, proposed, { classKey: ck, studentId: id }, current.students?.[id]);
    }
  } catch (cause) {
    throw new ManagementSaveError('conflict', cause instanceof Error ? cause.message : '같은 학생의 기존 등록을 확인해 주세요.');
  }
}
export default function RosterModal({ onClose }: { onClose: () => void }) {
  const { state, year, classKey: ck, active, isCurrent } = useManagementScope();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const submitted = useRef<{ operationId: string; students: Record<string, Student> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  function changeText(value: string) { setText(value); setPreview(null); setConfirmed(false); setError(null); }
  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || busyRef.current) return;
    if (file.size > 2 * 1024 * 1024) { setError('CSV 파일은 2MB 이하로 나누어 주세요.'); return; }
    busyRef.current = true; setBusy(true);
    try { const value = await file.text(); if (isCurrent()) changeText(value); }
    catch { if (active.current) setError('파일을 읽지 못했습니다. UTF-8 CSV 파일을 다시 선택해 주세요.'); }
    finally { busyRef.current = false; if (active.current) setBusy(false); }
  }
  async function makePreview() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setPreview(null); setConfirmed(false);
    try {
      const rows = parseRosterInput(text);
      if (!rows.length) throw new Error('학생 이름을 한 줄에 한 명씩 입력해 주세요.');
      await runManagementSave(isCurrent, async session => {
        const { value } = await session.read<Record<string, ClassSnapshot> | null>(`classes/${year}`);
        const roster = value ?? {}, snapshot = roster[ck];
        if (!snapshot) throw new ManagementSaveError('conflict', '반이 없습니다. 먼저 반을 추가해 주세요.');
        const operationId = crypto.randomUUID();
        let plan: ReturnType<typeof planRosterImport>;
        try { plan = planRosterImport(rows, snapshot.students ?? {}, mode, operationId); }
        catch (cause) { throw new ManagementSaveError('conflict', cause instanceof Error ? cause.message : '입력한 명단을 확인해 주세요.'); }
        checkDuplicates(plan.students, snapshot, roster, ck);
        session.check();
        setPreview({ plan, snapshot, operationId, deletedAt: Date.now() });
      });
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '미리보기를 만들지 못했습니다. 연결을 확인해 주세요.'); }
    finally { busyRef.current = false; if (active.current) setBusy(false); }
  }
  async function apply() {
    if (!preview || busyRef.current || (mode === 'replace' && !confirmed)) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const { plan, snapshot, operationId } = preview;
      await runManagementSave(isCurrent, async session => {
        const history = Object.values(plan.students).some(student => !student.personId)
          ? (await session.read<Record<string, unknown> | null>('classes')).value ?? {} : {};
        const roster = (await session.read<Record<string, ClassSnapshot> | null>(`classes/${year}`)).value ?? {};
        const current = roster[ck];
        if (submitted.current?.operationId === operationId && current?.adminChanges?.[operationId]
          && sameStoredValue(current.students, submitted.current.students)) return;
        if (!current || !sameStoredValue(current, snapshot)) {
          setPreview(null);
          throw new ManagementSaveError('conflict', '미리보기 이후 명단이 변경되었습니다. 입력은 유지됩니다. 새 미리보기를 만들어 주세요.');
        }
        const students = submitted.current?.operationId === operationId ? submitted.current.students
          : Object.fromEntries(Object.entries(plan.students).map(([id, student]) => [id, student.personId ? student : {
            ...student, personId: findHistoricalStudentPersonId(student, [{ ...history, [year]: roster }], { year, classKey: ck, allowSameYearClassMatch: true }) ?? createPersonId('student'),
          }]));
        checkDuplicates(students, snapshot, roster, ck);
        // 원래 반의 ETag를 따로 얻고, 미리보기와 최신 원장이 같은 경우에만 한 번 저장한다.
        const target = await session.read<ClassSnapshot | null>(`classes/${year}/${ck}`);
        if (!sameStoredValue(target.value, snapshot)) {
          setPreview(null);
          throw new ManagementSaveError('conflict', '미리보기 이후 명단이 변경되었습니다. 새 미리보기를 만들어 주세요.');
        }
        if (mode === 'replace' && Object.keys(snapshot.students ?? {}).length) {
          const path = `trash/${year}/classes/${trashRecordKey(ck, 'roster', operationId)}`;
          const backup = { ...snapshot, ck, deletedAt: preview.deletedAt };
          const saved = await session.read(path);
          if (saved.value === null) await session.write(path, saved.etag, backup);
          else if (!sameStoredValue(saved.value, backup)) throw new ManagementSaveError('conflict', '기존 명단 보관 상태가 변경되었습니다. 현재 자료를 확인해 주세요.');
        }
        const change = buildAdminChangeEntry({ classKey: ck, teacher: snapshot.teacher,
          studentName: `명단 (${Object.keys(students).length}명)`, action: '명단 일괄 반영',
          changeSummary: `신규 ${plan.added}명 · 기존 연결 ${plan.retained}명 · 제외 ${plan.removed}명`, actor: adminActor(state.userRole) });
        submitted.current = { operationId, students };
        await session.write(`classes/${year}/${ck}`, target.etag, {
          ...current, students, adminChanges: { ...current.adminChanges, [operationId]: change },
        });
      });
      if (isCurrent()) onClose();
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '반영하지 못했습니다. 입력은 유지됩니다. 연결 상태를 확인해 주세요.'); }
    finally { busyRef.current = false; if (active.current) setBusy(false); }
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
