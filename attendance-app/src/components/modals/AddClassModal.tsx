'use client';
import { useState } from 'react';
import { db, ref, set } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { showToast } from '@/utils/toast';

export default function AddClassModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp();
  const { curPart, curGrade, curYear } = state;
  const [classNum, setClassNum] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const num = classNum.trim();
    if (!num) { showToast('반 번호를 입력하세요.'); return; }
    const ck = `${curPart}-${curGrade}-${num}`;
    if (state.classData[ck]) { showToast('이미 존재하는 반입니다.'); return; }
    setSaving(true);
    try {
      await set(ref(db, `classes/${curYear}/${ck}`), {
        teacher: teacherName.trim() || '',
        students: {},
      });
      dispatch({ type: 'SET_CLASS', payload: num });
    } catch {
      showToast('반 추가에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <div className="modal-overlay center-modal" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      role="dialog" aria-modal="true" aria-label="반 추가">
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-title">반 추가</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
          {curPart}부 {curGrade}학년에 새 반을 추가합니다.
        </div>
        <div className="form-field">
          <label className="form-label">반 번호 *</label>
          <input
            className="form-input"
            type="number"
            min="1"
            value={classNum}
            onChange={e => setClassNum(e.target.value)}
            placeholder="예: 4"
          />
        </div>
        <div className="form-field">
          <label className="form-label">담당 교사</label>
          <input
            className="form-input"
            value={teacherName}
            onChange={e => setTeacherName(e.target.value)}
            placeholder="홍길동 교사"
          />
        </div>
        <div className="btn-row">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>취소</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '추가 중...' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}
