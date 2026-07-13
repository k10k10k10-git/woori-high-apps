'use client';
import { useState } from 'react';
import { db, ref, update } from '@/lib/db';
import { useApp, useClassKey } from '@/store/AppContext';
import { showToast } from '@/utils/toast';

export default function TeacherModal({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const ck = useClassKey(state);
  const classInfo = state.classData[ck];

  const [name, setName] = useState(classInfo?.teacher ?? '');
  const [photo, setPhoto] = useState(classInfo?.teacherPhoto ?? '');
  const [saving, setSaving] = useState(false);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await update(ref(db, `classes/${state.curYear}/${ck}`), {
        teacher: name.trim() || null,
        teacherPhoto: photo || null,
      });
    } catch {
      showToast('저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      role="dialog" aria-modal="true" aria-label="교사 정보 수정">
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">교사 정보 수정</div>

        <div className="photo-preview-wrap">
          {photo ? (
            <img src={photo} alt="교사" className="photo-preview" />
          ) : (
            <div className="photo-initial">👤</div>
          )}
          <div>
            <input type="file" accept="image/*" id="teacher-photo-input" style={{ display: 'none' }} onChange={handlePhoto} />
            <label htmlFor="teacher-photo-input" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--primary)', padding: '6px 12px', border: '1.5px solid var(--primary)', borderRadius: 'var(--radius)', display: 'inline-block' }}>
              사진 선택
            </label>
            {photo && (
              <button onClick={() => setPhoto('')} style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)', border: 'none', background: 'none', cursor: 'pointer' }}>
                초기화
              </button>
            )}
          </div>
        </div>

        <div className="form-field">
          <label className="form-label">교사 이름</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="홍길동 교사" />
        </div>

        <div className="btn-row">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>취소</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
