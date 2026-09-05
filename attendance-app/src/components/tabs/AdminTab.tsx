'use client';
import { useState, useEffect } from 'react';
import { db, ref, set, get, update } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { emailToKey } from '@/utils/dates';
import { showToast } from '@/utils/toast';
import SheetSyncSection from './SheetSyncSection';
import type { UserRole } from '@/types';

type PromotionRow = {
  fromCk: string;
  toCk: string;
  studentCount: number;
  hasConflict: boolean;
};
type GraduateRow = { ck: string; studentCount: number };


export default function AdminTab() {
  const { state, dispatch } = useApp();
  const { allUserRoles, curYear, dataRevision } = state;

  // 계정 모달
  const [accountModal, setAccountModal] = useState<{ open: boolean; editKey: string | null }>({ open: false, editKey: null });
  const [formEmail, setFormEmail]   = useState('');
  const [formRole, setFormRole]     = useState<'admin' | 'teacher'>('teacher');
  const [formPart, setFormPart]     = useState('1');
  const [formGrade, setFormGrade]   = useState('1');
  const [formClass, setFormClass]   = useState('1');
  const [saving, setSaving] = useState(false);

  // 이벤트
  const [evMonth, setEvMonth] = useState('');
  const [evDay, setEvDay]     = useState('');
  const [evLabel, setEvLabel] = useState('');
  const customEvents = state.customEventsData;

  // 진급 처리
  const [promotionRows, setPromotionRows]         = useState<PromotionRow[] | null>(null);
  const [graduateRows, setGraduateRows]           = useState<GraduateRow[]>([]);
  const [promotionLoading, setPromotionLoading]   = useState(false);
  const [promotionRunning, setPromotionRunning]   = useState(false);
  const [overwrite, setOverwrite]                 = useState(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const [confirmEventKey, setConfirmEventKey]     = useState<string | null>(null);

  function openAddAccount() {
    setFormEmail(''); setFormRole('teacher');
    setFormPart('1'); setFormGrade('1'); setFormClass('1');
    setAccountModal({ open: true, editKey: null });
  }

  function openEditAccount(key: string) {
    const r = allUserRoles[key];
    if (!r) return;
    setFormEmail((r as { email?: string }).email ?? key);
    setFormRole(r.role);
    setFormPart(r.part ?? '1');
    setFormGrade(r.grade ?? '1');
    setFormClass(r.class ?? '1');
    setAccountModal({ open: true, editKey: key });
  }

  async function loadAllRoles() {
    const snap = await get(ref(db, 'userRoles'));
    dispatch({ type: 'SET_ALL_USER_ROLES', revision: dataRevision, payload: snap.exists() ? snap.val() : {} });
  }

  async function saveAccount() {
    const email = formEmail.trim();
    if (!email) { showToast('이메일을 입력하세요.'); return; }
    setSaving(true);
    try {
      const key = accountModal.editKey || emailToKey(email);
      const data: Record<string, string> = { email, role: formRole };
      if (formRole === 'teacher') {
        data.part = formPart; data.grade = formGrade; data.class = formClass;
      }
      await set(ref(db, `userRoles/${key}`), data);
      await loadAllRoles();
      setAccountModal({ open: false, editKey: null });
    } catch {
      showToast('저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    if (!accountModal.editKey) return;
    setDeleteAccountConfirm(false);
    setSaving(true);
    try {
      await set(ref(db, `userRoles/${accountModal.editKey}`), null);
      await loadAllRoles();
      setAccountModal({ open: false, editKey: null });
    } catch {
      showToast('삭제에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function addEvent() {
    if (!evMonth || !evDay || !evLabel) { showToast('월, 일, 이름을 모두 입력하세요.'); return; }
    try {
      const key = `ev_${Date.now()}`;
      await set(ref(db, `events/${curYear}/${key}`), { month: evMonth, day: evDay, label: evLabel });
      setEvMonth(''); setEvDay(''); setEvLabel('');
    } catch {
      showToast('이벤트 추가에 실패했습니다.');
    }
  }

  async function deleteEvent(key: string) {
    setConfirmEventKey(null);
    try {
      await set(ref(db, `events/${curYear}/${key}`), null);
    } catch {
      showToast('이벤트 삭제에 실패했습니다.');
    }
  }

  // ─── 진급 처리 ───────────────────────────────────────────────
  async function loadPromotionPreview() {
    setPromotionLoading(true);
    setPromotionRows(null);
    const prevYear = curYear - 1;
    const [prevSnap, curSnap] = await Promise.all([
      get(ref(db, `classes/${prevYear}`)),
      get(ref(db, `classes/${curYear}`)),
    ]);
    if (!prevSnap.exists()) {
      showToast(`${prevYear}년 데이터가 없습니다.`);
      setPromotionLoading(false);
      return;
    }
    const prevData = prevSnap.val() as Record<string, { students?: Record<string, unknown> }>;
    const curData  = curSnap.exists()
      ? (curSnap.val() as Record<string, { students?: Record<string, unknown> }>)
      : {};

    const rows: PromotionRow[] = [];
    const grads: GraduateRow[] = [];

    for (const [ck, classInfo] of Object.entries(prevData)) {
      const [part, grade, cls] = ck.split('-');
      const gradeNum = parseInt(grade);
      const studentCount = Object.keys(classInfo.students ?? {}).length;
      if (studentCount === 0) continue;

      if (gradeNum === 3) {
        grads.push({ ck, studentCount });
        continue;
      }
      const toCk = `${part}-${gradeNum + 1}-${cls}`;
      const hasConflict = Object.keys(curData[toCk]?.students ?? {}).length > 0;
      rows.push({ fromCk: ck, toCk, studentCount, hasConflict });
    }

    setPromotionRows(rows);
    setGraduateRows(grads);
    setOverwrite(false);
    setPromotionLoading(false);
  }

  async function runPromotion() {
    if (!promotionRows) return;
    const prevYear = curYear - 1;
    const prevSnap = await get(ref(db, `classes/${prevYear}`));
    if (!prevSnap.exists()) return;
    const prevData = prevSnap.val() as Record<string, { students?: Record<string, unknown> }>;

    const updates: Record<string, unknown> = {};
    for (const row of promotionRows) {
      if (row.hasConflict && !overwrite) continue;
      const classInfo = prevData[row.fromCk];
      if (!classInfo?.students) continue;
      updates[`classes/${curYear}/${row.toCk}/students`] = classInfo.students;
    }

    if (Object.keys(updates).length === 0) {
      showToast('덮어쓸 반이 없습니다. 충돌 반도 덮어쓰기를 체크해 주세요.');
      return;
    }

    setPromotionRunning(true);
    try {
      await update(ref(db), updates);
      const count = promotionRows
        .filter(r => overwrite || !r.hasConflict)
        .reduce((s, r) => s + r.studentCount, 0);
      showToast(`${count}명의 학생을 ${curYear}년으로 진급 처리했습니다.`, 'success');
      setPromotionRows(null);
    } catch {
      showToast('진급 처리에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setPromotionRunning(false);
    }
  }

  useEffect(() => { loadAllRoles(); }, []);

  const entries = Object.entries(allUserRoles);

  return (
    <div className="admin-container">
      {/* 계정 관리 */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span className="admin-section-title">👤 계정 관리</span>
          <button
            className="btn-primary"
            style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 12, flex: 'none' }}
            onClick={openAddAccount}
          >
            + 계정 추가
          </button>
        </div>

        {entries.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>등록된 계정이 없습니다.</div>
        ) : (
          entries.map(([key, r]) => {
            const role = r as UserRole & { email?: string; name?: string };
            return (
              <div key={key} className="account-card">
                <div
                  className="account-avatar"
                  style={{ background: role.role === 'admin' ? 'var(--amber-bg)' : 'var(--primary-bg)' }}
                >
                  {role.role === 'admin' ? '🔑' : '👤'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>
                    {role.email || key}
                    {role.name && <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 11 }}> ({role.name})</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    {role.role === 'admin'
                      ? <span style={{ color: 'var(--amber-text)' }}>통합 관리자</span>
                      : `교사 · ${role.part}부 ${role.grade}학년 ${role.class}반`
                    }
                  </div>
                </div>
                <button className="edit-btn" onClick={() => openEditAccount(key)}>수정</button>
              </div>
            );
          })
        )}
      </div>

      {/* 이벤트 관리 */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '14px 16px' }}>
        <div className="admin-section-title">📅 특별 일정 관리 ({curYear}년)</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input className="form-input" style={{ width: 60 }} placeholder="월" type="number" min="1" max="12" value={evMonth} onChange={e => setEvMonth(e.target.value)} />
          <input className="form-input" style={{ width: 60 }} placeholder="일" type="number" min="1" max="31" value={evDay} onChange={e => setEvDay(e.target.value)} />
          <input className="form-input" style={{ flex: 1 }} placeholder="이름 (예: 수련회)" value={evLabel} onChange={e => setEvLabel(e.target.value)} />
          <button className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={addEvent}>추가</button>
        </div>
        {Object.entries(customEvents).map(([key, ev]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius)', marginBottom: 6, fontSize: 13 }}>
            <span style={{ marginRight: 8 }}>📌</span>
            <span>{ev.month}월 {ev.day}일</span>
            <span style={{ marginLeft: 8, color: 'var(--text2)' }}>{ev.label}</span>
            {confirmEventKey === key ? (
              <>
                <button
                  style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: 11, border: '1px solid var(--red)', borderRadius: 'var(--radius)', color: 'var(--red-text)', background: 'var(--red-bg)', cursor: 'pointer' }}
                  onClick={() => deleteEvent(key)}
                >
                  확인
                </button>
                <button
                  style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text2)', background: 'var(--surface)', cursor: 'pointer' }}
                  onClick={() => setConfirmEventKey(null)}
                >
                  취소
                </button>
              </>
            ) : (
              <button
                style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: 11, border: '1px solid var(--red)', borderRadius: 'var(--radius)', color: 'var(--red-text)', background: 'var(--red-bg)', cursor: 'pointer' }}
                onClick={() => setConfirmEventKey(key)}
              >
                삭제
              </button>
            )}
          </div>
        ))}
        {Object.keys(customEvents).length === 0 && (
          <div style={{ color: 'var(--text3)', fontSize: 12 }}>등록된 특별 일정이 없습니다.</div>
        )}
      </div>

      {/* 학년 진급 처리 */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '14px 16px', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span className="admin-section-title">🎓 새해 진급 처리</span>
          <button
            className="btn-secondary"
            style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 12, flex: 'none' }}
            disabled={promotionLoading}
            onClick={loadPromotionPreview}
          >
            {promotionLoading ? '불러오는 중...' : `${curYear - 1}년 → ${curYear}년 미리보기`}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
          {curYear - 1}년 명단을 기반으로 학년을 올려 {curYear}년에 추가합니다. 3학년은 졸업 처리됩니다.
        </div>

        {promotionRows !== null && (
          <>
            {promotionRows.length > 0 ? (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>진급 예정 ({promotionRows.reduce((s, r) => s + r.studentCount, 0)}명)</div>
                {promotionRows.map(row => {
                  const [fp, fg, fc] = row.fromCk.split('-');
                  const [, tg] = row.toCk.split('-');
                  return (
                    <div key={row.fromCk} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <span style={{ color: 'var(--text2)' }}>{fp}부 {fg}학년 {fc}반</span>
                      <span style={{ color: 'var(--text3)' }}>→</span>
                      <span style={{ fontWeight: 600 }}>{fp}부 {tg}학년 {fc}반</span>
                      <span style={{ color: 'var(--text3)', marginLeft: 4 }}>{row.studentCount}명</span>
                      {row.hasConflict && (
                        <span style={{ marginLeft: 'auto', fontSize: 10, background: 'var(--amber-bg)', color: 'var(--amber-text)', borderRadius: 6, padding: '2px 6px' }}>
                          이미 데이터 있음
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>진급할 학생이 없습니다.</div>
            )}

            {graduateRows.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>
                  졸업 ({graduateRows.reduce((s, r) => s + r.studentCount, 0)}명 — {curYear}년 명단에 미포함)
                </div>
                {graduateRows.map(row => {
                  const [p, , c] = row.ck.split('-');
                  return (
                    <div key={row.ck} style={{ fontSize: 12, color: 'var(--text3)', padding: '3px 0' }}>
                      {p}부 3학년 {c}반 · {row.studentCount}명
                    </div>
                  );
                })}
              </div>
            )}

            {promotionRows.some(r => r.hasConflict) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--amber-text)', marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
                이미 데이터가 있는 반도 덮어쓰기
              </label>
            )}

            {promotionRows.length > 0 && (
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn-secondary" onClick={() => setPromotionRows(null)} disabled={promotionRunning}>취소</button>
                <button className="btn-primary" onClick={runPromotion} disabled={promotionRunning}>
                  {promotionRunning ? '처리 중...' : '진급 실행'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 구글 시트 동기화 */}
      <SheetSyncSection />

      {/* 계정 모달 */}
      {accountModal.open && (
        <div className="modal-overlay center-modal" onClick={() => setAccountModal({ open: false, editKey: null })}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{accountModal.editKey ? '계정 수정' : '계정 추가'}</div>
            <div className="form-field">
              <label className="form-label">이메일 *</label>
              <input
                className="form-input"
                type="email"
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                disabled={!!accountModal.editKey}
              />
            </div>
            <div className="form-field">
              <label className="form-label">역할</label>
              <select className="form-select" value={formRole} onChange={e => setFormRole(e.target.value as 'admin' | 'teacher')}>
                <option value="teacher">교사</option>
                <option value="admin">관리자</option>
              </select>
            </div>
            {formRole === 'teacher' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="form-field" style={{ flex: 1 }}>
                  <label className="form-label">부</label>
                  <select className="form-select" value={formPart} onChange={e => setFormPart(e.target.value)}>
                    <option value="1">1부</option>
                    <option value="2">2부</option>
                  </select>
                </div>
                <div className="form-field" style={{ flex: 1 }}>
                  <label className="form-label">학년</label>
                  <select className="form-select" value={formGrade} onChange={e => setFormGrade(e.target.value)}>
                    {[1,2,3].map(g => <option key={g} value={String(g)}>{g}학년</option>)}
                  </select>
                </div>
                <div className="form-field" style={{ flex: 1 }}>
                  <label className="form-label">반</label>
                  <input className="form-input" type="number" min="1" value={formClass} onChange={e => setFormClass(e.target.value)} />
                </div>
              </div>
            )}
            <div className="btn-row">
              {accountModal.editKey && (
                deleteAccountConfirm ? (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--red-text)', flex: 1 }}>정말 삭제할까요?</span>
                    <button className="btn-danger" onClick={deleteAccount} disabled={saving}>확인</button>
                    <button className="btn-secondary" onClick={() => setDeleteAccountConfirm(false)}>아니오</button>
                  </>
                ) : (
                  <button className="btn-danger" onClick={() => setDeleteAccountConfirm(true)} disabled={saving}>삭제</button>
                )
              )}
              <button className="btn-secondary" onClick={() => { setAccountModal({ open: false, editKey: null }); setDeleteAccountConfirm(false); }} disabled={saving}>취소</button>
              <button className="btn-primary" onClick={saveAccount} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
