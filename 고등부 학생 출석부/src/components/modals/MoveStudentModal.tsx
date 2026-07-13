'use client';
import { useState } from 'react';
import { db, ref, update } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { showToast } from '@/utils/toast';
import type { MoveTarget } from '@/types';

export default function MoveStudentModal({ target, onClose }: { target: MoveTarget; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const { classData, curYear } = state;
  const student = classData[target.fromCk]?.students.find(s => s.id === target.sid);

  const [toPart, setToPart]   = useState(target.fromCk.split('-')[0]);
  const [toGrade, setToGrade] = useState(target.fromCk.split('-')[1]);
  const [toClass, setToClass] = useState('');
  const [saving, setSaving] = useState(false);

  const toCk = toClass ? `${toPart}-${toGrade}-${toClass}` : '';

  async function handleMove() {
    if (!toCk || toCk === target.fromCk) { showToast('다른 반을 선택하세요.'); return; }
    if (!student) return;
    setSaving(true);

    // 단일 학생만 이동 — 두 반 명단을 통째로 덮어쓰지 않아 동시 편집 충돌 방지.
    // (번호 num은 읽을 때 sortAndRenumber로 재계산됨)
    try {
      await update(ref(db), {
        [`classes/${curYear}/${target.fromCk}/students/${target.sid}`]: null,
        [`classes/${curYear}/${toCk}/students/${target.sid}`]: { ...student },
      });
      dispatch({ type: 'SET_CLASS', payload: toClass });
    } catch {
      showToast('학생 이동에 실패했습니다. 다시 시도해 주세요.');
      setSaving(false);
      return; // 실패 시 모달 유지
    }
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay center-modal" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      role="dialog" aria-modal="true" aria-label="학생 이동">
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-title">학생 이동</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
          <strong>{student?.name}</strong>을(를) 다른 반으로 이동합니다.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select className="form-select" style={{ flex: 1 }} value={toPart} onChange={e => setToPart(e.target.value)}>
            <option value="1">1부</option>
            <option value="2">2부</option>
          </select>
          <select className="form-select" style={{ flex: 1 }} value={toGrade} onChange={e => setToGrade(e.target.value)}>
            {[1,2,3].map(g => <option key={g} value={String(g)}>{g}학년</option>)}
          </select>
          <select className="form-select" style={{ flex: 1 }} value={toClass} onChange={e => setToClass(e.target.value)}>
            <option value="">반 선택</option>
            {Object.keys(classData)
              .filter(ck => ck.startsWith(`${toPart}-${toGrade}-`) && ck !== target.fromCk)
              .sort()
              .map(ck => {
                const c = ck.split('-')[2];
                const t = classData[ck]?.teacher;
                return <option key={ck} value={c}>{c}반{t ? ` · ${t}` : ''}</option>;
              })}
          </select>
        </div>
        <div className="btn-row">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>취소</button>
          <button className="btn-primary" onClick={handleMove} disabled={!toCk || saving}>
            {saving ? '이동 중...' : '이동'}
          </button>
        </div>
      </div>
    </div>
  );
}
