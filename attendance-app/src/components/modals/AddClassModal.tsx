'use client';
import { useRef, useState } from 'react';
import { db, ref, get, runTransaction } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { restoreMissingClass } from '@/utils/studentPersistence';
import ManagementDialog from './ManagementDialog';

export default function AddClassModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp();
  const { curPart, curGrade, curYear } = state;
  const [classNum, setClassNum] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  async function handleSave() {
    if (busyRef.current) return;
    const input = classNum.trim();
    if (!/^\d+$/.test(input) || !Number.isSafeInteger(Number(input)) || Number(input) < 1) {
      setError('반 번호는 1 이상의 정수로 입력해 주세요.'); return;
    }
    const num = String(Number(input));
    const ck = `${curPart}-${curGrade}-${num}`;
    if (state.classData[ck]) { setError('이미 존재하는 반입니다. 다른 반 번호를 입력해 주세요.'); return; }
    busyRef.current = true; setSaving(true); setError(null);
    try {
      const target = ref(db, `classes/${curYear}/${ck}`);
      await get(target);
      const result = await runTransaction(target, current => restoreMissingClass(current, {
        teacher: teacherName.trim() || '', students: {},
      }), { applyLocally: false });
      if (!result.committed) { setError('다른 작업에서 같은 반을 추가했습니다. 다른 번호를 입력해 주세요.'); return; }
      dispatch({ type: 'SET_CLASS', payload: num });
      onClose();
    } catch { setError('반을 추가하지 못했습니다. 입력 내용은 유지됩니다. 연결을 확인하고 다시 시도해 주세요.'); }
    finally { busyRef.current = false; setSaving(false); }
  }
  return <ManagementDialog title="반 추가" description={`${curYear}년 ${curPart}부 ${curGrade}학년에 새 반을 추가합니다.`}
    busy={saving} dirty={Boolean(classNum || teacherName)} onClose={onClose}>{dismiss => <>
    {error && <p role="alert" className="management-error">{error}</p>}
    <fieldset disabled={saving} style={{ border: 0, minWidth: 0 }}>
      <div className="form-field"><label className="form-label" htmlFor="new-class-number">반 번호 *</label>
        <input id="new-class-number" className="form-input" inputMode="numeric" value={classNum} onChange={event => setClassNum(event.target.value)} placeholder="예: 4" /></div>
      <div className="form-field"><label className="form-label" htmlFor="new-class-teacher">담당 교사</label>
        <input id="new-class-teacher" className="form-input" value={teacherName} onChange={event => setTeacherName(event.target.value)} placeholder="나중에 입력할 수 있습니다" /></div>
    </fieldset>
    <div className="btn-row"><button className="btn-secondary" onClick={dismiss} disabled={saving}>취소</button>
      <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '추가 중…' : '반 추가'}</button></div>
  </>}</ManagementDialog>;
}
