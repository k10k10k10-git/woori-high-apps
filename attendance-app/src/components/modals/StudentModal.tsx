'use client';
import { useRef, useState } from 'react';
import { db, ref, get, push, runTransaction } from '@/lib/db';
import { useApp, useClassKey } from '@/store/AppContext';
import { compressImage } from '@/utils/image';
import { createPersonId, findHistoricalStudentPersonId } from '@/utils/personId';
import {
  adminActor,
  buildAdminChangeEntry,
  describeStudentFieldChanges,
} from '@/utils/adminChange';
import ManagementDialog from './ManagementDialog';
import { archiveRoster } from '@/lib/rosterRecovery';
import { editStudent, mergeStudentEdit } from '@/utils/studentPersistence';
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

  const [opened] = useState(() => student ? structuredClone(student) : null);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
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
    if (!file || busyRef.current || photoBusy) return;
    setPhotoBusy(true);
    try {
      setPhoto(await compressImage(file));
    } catch {
      setError('이미지를 처리하지 못했습니다. 다른 사진을 선택해 주세요.');
    } finally { setPhotoBusy(false); }
  }

  async function handleSave() {
    if (busyRef.current || photoBusy) return;
    if (!name.trim()) { setError('학생 이름을 입력해 주세요.'); return; }
    busyRef.current = true;
    setError(null);
    setSaving(true);
    const id = editId ?? `s_${crypto.randomUUID()}`;

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
        const raw = current.students?.[id] as Student | undefined;
        const latest = raw ? { ...raw, id } : undefined;
        if ((editId && !latest) || (!editId && latest)) return undefined;
        const values = { name, birth, phone, pphone, school, addr, photo };
        const next = latest && opened ? mergeStudentEdit(latest, opened, values) : editStudent(latest, id, personId!, values);
        if (!next) return undefined;
        next.personId ||= personId!;
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
    } catch (cause) {
      setError(cause instanceof Error && cause.message.startsWith('명단이') ? '다른 작업에서 같은 정보를 수정했습니다. 입력 내용은 유지됩니다. 현재 명단을 확인한 뒤 다시 열어 주세요.' : '저장하지 못했습니다. 입력 내용은 유지됩니다. 연결을 확인하고 다시 저장해 주세요.');
      return;
    } finally { busyRef.current = false; setSaving(false); }
    onClose();
  }

  async function handleDelete() {
    if (!editId || busyRef.current || photoBusy) return;
    busyRef.current = true;
    setError(null);
    setDeleteConfirm(false);
    setSaving(true);
    try {
      await archiveRoster({ year: state.curYear, classKey: ck, studentId: editId,
        personId: opened?.personId, actor: adminActor(state.userRole) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '삭제 결과를 확인하지 못했습니다. 현재 명단과 복구 사본을 확인해 주세요.');
      return;
    } finally { busyRef.current = false; setSaving(false); }
    onClose();
  }

  const values = { name, birth, phone, pphone, school, addr, photo };
  const dirty = Object.entries(values).some(([key, value]) => value !== (opened?.[key as keyof typeof values] ?? ''));
  return <ManagementDialog title={editId ? '학생 수정' : '학생 추가'}
    description={`${state.curPart}부 ${state.curGrade}학년 ${state.curClass}반 · 학생 정보`}
    busy={saving || photoBusy} dirty={dirty} onClose={onClose}>{dismiss => <>
        {error && <p className="management-error" role="alert">{error}</p>}
        <fieldset disabled={saving || photoBusy} style={{ border: 0, minWidth: 0 }}>
        {/* 사진 */}
        <div className="photo-preview-wrap">
          {photo ? (
            <img src={photo} alt="사진" className="photo-preview" />
          ) : (
            <div className="photo-initial">{name.charAt(0) || '?'}</div>
          )}
          <div>
            <label className="form-label" htmlFor="photo-input">학생 사진</label>
            <input type="file" accept="image/*" id="photo-input" className="management-file-input" onChange={handlePhoto} />
            {photo && (
              <button onClick={() => setPhoto('')} style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)', border: 'none', background: 'none', cursor: 'pointer' }}>
                초기화
              </button>
            )}
          </div>
        </div>

        <div className="management-fields"><div className="form-field">
          <label className="form-label" htmlFor="student-name">이름 *</label>
          <input id="student-name" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="student-birth">생년월일</label>
          <input id="student-birth" className="form-input" value={birth} onChange={e => setBirth(e.target.value)} placeholder="2010-01-01" />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="student-phone">연락처</label>
          <input id="student-phone" className="form-input" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="student-pphone">부모님 연락처</label>
          <input id="student-pphone" className="form-input" type="tel" inputMode="tel" value={pphone} onChange={e => setPphone(e.target.value)} placeholder="010-0000-0000" />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="student-school">학교</label>
          <input id="student-school" className="form-input" value={school} onChange={e => setSchool(e.target.value)} placeholder="○○중학교" />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="student-addr">주소</label>
          <input id="student-addr" className="form-input" value={addr} onChange={e => setAddr(e.target.value)} />
        </div>

        </div></fieldset>
        {photoBusy && <p role="status" className="management-status">사진을 준비하고 있습니다.</p>}
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
              학생 명단은 복구 사본으로 보관합니다. 출석 기록은 유지되며, 같은 학생을 복원하면 다시 연결됩니다.
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
          <button className="btn-secondary" onClick={dismiss} disabled={saving || photoBusy}>취소</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || photoBusy}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
    </>}</ManagementDialog>;
}
