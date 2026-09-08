'use client';
import { useState } from 'react';
import { db, ref, get, push, runTransaction, update } from '@/lib/db';
import { useApp, useClassKey } from '@/store/AppContext';
import { showToast } from '@/utils/toast';
import { compressImage } from '@/utils/image';
import { createPersonId, findHistoricalStudentPersonId } from '@/utils/personId';
import {
  adminActor,
  adminChangePath,
  buildAdminChangeEntry,
  describeStudentFieldChanges,
} from '@/utils/adminChange';
import { editStudent } from '@/utils/studentPersistence';
import type { Student } from '@/types';

export default function StudentModal({
  editId,
  onClose,
}: {
  editId: string | null;
  onClose: () => void;
}) {
  const { state } = useApp();
  const ck = useClassKey(state);
  const students = state.classData[ck]?.students ?? [];
  const student = editId ? students.find(s => s.id === editId) : null;

  const [name, setName]     = useState(student?.name ?? '');
  const [birth, setBirth]   = useState(student?.birth ?? '');
  const [phone, setPhone]   = useState(student?.phone ?? '');
  const [pphone, setPphone] = useState(student?.pphone ?? '');
  const [school, setSchool] = useState(student?.school ?? '');
  const [addr, setAddr]     = useState(student?.addr ?? '');
  const [photo, setPhoto]       = useState(student?.photo ?? '');
  const [saving, setSaving]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await compressImage(file));
    } catch {
      showToast('이미지를 처리하지 못했습니다. 다른 사진을 시도해 주세요.');
    }
  }

  async function handleSave() {
    if (!name.trim()) { showToast('이름을 입력하세요.'); return; }
    setSaving(true);
    const id = editId ?? `s_${Date.now()}`;

    // 최신 반을 기준으로 대상 학생과 감사 기록을 함께 갱신한다.
    // 다른 학생 및 장결·번호 등 편집 폼 밖 필드는 트랜잭션 재시도에서도 보존한다.
    try {
      let personId = student?.personId;
      if (!personId) {
        const allClassesSnap = await get(ref(db, 'classes'));
        personId = findHistoricalStudentPersonId(
          { name, birth, phone },
          [allClassesSnap.exists() ? allClassesSnap.val() : {}],
          { year: state.curYear, classKey: ck },
        )
          ?? createPersonId('student');
      }
      const classRef = ref(db, `classes/${state.curYear}/${ck}`);
      await get(classRef);
      const changeId = push(ref(db, `classes/${state.curYear}/${ck}/adminChanges`)).key!;
      const changedAt = new Date();
      const result = await runTransaction(classRef, current => {
        if (!current) return undefined;
        const latest = current.students?.[id] as Student | undefined;
        if ((editId && !latest) || (!editId && latest)) return undefined;
        const next = editStudent(latest, id, personId!, { name, birth, phone, pphone, school, addr, photo });
        const changedFields = latest ? describeStudentFieldChanges(latest, next) : [];
        return {
          ...current,
          students: { ...current.students, [id]: next },
          ...(!latest || changedFields.length ? {
            adminChanges: { ...current.adminChanges, [changeId]: buildAdminChangeEntry({
              classKey: ck, teacher: current.teacher, student: next,
              action: latest ? '학생 정보 수정' : '학생 등록',
              changeSummary: latest ? changedFields.join(' · ') : '출석부에 학생 신규 등록',
              actor: adminActor(state.userRole), now: changedAt,
            }) },
          } : {}),
        };
      }, { applyLocally: false });
      if (!result.committed) throw new Error('명단이 변경되었습니다. 다시 확인해 주세요.');
    } catch {
      showToast('저장에 실패했습니다. 다시 시도해 주세요.');
      setSaving(false);
      return; // 실패 시 모달 유지
    }
    setSaving(false);
    onClose();
  }

  async function handleDelete() {
    if (!editId) return;
    setDeleteConfirm(false);
    setSaving(true);
    // 휴지통 보관 + 해당 학생/출석만 삭제 (원자적, 단일 경로)
    try {
      const changeId = push(ref(db, `classes/${state.curYear}/${ck}/adminChanges`)).key ?? `change_${Date.now()}`;
      await update(ref(db), {
        [`trash/${state.curYear}/students/${editId}`]: { ...student, ck, deletedAt: Date.now() },
        [`classes/${state.curYear}/${ck}/students/${editId}`]: null,
        [`attendance/${state.curYear}/${ck}/${editId}`]: null,
        [adminChangePath(state.curYear, ck, changeId)]: buildAdminChangeEntry({
          classKey: ck,
          teacher: state.classData[ck]?.teacher,
          student: student ?? { id: editId, name: '이름 미확인' },
          action: '학생 삭제',
          changeSummary: '출석부 명단 및 해당 학생 출석 기록 삭제',
          actor: adminActor(state.userRole),
        }),
      });
    } catch {
      showToast('삭제에 실패했습니다. 다시 시도해 주세요.');
      setSaving(false);
      return; // 실패 시 모달 유지
    }
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      role="dialog" aria-modal="true" aria-label={editId ? '학생 수정' : '학생 추가'}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">{editId ? '학생 수정' : '학생 추가'}</div>

        {/* 사진 */}
        <div className="photo-preview-wrap">
          {photo ? (
            <img src={photo} alt="사진" className="photo-preview" />
          ) : (
            <div className="photo-initial">{name.charAt(0) || '?'}</div>
          )}
          <div>
            <input type="file" accept="image/*" id="photo-input" style={{ display: 'none' }} onChange={handlePhoto} />
            <label htmlFor="photo-input" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--primary)', padding: '6px 12px', border: '1.5px solid var(--primary)', borderRadius: 'var(--radius)', display: 'inline-block' }}>
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
          <label className="form-label">이름 *</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" />
        </div>
        <div className="form-field">
          <label className="form-label">생년월일</label>
          <input className="form-input" value={birth} onChange={e => setBirth(e.target.value)} placeholder="2010-01-01" />
        </div>
        <div className="form-field">
          <label className="form-label">연락처</label>
          <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" />
        </div>
        <div className="form-field">
          <label className="form-label">부모님 연락처</label>
          <input className="form-input" value={pphone} onChange={e => setPphone(e.target.value)} placeholder="010-0000-0000" />
        </div>
        <div className="form-field">
          <label className="form-label">학교</label>
          <input className="form-input" value={school} onChange={e => setSchool(e.target.value)} placeholder="○○중학교" />
        </div>
        <div className="form-field">
          <label className="form-label">주소</label>
          <input className="form-input" value={addr} onChange={e => setAddr(e.target.value)} />
        </div>

        {editId && deleteConfirm && (
          <div style={{
            margin: '0 0 10px',
            padding: '12px 14px',
            background: 'var(--red-bg)',
            border: '1.5px solid var(--red)',
            borderRadius: 'var(--radius)',
            fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, color: 'var(--red-text)', marginBottom: 8 }}>
              이 학생을 삭제할까요?
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
              최근 삭제 목록에 보관되며, 확인 후 복원하거나 영구 삭제할 수 있습니다.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-danger" style={{ padding: '6px 14px', fontSize: 12 }} onClick={handleDelete} disabled={saving}>삭제</button>
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setDeleteConfirm(false)}>취소</button>
            </div>
          </div>
        )}
        <div className="btn-row">
          {editId && !deleteConfirm && (
            <button className="btn-danger" onClick={() => setDeleteConfirm(true)} disabled={saving}>삭제</button>
          )}
          <button className="btn-secondary" onClick={onClose} disabled={saving}>취소</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
