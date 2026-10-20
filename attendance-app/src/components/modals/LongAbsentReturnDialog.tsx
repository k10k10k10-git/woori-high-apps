'use client';
import { useEffect, useRef, useState } from 'react';
import { useApp, isDataReady } from '@/store/AppContext';
import { returnLongAbsentStudent } from '@/lib/longAbsentReturn';
import { adminActor } from '@/utils/adminChange';
import { showToast } from '@/utils/toast';
import type { Student } from '@/types';
import ManagementDialog from './ManagementDialog';

export type LongAbsentReturnTarget = { year: number; classKey: string; revision: number; student: Student; nextJang?: boolean };

export default function LongAbsentReturnDialog({ target, onClose }: { target: LongAbsentReturnTarget; onClose: () => void }) {
  const { getState } = useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [part, grade, cls] = target.classKey.split('-');
  const designate = target.nextJang === true;
  const isCurrent = () => {
    const state = getState();
    return active.current && state.userRole?.role === 'admin' && state.curYear === target.year
      && state.dataRevision === target.revision && isDataReady(state);
  };
  async function restore() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await returnLongAbsentStudent({ ...target, actor: adminActor(getState().userRole) }, isCurrent);
      if (isCurrent()) { showToast(designate ? '장결자로 지정했습니다. 기존 출석 이력은 유지됩니다.' : '일반 명단으로 복귀했습니다. 기존 출석 이력은 유지됩니다.', 'success'); onClose(); }
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : '상태 변경 결과를 확인하지 못했습니다. 현재 명단을 다시 확인해 주세요.');
    } finally { busy.current = false; if (active.current) setSaving(false); }
  }
  return <ManagementDialog title={designate ? '장결자로 지정' : '일반 명단 복귀'} description={`${target.year}년 · ${part}부 ${grade}학년 ${cls}반 · ${target.student.name}`} busy={saving} onClose={onClose}>{dismiss => <>
    <p className="management-hint">{designate ? '장결자로 지정하면 이 학생은 일반 출석 체크 명단에서 빠지고 같은 반의 장결자 목록에 표시됩니다. 전체 학생 명단에서 다시 일반 명단으로 복귀할 수 있습니다.' : '장결 상태를 해제하면 이 학생이 해당 반의 출석 체크 명단에 다시 표시됩니다.'} 학생 정보와 기존 출석 이력은 그대로 유지하며, 과거 출석을 자동으로 수정하지 않습니다.</p>
    {error && <p className="management-error" role="alert">{error}</p>}
    {saving && <p className="management-status" role="status">{designate ? '장결자로 지정하는 중입니다.' : '일반 명단으로 복귀하는 중입니다.'}</p>}
    <div className="btn-row"><button type="button" className="btn-primary" disabled={saving} onClick={() => void restore()}>{saving ? (designate ? '지정 중…' : '복귀 중…') : (designate ? '장결자로 지정' : '일반 명단으로 복귀')}</button><button type="button" className="btn-secondary" disabled={saving} onClick={dismiss}>취소</button></div>
  </>}</ManagementDialog>;
}
