'use client';
import { useEffect, useState } from 'react';
import { db, ref, get, set } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { showToast } from '@/utils/toast';

interface SpecialTeacher { title: string; name: string; phone: string; birth?: string; }
interface TeacherExtra   { title?: string; name?: string; phone?: string; birth?: string; }
interface StaffMember    { title: string; name: string; phone: string; birth?: string; }

const DEFAULT_SPECIALS: SpecialTeacher[] = [
  { title: '부장', name: '', phone: '' },
  { title: '회계', name: '', phone: '' },
  { title: '행정', name: '', phone: '' },
];

function sortClassKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const [pa, ga, ca] = a.split('-').map(Number);
    const [pb, gb, cb] = b.split('-').map(Number);
    if (pa !== pb) return pa - pb;
    if (ga !== gb) return ga - gb;
    return ca - cb;
  });
}

const tdCell: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const editBtnStyle: React.CSSProperties = { padding: '2px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' };

export default function TeacherManagement() {
  const { state } = useApp();
  const { classData, curYear } = state;

  const [teacherPart, setTeacherPart] = useState<'1' | '2' | 'staff'>('1');
  const [specialTeachers, setSpecialTeachers] = useState<SpecialTeacher[]>(DEFAULT_SPECIALS);
  const [teacherExtra, setTeacherExtra] = useState<Record<string, TeacherExtra>>({});
  const [staffList, setStaffList] = useState<Record<string, StaffMember>>({});
  const [additionalTeachers, setAdditionalTeachers] = useState<Record<string, StaffMember>>({});
  const [loadingTeachers, setLoadingTeachers] = useState(false);

  const [editingTeacher, setEditingTeacher] = useState<
    | { kind: 'special'; idx: number }
    | { kind: 'regular'; ck: string }
    | { kind: 'staff'; key: string | null }
    | { kind: 'additional'; key: string | null }
    | null
  >(null);
  const [teacherForm, setTeacherForm] = useState({ title: '', name: '', phone: '', birth: '' });
  const [deleteStaffConfirm, setDeleteStaffConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTeacherData(); }, [teacherPart, curYear]);

  async function loadTeacherData() {
    setLoadingTeachers(true);
    try {
      if (teacherPart === 'staff') {
        const staffSnap = await get(ref(db, `teacherStaff/${curYear}`));
        setStaffList(staffSnap.exists() ? (staffSnap.val() as Record<string, StaffMember>) : {});
      } else {
        const [specialSnap, extraSnap, phonesSnap, addSnap] = await Promise.all([
          get(ref(db, `teacherSpecial/${curYear}/${teacherPart}`)),
          get(ref(db, `teacherExtra/${curYear}/${teacherPart}`)),
          get(ref(db, `teacherPhones/${curYear}/${teacherPart}`)),
          get(ref(db, `teacherAdditional/${curYear}/${teacherPart}`)),
        ]);
        if (specialSnap.exists()) {
          const raw = specialSnap.val() as SpecialTeacher[];
          setSpecialTeachers([
            raw[0] ?? DEFAULT_SPECIALS[0],
            raw[1] ?? DEFAULT_SPECIALS[1],
            raw[2] ?? DEFAULT_SPECIALS[2],
          ]);
        } else {
          setSpecialTeachers([...DEFAULT_SPECIALS]);
        }
        const extra: Record<string, TeacherExtra> = extraSnap.exists() ? (extraSnap.val() as Record<string, TeacherExtra>) : {};
        if (phonesSnap.exists()) {
          const phones = phonesSnap.val() as Record<string, string>;
          for (const [k, phone] of Object.entries(phones)) {
            if (!extra[k]) extra[k] = {};
            if (!extra[k].phone) extra[k].phone = phone;
          }
        }
        setTeacherExtra(extra);
        setAdditionalTeachers(addSnap.exists() ? (addSnap.val() as Record<string, StaffMember>) : {});
      }
    } catch { /* ignore */ }
    setLoadingTeachers(false);
  }

  function openEditSpecial(idx: number) {
    const t = specialTeachers[idx];
    setTeacherForm({ title: t.title, name: t.name, phone: t.phone, birth: t.birth ?? '' });
    setEditingTeacher({ kind: 'special', idx });
  }

  function openEditRegular(ck: string) {
    const [, g, c] = ck.split('-');
    const key = ck.replace(/-/g, '_');
    const extra = teacherExtra[key] ?? {};
    setTeacherForm({
      title: extra.title ?? `${g}학년 ${c}반 담임`,
      name:  extra.name  ?? classData[ck]?.teacher ?? '',
      phone: extra.phone ?? '',
      birth: extra.birth ?? '',
    });
    setEditingTeacher({ kind: 'regular', ck });
  }

  function openEditStaff(key: string | null) {
    if (key && staffList[key]) {
      const s = staffList[key];
      setTeacherForm({ title: s.title, name: s.name, phone: s.phone, birth: s.birth ?? '' });
    } else {
      setTeacherForm({ title: '', name: '', phone: '', birth: '' });
    }
    setDeleteStaffConfirm(false);
    setEditingTeacher({ kind: 'staff', key });
  }

  function openEditAdditional(key: string | null) {
    if (key && additionalTeachers[key]) {
      const s = additionalTeachers[key];
      setTeacherForm({ title: s.title, name: s.name, phone: s.phone, birth: s.birth ?? '' });
    } else {
      setTeacherForm({ title: '', name: '', phone: '', birth: '' });
    }
    setDeleteStaffConfirm(false);
    setEditingTeacher({ kind: 'additional', key });
  }

  async function saveTeacher() {
    if (!editingTeacher || saving) return;
    setSaving(true);
    try {
      if (editingTeacher.kind === 'special') {
        const updated = specialTeachers.map((t, i) => i === editingTeacher.idx ? teacherForm : t);
        await set(ref(db, `teacherSpecial/${curYear}/${teacherPart}`), updated);
        setSpecialTeachers(updated);
      } else if (editingTeacher.kind === 'staff') {
        const staffKey = editingTeacher.key ?? `staff_${Date.now()}`;
        if (!teacherForm.name.trim()) { showToast('이름을 입력하세요.'); setSaving(false); return; }
        await set(ref(db, `teacherStaff/${curYear}/${staffKey}`), teacherForm);
        setStaffList(prev => ({ ...prev, [staffKey]: teacherForm }));
      } else if (editingTeacher.kind === 'additional') {
        const addKey = editingTeacher.key ?? `add_${Date.now()}`;
        if (!teacherForm.name.trim()) { showToast('이름을 입력하세요.'); setSaving(false); return; }
        await set(ref(db, `teacherAdditional/${curYear}/${teacherPart}/${addKey}`), teacherForm);
        setAdditionalTeachers(prev => ({ ...prev, [addKey]: teacherForm }));
      } else {
        const part = editingTeacher.ck.split('-')[0];
        const key = editingTeacher.ck.replace(/-/g, '_');
        await set(ref(db, `teacherExtra/${curYear}/${part}/${key}`), teacherForm);
        setTeacherExtra(prev => ({ ...prev, [key]: teacherForm }));
      }
      setEditingTeacher(null);
    } catch {
      showToast('저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteStaffOrAdditional() {
    if (!editingTeacher) return;
    const isStaff = editingTeacher.kind === 'staff' && editingTeacher.key;
    const isAdditional = editingTeacher.kind === 'additional' && editingTeacher.key;
    if (!isStaff && !isAdditional) return;
    setDeleteStaffConfirm(false);
    setSaving(true);
    try {
      if (isStaff) {
        await set(ref(db, `teacherStaff/${curYear}/${editingTeacher.key}`), null);
        setStaffList(prev => { const next = { ...prev }; delete next[editingTeacher.key!]; return next; });
      } else {
        await set(ref(db, `teacherAdditional/${curYear}/${teacherPart}/${editingTeacher.key}`), null);
        setAdditionalTeachers(prev => { const next = { ...prev }; delete next[editingTeacher.key!]; return next; });
      }
      setEditingTeacher(null);
    } catch {
      showToast('삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const partClassKeys = sortClassKeys(Object.keys(classData).filter(ck => ck.startsWith(`${teacherPart}-`)));

  const editTitle = editingTeacher
    ? (editingTeacher.kind === 'special'
        ? `${specialTeachers[editingTeacher.idx]?.title || ''} 정보 수정`
        : editingTeacher.kind === 'staff'
          ? (editingTeacher.key ? '스탭 정보 수정' : '스탭 추가')
          : editingTeacher.kind === 'additional'
            ? (editingTeacher.key ? '교사 정보 수정' : `${teacherPart}부 교사 추가`)
            : (() => { const [,g,c] = editingTeacher.ck.split('-'); return `${g}학년 ${c}반 담임 정보 수정`; })())
    : '';

  return (
    <>
      <div className="overall-card">
        <div className="overall-card-header">
          <span className="overall-card-title">교사 명단</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }} role="tablist" aria-label="교사 부서 선택">
            {(['1', '2'] as const).map(p => (
              <button key={p} role="tab" aria-selected={teacherPart === p} className={`view-btn${teacherPart === p ? ' active' : ''}`}
                onClick={() => setTeacherPart(p)}>{p}부</button>
            ))}
            <button role="tab" aria-selected={teacherPart === 'staff'} className={`view-btn${teacherPart === 'staff' ? ' active' : ''}`}
              onClick={() => setTeacherPart('staff')}>스탭</button>
            <button
              aria-label="교사 목록 새로고침"
              style={{ marginLeft: 4, padding: '4px 11px', fontSize: 11, borderRadius: 999, border: '1.5px solid var(--border2)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' }}
              onClick={loadTeacherData}
            >새로고침</button>
          </div>
        </div>

        {loadingTeachers ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>불러오는 중...</div>
        ) : teacherPart === 'staff' ? (
          <div>
            <div style={{ padding: '10px 16px 6px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => openEditStaff(null)} aria-label="스탭 추가">+ 스탭 추가</button>
            </div>
            {Object.keys(staffList).length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>등록된 스탭이 없습니다.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      {['직급/구분', '이름', '년생', '전화번호', ''].map(h => (
                        <th key={h} style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text2)', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(staffList).map(([key, s], i) => (
                      <tr key={key} style={{ background: i % 2 === 0 ? '#fff' : 'var(--surface2)' }}>
                        <td style={tdCell}><span style={{ color: 'var(--primary-text)', fontWeight: 600 }}>{s.title || '-'}</span></td>
                        <td style={{ ...tdCell, fontWeight: 500 }}>{s.name || '-'}</td>
                        <td style={{ ...tdCell, color: 'var(--text2)' }}>{s.birth || '-'}</td>
                        <td style={tdCell}>{s.phone || '-'}</td>
                        <td style={tdCell}>
                          <button onClick={() => openEditStaff(key)} style={editBtnStyle} aria-label={`${s.name} 스탭 정보 수정`}>수정</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  {['직급/구분', '이름', '년생', '부서', '전화번호', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text2)', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {specialTeachers.map((t, i) => (
                  <tr key={`sp-${i}`} style={{ background: i % 2 === 0 ? '#fff' : 'var(--surface2)' }}>
                    <td style={tdCell}><span style={{ color: 'var(--primary-text)', fontWeight: 600 }}>{t.title}</span></td>
                    <td style={{ ...tdCell, fontWeight: 500 }}>{t.name || '-'}</td>
                    <td style={{ ...tdCell, color: 'var(--text2)' }}>{t.birth || '-'}</td>
                    <td style={{ ...tdCell, color: 'var(--text2)' }}>{teacherPart}부</td>
                    <td style={tdCell}>{t.phone || '-'}</td>
                    <td style={tdCell}>
                      <button onClick={() => openEditSpecial(i)} style={editBtnStyle} aria-label={`${t.title} ${t.name || ''} 정보 수정`}>수정</button>
                    </td>
                  </tr>
                ))}
                {partClassKeys.map((ck, i) => {
                  const [p, g, c] = ck.split('-');
                  const key = ck.replace(/-/g, '_');
                  const extra = teacherExtra[key] ?? {};
                  const displayTitle = extra.title ?? `${g}학년 ${c}반 담임`;
                  const displayName  = extra.name  ?? classData[ck]?.teacher ?? '';
                  const displayPhone = extra.phone ?? '';
                  const displayBirth = extra.birth ?? '';
                  if (!displayName) return null;
                  const rowIdx = specialTeachers.length + i;
                  return (
                    <tr key={ck} style={{ background: rowIdx % 2 === 0 ? '#fff' : 'var(--surface2)' }}>
                      <td style={{ ...tdCell, color: 'var(--text2)' }}>{displayTitle}</td>
                      <td style={{ ...tdCell, fontWeight: 500 }}>{displayName}</td>
                      <td style={{ ...tdCell, color: 'var(--text2)' }}>{displayBirth || '-'}</td>
                      <td style={{ ...tdCell, color: 'var(--text2)' }}>{p}부</td>
                      <td style={{ ...tdCell, color: displayPhone ? 'var(--text)' : 'var(--text3)' }}>{displayPhone || '-'}</td>
                      <td style={tdCell}>
                        <button onClick={() => openEditRegular(ck)} style={editBtnStyle} aria-label={`${displayName} 담임 정보 수정`}>수정</button>
                      </td>
                    </tr>
                  );
                })}
                {Object.entries(additionalTeachers).map(([key, s], i) => {
                  const rowIdx = specialTeachers.length + partClassKeys.length + i;
                  return (
                    <tr key={key} style={{ background: rowIdx % 2 === 0 ? '#fff' : 'var(--surface2)' }}>
                      <td style={tdCell}><span style={{ color: 'var(--primary-text)', fontWeight: 600 }}>{s.title || '보조교사'}</span></td>
                      <td style={{ ...tdCell, fontWeight: 500 }}>{s.name || '-'}</td>
                      <td style={{ ...tdCell, color: 'var(--text2)' }}>{s.birth || '-'}</td>
                      <td style={{ ...tdCell, color: 'var(--text2)' }}>{teacherPart}부</td>
                      <td style={{ ...tdCell, color: s.phone ? 'var(--text)' : 'var(--text3)' }}>{s.phone || '-'}</td>
                      <td style={tdCell}>
                        <button onClick={() => openEditAdditional(key)} style={editBtnStyle} aria-label={`${s.name} 교사 정보 수정`}>수정</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: '10px 10px 4px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => openEditAdditional(null)} aria-label="교사 추가">+ 교사 추가</button>
            </div>
          </div>
        )}
      </div>

      {/* 교사/스탭 수정 모달 */}
      {editingTeacher && (
        <div className="modal-overlay center-modal" role="dialog" aria-modal="true" aria-label={editTitle}
          onClick={() => { setEditingTeacher(null); setDeleteStaffConfirm(false); }}
          onKeyDown={e => { if (e.key === 'Escape') { setEditingTeacher(null); setDeleteStaffConfirm(false); } }}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editTitle}</div>
            <div className="form-field">
              <label className="form-label">직급</label>
              {editingTeacher.kind === 'special' ? (
                <select className="form-select" value={teacherForm.title}
                  onChange={e => setTeacherForm(f => ({ ...f, title: e.target.value }))}>
                  <option value="부장">부장</option>
                  <option value="회계">회계</option>
                  <option value="행정">행정</option>
                </select>
              ) : (
                <input className="form-input" value={teacherForm.title}
                  onChange={e => setTeacherForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={editingTeacher.kind === 'staff' ? '예: 반주자, 영상, 음향' : editingTeacher.kind === 'additional' ? '예: 보조교사, 실습교사' : ''} />
              )}
            </div>
            <div className="form-field">
              <label className="form-label">이름</label>
              <input className="form-input" value={teacherForm.name}
                onChange={e => setTeacherForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="form-label">년생</label>
              <input className="form-input" value={teacherForm.birth}
                onChange={e => setTeacherForm(f => ({ ...f, birth: e.target.value }))}
                placeholder="예: 1990" />
            </div>
            <div className="form-field">
              <label className="form-label">전화번호</label>
              <input className="form-input" value={teacherForm.phone} placeholder="010-0000-0000"
                onChange={e => setTeacherForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            {(editingTeacher.kind === 'staff' || editingTeacher.kind === 'additional') && editingTeacher.key && deleteStaffConfirm && (
              <div style={{
                margin: '0 0 10px', padding: '12px 14px',
                background: 'var(--red-bg)', border: '1.5px solid var(--red)', borderRadius: 'var(--radius)', fontSize: 13,
              }}>
                <div style={{ fontWeight: 600, color: 'var(--red-text)', marginBottom: 8 }}>
                  {editingTeacher.kind === 'staff' ? '이 스탭을 삭제할까요?' : '이 교사를 삭제할까요?'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-danger" style={{ padding: '6px 14px', fontSize: 12 }} onClick={deleteStaffOrAdditional} disabled={saving}>삭제</button>
                  <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setDeleteStaffConfirm(false)}>취소</button>
                </div>
              </div>
            )}
            <div className="btn-row">
              {(editingTeacher.kind === 'staff' || editingTeacher.kind === 'additional') && editingTeacher.key && !deleteStaffConfirm && (
                <button type="button" className="btn-danger" onClick={() => setDeleteStaffConfirm(true)} disabled={saving}>삭제</button>
              )}
              <button type="button" className="btn-secondary" onClick={() => { setEditingTeacher(null); setDeleteStaffConfirm(false); }} disabled={saving}>취소</button>
              <button type="button" className="btn-primary" onClick={saveTeacher} disabled={saving}
                style={{ opacity: saving ? 0.6 : 1 }}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
