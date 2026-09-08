'use client';
import { useRef, useState } from 'react';
import { db, ref, get, runTransaction } from '@/lib/db';
import { useApp, useClassKey } from '@/store/AppContext';
import { compressImage } from '@/utils/image';
import ManagementDialog from './ManagementDialog';

export default function TeacherModal({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const ck = useClassKey(state);
  const [opened] = useState(() => ({ name: state.classData[ck]?.teacher ?? '', photo: state.classData[ck]?.teacherPhoto ?? '' }));
  const [name, setName] = useState(opened.name);
  const [photo, setPhoto] = useState(opened.photo);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || photoBusy || busyRef.current) return;
    setPhotoBusy(true);
    try { setPhoto(await compressImage(file)); }
    catch { setError('사진을 처리하지 못했습니다. 다른 사진을 선택해 주세요.'); }
    finally { setPhotoBusy(false); }
  }
  async function handleSave() {
    if (busyRef.current || photoBusy) return;
    busyRef.current = true;
    setSaving(true); setError(null);
    try {
      const classRef = ref(db, `classes/${state.curYear}/${ck}`);
      await get(classRef);
      const result = await runTransaction(classRef, current => {
        if (!current) return undefined;
        const next = { ...current };
        for (const [key, before, value] of [['teacher', opened.name, name.trim()], ['teacherPhoto', opened.photo, photo]]) {
          if (before === value) continue;
          if ((current[key] ?? '') !== before && (current[key] ?? '') !== value) return undefined;
          next[key] = value || null;
        }
        return next;
      }, { applyLocally: false });
      if (!result.committed) { setError('반 또는 교사 정보가 다른 작업에서 변경되었습니다. 입력 내용은 유지됩니다. 현재 명단을 확인해 주세요.'); return; }
      onClose();
    } catch { setError('저장하지 못했습니다. 입력 내용은 유지됩니다. 연결을 확인하고 다시 저장해 주세요.'); }
    finally { busyRef.current = false; setSaving(false); }
  }
  return <ManagementDialog title="교사 정보 수정" description={`${state.curPart}부 ${state.curGrade}학년 ${state.curClass}반 담당 교사`}
    busy={saving || photoBusy} dirty={name !== opened.name || photo !== opened.photo} onClose={onClose}>{dismiss => <>
    {error && <p role="alert" className="management-error">{error}</p>}
    <fieldset disabled={saving || photoBusy} style={{ border: 0, minWidth: 0 }}>
      <div className="photo-preview-wrap">
        {photo && <img src={photo} alt="교사 사진 미리보기" className="photo-preview" />}
        <div><label className="form-label" htmlFor="teacher-photo-input">교사 사진</label>
          <input type="file" accept="image/*" id="teacher-photo-input" onChange={handlePhoto} className="management-file-input" />
          {photo && <button type="button" className="btn-secondary" onClick={() => setPhoto('')}>사진 지우기</button>}
        </div>
      </div>
      <div className="form-field"><label className="form-label" htmlFor="teacher-name">교사 이름</label>
        <input id="teacher-name" className="form-input" value={name} onChange={event => setName(event.target.value)} placeholder="담당 교사 이름" />
      </div>
    </fieldset>
    {photoBusy && <p role="status" className="management-status">사진을 준비하고 있습니다.</p>}
    <div className="btn-row"><button className="btn-secondary" onClick={dismiss} disabled={saving || photoBusy}>취소</button>
      <button className="btn-primary" onClick={handleSave} disabled={saving || photoBusy}>{saving ? '저장 중…' : '교사 정보 저장'}</button></div>
  </>}</ManagementDialog>;
}
