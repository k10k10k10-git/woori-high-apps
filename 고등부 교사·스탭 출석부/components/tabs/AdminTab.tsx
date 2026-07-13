'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { emailToKey } from '@/utils/dates';
import { showToast } from '@/utils/toast';
import {
  addStaffMember,
  deleteStaffEvent,
  deleteStaffMember,
  deleteUserRole,
  getAllUserRoles,
  moveStaffMemberToTeam,
  saveStaffEvent,
  saveUserRole,
  swapStaffOrder,
  updateStaffMember,
} from '@/lib/db';
import type { UserRole, Member, StaffTeam } from '@/types';
import { GROUP_KEYS, GROUP_LABELS, STAFF_TEAMS } from '@/types';

export default function AdminTab() {
  const { state, dispatch } = useApp();
  const { curYear, curGroup, groupData, allUserRoles, customEventsData } = state;

  // ─── 스탭 멤버 관리 (팀별) ──────────────────────────────────
  const [selectedTeam, setSelectedTeam] = useState<StaffTeam>(STAFF_TEAMS[0]);
  const staffMembers = groupData[selectedTeam]?.members ?? [];
  const [memberModal, setMemberModal] = useState<{ open: boolean; editId: string | null }>({ open: false, editId: null });
  const [mName, setMName] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mTargetTeam, setMTargetTeam] = useState<StaffTeam>(STAFF_TEAMS[0]);
  const [mSaving, setMSaving] = useState(false);

  function openAddMember() {
    setMName(''); setMPhone(''); setMTargetTeam(selectedTeam);
    setMemberModal({ open: true, editId: null });
  }
  function openEditMember(m: Member) {
    setMName(m.name); setMPhone(m.phone ?? ''); setMTargetTeam(selectedTeam);
    setMemberModal({ open: true, editId: m.id });
  }

  async function saveMember() {
    if (!mName.trim()) { showToast('이름을 입력하세요'); return; }
    setMSaving(true);
    try {
      if (memberModal.editId) {
        const existing = staffMembers.find(m => m.id === memberModal.editId);
        if (mTargetTeam !== selectedTeam) {
          const targetMembers = groupData[mTargetTeam]?.members ?? [];
          await moveStaffMemberToTeam(
            curYear, selectedTeam, mTargetTeam,
            memberModal.editId, mName, mPhone,
            targetMembers.length,
          );
          setSelectedTeam(mTargetTeam);
          showToast(`${mTargetTeam}으로 이동되었습니다`, 'success');
        } else {
          await updateStaffMember(curYear, selectedTeam, memberModal.editId, mName, mPhone, existing?.num ?? 999);
          showToast('수정되었습니다', 'success');
        }
      } else {
        const maxNum = staffMembers.length > 0 ? Math.max(...staffMembers.map(m => m.num ?? 0)) : 0;
        await addStaffMember(curYear, selectedTeam, mName, mPhone, maxNum);
        showToast('추가되었습니다', 'success');
      }
      setMemberModal({ open: false, editId: null });
    } catch {
      showToast('저장 실패');
    }
    setMSaving(false);
  }

  async function deleteMember() {
    if (!memberModal.editId || !window.confirm('이 멤버를 삭제하시겠습니까?')) return;
    setMSaving(true);
    await deleteStaffMember(curYear, selectedTeam, memberModal.editId);
    showToast('삭제되었습니다', 'success');
    setMSaving(false);
    setMemberModal({ open: false, editId: null });
  }

  async function moveMember(id: string, dir: 'up' | 'down') {
    const idx = staffMembers.findIndex(m => m.id === id);
    if (idx < 0) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= staffMembers.length) return;
    await swapStaffOrder(
      curYear, selectedTeam,
      staffMembers[idx].id, staffMembers[idx].num,
      staffMembers[swapIdx].id, staffMembers[swapIdx].num,
    );
  }

  // ─── 계정 관리 ─────────────────────────────────────────────
  const [accountModal, setAccountModal] = useState<{ open: boolean; editKey: string | null }>({ open: false, editKey: null });
  const [aEmail, setAEmail] = useState('');
  const [aRole, setARole] = useState<'admin' | 'user'>('user');
  const [aName, setAName] = useState('');
  const [aSaving, setASaving] = useState(false);

  useEffect(() => {
    async function loadRoles() {
      dispatch({ type: 'SET_ALL_USER_ROLES', payload: await getAllUserRoles() });
    }
    loadRoles();
  }, [dispatch]);

  function openAddAccount() { setAEmail(''); setARole('user'); setAName(''); setAccountModal({ open: true, editKey: null }); }
  function openEditAccount(key: string) {
    const r = allUserRoles[key];
    if (!r) return;
    setAEmail((r as { email?: string }).email ?? key);
    setARole(r.role as 'admin' | 'user');
    setAName(r.name ?? '');
    setAccountModal({ open: true, editKey: key });
  }

  async function saveAccount() {
    if (!aEmail.trim()) { showToast('이메일을 입력하세요'); return; }
    setASaving(true);
    const key = accountModal.editKey || emailToKey(aEmail.trim());
    await saveUserRole(key, { email: aEmail.trim(), role: aRole, name: aName.trim() || undefined });
    dispatch({ type: 'SET_ALL_USER_ROLES', payload: await getAllUserRoles() });
    setASaving(false);
    setAccountModal({ open: false, editKey: null });
    showToast('저장되었습니다', 'success');
  }

  async function deleteAccount() {
    if (!accountModal.editKey || !window.confirm('이 계정을 삭제하시겠습니까?')) return;
    setASaving(true);
    await deleteUserRole(accountModal.editKey);
    dispatch({ type: 'SET_ALL_USER_ROLES', payload: await getAllUserRoles() });
    setASaving(false);
    setAccountModal({ open: false, editKey: null });
    showToast('삭제되었습니다', 'success');
  }

  // ─── 이벤트 관리 ───────────────────────────────────────────
  const [evMonth, setEvMonth] = useState('');
  const [evDay, setEvDay] = useState('');
  const [evLabel, setEvLabel] = useState('');

  async function addEvent() {
    if (!evMonth || !evDay || !evLabel) { showToast('월, 일, 이름을 모두 입력하세요'); return; }
    const key = `ev_${Date.now()}`;
    await saveStaffEvent(curYear, key, { month: evMonth, day: evDay, label: evLabel });
    setEvMonth(''); setEvDay(''); setEvLabel('');
    showToast('이벤트가 추가되었습니다', 'success');
  }

  async function deleteEvent(key: string) {
    if (!window.confirm('이 이벤트를 삭제하시겠습니까?')) return;
    await deleteStaffEvent(curYear, key);
    showToast('삭제되었습니다', 'success');
  }

  // ─── 현재 탭 멤버 미리보기 (1부/2부) ──────────────────────
  const previewGroup = curGroup !== 'staff' ? curGroup : null;
  const previewMembers = previewGroup ? (groupData[previewGroup]?.members ?? []) : [];

  return (
    <div className="admin-tab">

      {/* 교사 명단 동기화 현황 */}
      <section className="admin-section sync-section">
        <div className="admin-section-head">
          <h3>교사 명단 (자동 동기화)</h3>
          <span className="sync-badge">🔄 실시간 연동</span>
        </div>
        <div className="sync-desc">
          1부·2부 교사 명단은 기존 출석부 DB(<code>classes</code>)에서 자동으로 가져옵니다.<br />
          담임 교사가 변경되면 즉시 반영됩니다.
        </div>

        <div className="group-tab-row" style={{ marginTop: '.75rem' }}>
          {(['part1', 'part2'] as const).map(gk => (
            <button
              key={gk}
              className={`group-mini-btn${curGroup === gk ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'SET_GROUP', payload: gk })}
            >
              {GROUP_LABELS[gk]}
            </button>
          ))}
        </div>

        {previewGroup && (
          <div className="sync-preview-list">
            {previewMembers.length === 0 ? (
              <div className="empty-sub">교사 명단 로딩 중...</div>
            ) : previewMembers.map(m => (
              <div key={m.id} className="sync-member-row">
                <span className="sync-member-name">{m.name}</span>
                <span className="sync-member-class">{m.id}</span>
              </div>
            ))}
            <div className="sync-count">{previewMembers.length}명</div>
          </div>
        )}
      </section>

      {/* 스탭 멤버 관리 */}
      <section className="admin-section">
        <div className="admin-section-head">
          <h3>스탭 멤버 관리</h3>
          <button className="add-btn" onClick={openAddMember}>+ 추가</button>
        </div>
        <div className="team-select-row">
          {STAFF_TEAMS.map(team => (
            <button
              key={team}
              className={`team-mini-btn${selectedTeam === team ? ' active' : ''}`}
              onClick={() => setSelectedTeam(team)}
            >
              {team}
            </button>
          ))}
        </div>
        <div className="member-list">
          {staffMembers.length === 0 ? (
            <div className="empty-state"><div className="empty-text">{selectedTeam} 멤버가 없습니다</div></div>
          ) : staffMembers.map((m, idx) => (
            <div key={m.id} className="member-row">
              <div className="member-order">
                <button className="order-btn" onClick={() => moveMember(m.id, 'up')} disabled={idx === 0}>▲</button>
                <button className="order-btn" onClick={() => moveMember(m.id, 'down')} disabled={idx === staffMembers.length - 1}>▼</button>
              </div>
              <div className="member-info">
                <span className="member-name">{m.name}</span>
                {m.phone && <span className="member-phone">{m.phone}</span>}
              </div>
              <button className="edit-btn" onClick={() => openEditMember(m)}>수정</button>
            </div>
          ))}
        </div>
      </section>

      {/* 계정 관리 */}
      <section className="admin-section">
        <div className="admin-section-head">
          <h3>계정 관리</h3>
          <button className="add-btn" onClick={openAddAccount}>+ 추가</button>
        </div>
        <div className="account-list">
          {Object.entries(allUserRoles).length === 0 ? (
            <div className="empty-state"><div className="empty-text">계정이 없습니다</div></div>
          ) : Object.entries(allUserRoles).map(([key, r]) => (
            <div key={key} className="account-row">
              <div className="account-info">
                <span className="account-name">{(r as { name?: string }).name || (r as { email?: string }).email || key}</span>
                <span className={`role-badge role-${r.role}`}>{r.role === 'admin' ? '관리자' : '일반'}</span>
              </div>
              <button className="edit-btn" onClick={() => openEditAccount(key)}>수정</button>
            </div>
          ))}
        </div>
      </section>

      {/* 이벤트 관리 */}
      <section className="admin-section">
        <div className="admin-section-head">
          <h3>특별 이벤트 ({curYear}년)</h3>
        </div>
        <div className="event-add-row">
          <input className="ev-input" placeholder="월" type="number" min="1" max="12"
            value={evMonth} onChange={e => setEvMonth(e.target.value)} />
          <input className="ev-input" placeholder="일" type="number" min="1" max="31"
            value={evDay} onChange={e => setEvDay(e.target.value)} />
          <input className="ev-input ev-label" placeholder="이름" value={evLabel} onChange={e => setEvLabel(e.target.value)} />
          <button className="add-btn" onClick={addEvent}>추가</button>
        </div>
        <div className="event-list">
          {Object.entries(customEventsData).length === 0 ? (
            <div className="empty-sub">등록된 이벤트 없음</div>
          ) : Object.entries(customEventsData).map(([key, ev]) => (
            <div key={key} className="event-row">
              <span>{ev.month}월 {ev.day}일 — {ev.label}</span>
              <button className="del-btn" onClick={() => deleteEvent(key)}>삭제</button>
            </div>
          ))}
        </div>
      </section>

      {/* 스탭 멤버 모달 */}
      {memberModal.open && (
        <div className="modal-overlay" onClick={() => setMemberModal({ open: false, editId: null })}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{memberModal.editId ? '멤버 수정' : `${selectedTeam} 추가`}</div>
            <input className="modal-input" placeholder="이름" value={mName} onChange={e => setMName(e.target.value)} />
            <input className="modal-input" placeholder="전화번호 (선택)" value={mPhone} onChange={e => setMPhone(e.target.value)} />
            {memberModal.editId && (
              <div className="modal-team-row">
                <span className="modal-team-label">사역팀</span>
                <select
                  className="modal-team-select"
                  value={mTargetTeam}
                  onChange={e => setMTargetTeam(e.target.value as StaffTeam)}
                >
                  {STAFF_TEAMS.map(t => (
                    <option key={t} value={t}>{t}{t === selectedTeam ? ' (현재)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="modal-btn-row">
              {memberModal.editId && (
                <button className="modal-btn del" onClick={deleteMember} disabled={mSaving}>삭제</button>
              )}
              <button className="modal-btn cancel" onClick={() => setMemberModal({ open: false, editId: null })}>취소</button>
              <button className="modal-btn save" onClick={saveMember} disabled={mSaving}>
                {mSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 계정 모달 */}
      {accountModal.open && (
        <div className="modal-overlay" onClick={() => setAccountModal({ open: false, editKey: null })}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{accountModal.editKey ? '계정 수정' : '계정 추가'}</div>
            <input className="modal-input" placeholder="이메일" type="email" value={aEmail}
              onChange={e => setAEmail(e.target.value)} disabled={!!accountModal.editKey} />
            <input className="modal-input" placeholder="이름 (선택)" value={aName} onChange={e => setAName(e.target.value)} />
            <div className="modal-radio-row">
              <label>
                <input type="radio" value="user" checked={aRole === 'user'} onChange={() => setARole('user')} />
                일반
              </label>
              <label>
                <input type="radio" value="admin" checked={aRole === 'admin'} onChange={() => setARole('admin')} />
                관리자
              </label>
            </div>
            <div className="modal-btn-row">
              {accountModal.editKey && (
                <button className="modal-btn del" onClick={deleteAccount} disabled={aSaving}>삭제</button>
              )}
              <button className="modal-btn cancel" onClick={() => setAccountModal({ open: false, editKey: null })}>취소</button>
              <button className="modal-btn save" onClick={saveAccount} disabled={aSaving}>
                {aSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
