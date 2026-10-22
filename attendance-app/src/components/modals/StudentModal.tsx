'use client';
import { useRef, useState } from 'react';
import { runManagementSave, ManagementSaveError } from '@/lib/managementSave';
import { useManagementScope } from '@/hooks/useManagementScope';
import { compressImage } from '@/utils/image';
import { createPersonId, findHistoricalStudentPersonId } from '@/utils/personId';
import {
  adminActor,
  buildAdminChangeEntry,
  describeStudentFieldChanges,
} from '@/utils/adminChange';
import ManagementDialog from './ManagementDialog';
import { archiveRoster } from '@/lib/rosterRecovery';
import { editStudent, mergeStudentEdit, sameStoredValue } from '@/utils/studentPersistence';
import { assertNoNewStudentDuplicates, type DuplicateRoster } from '@/utils/studentDuplicates';
import type { Student } from '@/types';

export default function StudentModal({
  editId,
  onClose,
}: {
  editId: string | null;
  onClose: () => void;
}) {
  const { state, year, classKey: ck, isCurrent, active } = useManagementScope();
  const students = state.classData[ck]?.students ?? [];
  const student = editId ? students.find(s => s.id === editId) : null;

  const [opened] = useState(() => student ? structuredClone(student) : null);
  const [id] = useState(() => editId ?? `s_${crypto.randomUUID()}`);
  const [changeId] = useState(() => crypto.randomUUID());
  const personIdRef = useRef(opened?.personId ?? '');
  const submitted = useRef<{ values: string; student: Student } | null>(null);
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

    // 최신 반을 기준으로 대상 학생과 감사 기록을 함께 갱신한다.
    // 다른 학생 및 장결·번호 등 편집 폼 밖 필드는 트랜잭션 재시도에서도 보존한다.
    try {
      await runManagementSave(isCurrent, async session => {
        if (!personIdRef.current) {
          const history = await session.read('classes');
          personIdRef.current = findHistoricalStudentPersonId({ name, birth, phone }, [history.value ?? {}], { year, classKey: ck }) ?? createPersonId('student');
        }
        const path = `classes/${year}/${ck}`;
        const snapshot = await session.read<{ students?: Record<string, Student>; teacher?: string; adminChanges?: Record<string, unknown> } | null>(path);
        const current = snapshot.value;
        if (!current) throw new ManagementSaveError('conflict', '반이 삭제·변경되었습니다. 현재 명단에서 다시 열어 주세요.');
        const raw = current.students?.[id] as Student | undefined;
        const latest = raw ? { ...raw, id } : undefined;
        const values = { name, birth, phone, pphone, school, addr, photo };
        const valuesKey = JSON.stringify(values);
        if (submitted.current?.values === valuesKey && current.adminChanges?.[changeId] && latest
          && mergeStudentEdit(latest, submitted.current.student, submitted.current.student)) return;
        if ((editId && !latest) || (!editId && latest)) throw new ManagementSaveError('conflict', '명단이 변경되었습니다. 현재 명단에서 학생을 확인한 뒤 다시 열어 주세요.');
        const next = latest && opened ? mergeStudentEdit(latest, opened, values) : editStudent(latest, id, personIdRef.current, values);
        if (!next) throw new ManagementSaveError('conflict', '다른 작업에서 같은 정보를 수정했습니다. 입력은 유지됩니다. 현재 명단을 확인한 뒤 다시 열어 주세요.');
        next.personId ||= personIdRef.current;
        if (raw && sameStoredValue(raw, next)) return;
        const roster = await session.read<DuplicateRoster | null>(`classes/${year}`);
        try { assertNoNewStudentDuplicates(next, roster.value ?? {}, { classKey: ck, studentId: id }, latest); }
        catch (cause) { throw new ManagementSaveError('conflict', cause instanceof Error ? cause.message : '같은 학생의 기존 등록을 확인해 주세요.'); }
        const changedFields = latest ? describeStudentFieldChanges(latest, next) : [];
        const result = {
          ...current,
          students: { ...current.students, [id]: next },
          adminChanges: { ...current.adminChanges, [changeId]: buildAdminChangeEntry({
              classKey: ck, teacher: current.teacher, student: next,
              action: latest ? '학생 정보 수정' : '학생 등록',
              changeSummary: latest ? changedFields.join(' · ') || '학생 연결 정보 보완' : '출석부에 학생 신규 등록',
              actor: adminActor(state.userRole), now: new Date(),
            }) },
        };
        submitted.current = { values: valuesKey, student: structuredClone(next) };
        await session.write(path, snapshot.etag, result);
      });
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : '저장 결과를 확인하지 못했습니다. 현재 명단을 확인해 주세요.');
      return;
    } finally { busyRef.current = false; if (active.current) setSaving(false); }
    if (isCurrent()) onClose();
  }

  async function handleDelete() {
    if (!editId || busyRef.current || photoBusy) return;
    if (!opened) { setError('학생 연결을 확인하지 못했습니다. 현재 명단에서 다시 열어 주세요.'); return; }
    busyRef.current = true;
    setError(null);
    setDeleteConfirm(false);
    setSaving(true);
    try {
      await archiveRoster({ year, classKey: ck, studentId: editId,
        openedStudent: opened, actor: adminActor(state.userRole) }, isCurrent);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : '삭제 결과를 확인하지 못했습니다. 현재 명단과 복구 사본을 확인해 주세요.');
      return;
    } finally { busyRef.current = false; if (active.current) setSaving(false); }
    if (isCurrent()) onClose();
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
