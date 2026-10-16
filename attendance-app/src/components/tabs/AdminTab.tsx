'use client';
import { useState, useEffect, useCallback, useRef, useId, type ReactNode, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db, ref, set, get } from '@/lib/db';
import { buildPromotionPayload, type PromotionSnapshot } from '@/lib/promotion';
import { commitSheetSync } from '@/lib/sheetSyncCommit';
import { adminActor } from '@/utils/adminChange';
import { isDataReady, useApp } from '@/store/AppContext';
import { emailToKey } from '@/utils/dates';
import { attendanceEventDate } from '@/utils/attendanceEventDate';
import { useAdminViewState } from '@/hooks/useAdminViewState';
import { showToast } from '@/utils/toast';
import YouthHandoffSection from '../admin/YouthHandoffSection';
import type { UserRole } from '@/types';
import AdminIcon from '../admin/AdminIcon';
import AdminStatusBadge from '../admin/AdminStatusBadge';
import '../admin/admin-settings.css';
import '../admin/admin-overview.css';
import dynamic from 'next/dynamic';
const TeacherManagement = dynamic(() => import('./overall/TeacherManagement'));

type PromotionRow = {
  fromCk: string;
  toCk: string;
  studentCount: number;
  hasConflict: boolean;
};
type GraduateRow = { ck: string; studentCount: number };
type SettingsSection = 'accounts' | 'teachers' | 'events' | 'data';
const SETTINGS_SECTIONS = [
  { id: 'accounts', label: '계정 관리', icon: 'users' },
  { id: 'teachers', label: '교사 명단', icon: 'book' },
  { id: 'events', label: '출석 제외 일정', icon: 'calendar' },
  { id: 'data', label: '데이터 관리', icon: 'layers' },
] as const;


export default function AdminTab() {
  const { state, dispatch, getState } = useApp();
  const { allUserRoles, curYear, dataRevision } = state;

  const router = useRouter();
  const params = useSearchParams();
  const requestedSection = SETTINGS_SECTIONS.find(item => item.id === params.get('section'))?.id;
  const [settingsView, setSettingsView] = useAdminViewState('settings', { section: 'accounts', accountQuery: '', accountRoleFilter: 'all' }, ['accountQuery']);
  const section = requestedSection ?? SETTINGS_SECTIONS.find(item => item.id === settingsView.section)?.id ?? 'accounts';
  useEffect(() => {
    if (requestedSection) setSettingsView({ section: requestedSection });
  }, [requestedSection, setSettingsView]);
  function setSection(next: SettingsSection) {
    setSettingsView({ section: next });
    const query = new URLSearchParams(params.toString());
    query.set('section', next);
    router.replace(`/admin?${query}`, { scroll: false });
  }
  const accountQuery = settingsView.accountQuery;
  const setAccountQuery = (accountQuery: string) => setSettingsView({ accountQuery });
  const accountRoleFilter = ['admin', 'teacher'].includes(settingsView.accountRoleFilter) ? settingsView.accountRoleFilter : 'all';
  const setAccountRoleFilter = (accountRoleFilter: 'all' | 'admin' | 'teacher') => setSettingsView({ accountRoleFilter });
  const [accountsRefresh, setAccountsRefresh] = useState(0);
  const [accountsRead, setAccountsRead] = useState<{ scope: string; status: 'ready' | 'error' } | null>(null);
  const accountScope = `${dataRevision}:${accountsRefresh}`;
  const accountStatus = accountsRead?.scope === accountScope ? accountsRead.status : 'loading';
  const sectionRefs = useRef<Partial<Record<SettingsSection, HTMLButtonElement | null>>>({});
  const settingsId = useId();

  // 계정 모달
  const [accountModal, setAccountModal] = useState<{ open: boolean; editKey: string | null }>({ open: false, editKey: null });
  const [formEmail, setFormEmail]   = useState('');
  const [formRole, setFormRole]     = useState<'admin' | 'teacher'>('teacher');
  const [formPart, setFormPart]     = useState('1');
  const [formGrade, setFormGrade]   = useState('1');
  const [formClass, setFormClass]   = useState('1');
  const [saving, setSaving] = useState(false);

  // 이벤트
  const [eventDraft, setEventDraft] = useState({ year: curYear, date: '', label: '' });
  const { date: evDate, label: evLabel } = eventDraft.year === curYear ? eventDraft : { date: '', label: '' };
  const eventDate = attendanceEventDate(evDate, curYear);
  const eventBusy = useRef(false);
  const eventActive = useRef(true);
  useEffect(() => { eventActive.current = true; return () => { eventActive.current = false; }; }, []);
  const [eventSaving, setEventSaving] = useState(false);
  const eventScope = `${state.draftSession}:${dataRevision}:${curYear}`;
  const [eventResult, setEventResult] = useState<{ scope: string; error?: string; success?: string } | null>(null);
  const result = eventResult?.scope === eventScope ? eventResult : null;
  const eventReady = state.userRole?.role === 'admin' && isDataReady(state);
  const customEvents = state.customEventsData;

  // 진급 처리
  const [promotionRows, setPromotionRows]         = useState<PromotionRow[] | null>(null);
  const [graduateRows, setGraduateRows]           = useState<GraduateRow[]>([]);
  const [promotionLoading, setPromotionLoading]   = useState(false);
  const [promotionRunning, setPromotionRunning]   = useState(false);
  const [overwrite, setOverwrite]                 = useState(false);
  const [promotionSnapshot, setPromotionSnapshot] = useState<PromotionSnapshot | null>(null);
  const promotionBusy = useRef(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const [confirmEventKey, setConfirmEventKey]     = useState<string | null>(null);

  function openAddAccount() {
    setDeleteAccountConfirm(false);
    setFormEmail(''); setFormRole('teacher');
    setFormPart('1'); setFormGrade('1'); setFormClass('1');
    setAccountModal({ open: true, editKey: null });
  }

  function openEditAccount(key: string) {
    setDeleteAccountConfirm(false);
    const r = allUserRoles[key];
    if (!r) return;
    setFormEmail((r as { email?: string }).email ?? key);
    setFormRole(r.role);
    setFormPart(r.part ?? '1');
    setFormGrade(r.grade ?? '1');
    setFormClass(r.class ?? '1');
    setAccountModal({ open: true, editKey: key });
  }

  const loadAllRoles = useCallback(async () => {
    const snap = await get(ref(db, 'userRoles'));
    dispatch({ type: 'SET_ALL_USER_ROLES', revision: dataRevision, payload: snap.exists() ? snap.val() : {} });
  }, [dispatch, dataRevision]);

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
    if (eventBusy.current) return;
    const current = getState();
    if (current.curYear !== curYear || current.dataRevision !== dataRevision || current.draftSession !== state.draftSession
      || current.userRole?.role !== 'admin' || !isDataReady(current)) return;
    const date = attendanceEventDate(evDate, curYear);
    if (!date) { setEventResult({ scope: eventScope, error: `${curYear}년의 올바른 날짜를 선택해 주세요.` }); return; }
    if (!date.sunday) { setEventResult({ scope: eventScope, error: '주일이 아닌 날짜는 출석 집계에 적용되지 않습니다. 일요일을 선택해 주세요.' }); return; }
    if (!evLabel.trim()) { setEventResult({ scope: eventScope, error: '일정 이름을 입력해 주세요.' }); return; }
    const isCurrent = () => {
      const latest = getState();
      return eventActive.current && latest.curYear === curYear && latest.dataRevision === dataRevision && latest.draftSession === state.draftSession
        && latest.userRole?.role === 'admin' && isDataReady(latest);
    };
    eventBusy.current = true;
    setEventSaving(true);
    setEventResult(null);
    try {
      const key = `ev_${Date.now()}`;
      await set(ref(db, `events/${curYear}/${key}`), { month: date.month, day: date.day, label: evLabel.trim() });
      if (!isCurrent()) return;
      setEventDraft({ year: curYear, date: '', label: '' });
      setEventResult({ scope: eventScope, success: `${date.month}월 ${date.day}일 출석 제외 일정이 추가되었습니다.` });
    } catch {
      if (isCurrent()) setEventResult({ scope: eventScope, error: '일정을 저장하지 못했습니다. 입력한 내용은 남아 있으니 연결을 확인한 뒤 다시 시도해 주세요.' });
    } finally {
      eventBusy.current = false;
      setEventSaving(false);
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
    if (promotionBusy.current) return;
    promotionBusy.current = true;
    setPromotionLoading(true);
    setPromotionRows(null);
    setPromotionSnapshot(null);
    try {
    const prevYear = curYear - 1;
    const [allSnap, attSnap] = await Promise.all([
      get(ref(db, 'classes')),
      get(ref(db, `attendance/${curYear}`)),
    ]);
    const classes = (allSnap.val() ?? {}) as PromotionSnapshot['classes'];
    if (!classes[prevYear]) {
      showToast(`${prevYear}년 데이터가 없습니다.`);
      setPromotionLoading(false);
      return;
    }
    const prevData = classes[prevYear];
    const curData = classes[curYear] ?? {};

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
    setPromotionSnapshot({ year: curYear, classes, attendance: attSnap.val() ?? {} });
    setGraduateRows(grads);
    setOverwrite(false);
    setPromotionLoading(false);
    } catch {
      showToast('진급 명단을 불러오지 못했습니다. 연결과 권한을 확인해 주세요.');
    } finally { promotionBusy.current = false; setPromotionLoading(false); }
  }

  async function runPromotion() {
    if (!promotionRows || !promotionSnapshot || promotionBusy.current) return;
    if (promotionSnapshot.year !== curYear) { setPromotionRows(null); showToast('조회 연도가 변경되었습니다. 다시 미리보기해 주세요.'); return; }
    promotionBusy.current = true;
    setPromotionRunning(true);
    try {
      const { payload, classKeys, count } = buildPromotionPayload(promotionSnapshot, overwrite, crypto.randomUUID(), adminActor(state.userRole));
      await commitSheetSync({ year: curYear, classes: promotionSnapshot.classes,
        attendance: promotionSnapshot.attendance, classKeys, payload });
      showToast(`${count}명의 학생을 ${curYear}년으로 진급 처리했습니다.`, 'success');
      setPromotionRows(null);
    } catch (error) {
      setPromotionRows(null); setPromotionSnapshot(null);
      showToast(error instanceof Error ? error.message : '진급 처리 결과를 확인하지 못했습니다. 명단을 다시 확인해 주세요.');
    } finally {
      promotionBusy.current = false;
      setPromotionRunning(false);
    }
  }

  useEffect(() => {
    let active = true;
    loadAllRoles().then(() => {
      if (active) setAccountsRead({ scope: accountScope, status: 'ready' });
    }).catch(() => {
      if (active) setAccountsRead({ scope: accountScope, status: 'error' });
    });
    return () => { active = false; };
  }, [accountScope, loadAllRoles]);

  const entries = Object.entries(allUserRoles);
  const query = accountQuery.trim().toLocaleLowerCase('ko-KR');
  const visibleAccounts = entries.filter(([key, role]) => (
    (accountRoleFilter === 'all' || role.role === accountRoleFilter)
    && (!query || `${role.email || key} ${role.name || ''} ${role.part || ''}부 ${role.grade || ''}학년 ${role.class || ''}반`.toLocaleLowerCase('ko-KR').includes(query))
  ));
  const eventEntries = Object.entries(customEvents);

  function closeAccount() {
    if (saving) return;
    setAccountModal({ open: false, editKey: null });
    setDeleteAccountConfirm(false);
  }

  function moveSection(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % SETTINGS_SECTIONS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = SETTINGS_SECTIONS.length - 1;
    else return;
    event.preventDefault();
    setSection(SETTINGS_SECTIONS[next].id);
    sectionRefs.current[SETTINGS_SECTIONS[next].id]?.focus();
  }

  return (
    <div className="admin-settings">
      <header className="as-heading">
        <h1>운영 설정</h1>
        <p>계정·교사·행사를 구분해 관리하세요. 명단 반영과 진급은 데이터 관리에 있습니다.</p>
      </header>
      <div className="as-section-tabs" role="tablist" aria-label="설정 메뉴">
        {SETTINGS_SECTIONS.map((item, index) => (
          <button key={item.id} ref={element => { sectionRefs.current[item.id] = element; }} type="button"
            role="tab" id={`${settingsId}-tab-${item.id}`} aria-controls={`${settingsId}-panel-${item.id}`}
            aria-selected={section === item.id} tabIndex={section === item.id ? 0 : -1}
            onClick={() => setSection(item.id)} onKeyDown={event => moveSection(event, index)}>
            <AdminIcon name={item.icon} /><span>{item.label}</span>
          </button>
        ))}
      </div>

      <section className="as-panel" id={`${settingsId}-panel-accounts`} role="tabpanel" aria-labelledby={`${settingsId}-tab-accounts`} hidden={section !== 'accounts'}>
        <div className="as-section-heading">
          <div><h2>등록된 이메일 역할 <span>{accountStatus === 'ready' ? `${entries.length}개` : '—'}</span></h2><p>이 화면은 로그인 계정을 새로 만들지 않고, 이미 로그인할 수 있는 이메일의 출석부 역할과 담당 반만 등록합니다.</p></div>
          <button type="button" className="as-button as-button-primary" onClick={openAddAccount}>이메일 역할 등록 <AdminIcon name="arrow" /></button>
        </div>
        <div className="as-toolbar">
          <label className="as-search"><AdminIcon name="search" /><span className="as-sr-only">이메일, 이름, 담당 반 검색</span><input type="search" value={accountQuery} onChange={event => setAccountQuery(event.target.value)} placeholder="이메일, 이름, 담당 반 검색" /></label>
          <label className="as-role-filter"><span>역할</span><select value={accountRoleFilter} onChange={event => setAccountRoleFilter(event.target.value as 'all' | 'admin' | 'teacher')}><option value="all">전체 역할</option><option value="admin">관리자</option><option value="teacher">교사</option></select></label>
        </div>
        {accountStatus === 'loading' ? <div className="as-empty" role="status"><AdminIcon name="clock" size={22} /><h3>계정 목록을 불러오고 있습니다</h3><p>등록된 계정과 담당 반을 확인합니다.</p></div>
          : accountStatus === 'error' ? <div className="as-empty as-error" role="alert"><h3>계정 목록을 불러오지 못했습니다</h3><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button type="button" className="as-button" onClick={() => setAccountsRefresh(value => value + 1)}>다시 불러오기</button></div>
          : visibleAccounts.length > 0 ? <>
            <div className="as-account-list" aria-label="등록된 계정 목록">
              <div className="as-account-list-heading" aria-hidden="true"><span>계정</span><span>역할·담당 반</span><span>관리</span></div>
              {visibleAccounts.map(([key, r]) => {
                const role = r as UserRole & { email?: string; name?: string };
                return <article className="as-account-row" key={key}>
                  <div className="as-account-person"><span className="as-account-avatar"><AdminIcon name={role.role === 'admin' ? 'settings' : 'users'} size={18} /></span><div><strong>{role.email || key}</strong>{role.name && <small>{role.name}</small>}</div></div>
                  <div className="as-account-assignment"><span className={`as-badge${role.role === 'admin' ? ' as-badge-accent' : ''}`}>{role.role === 'admin' ? '관리자' : '교사'}</span><span>{role.role === 'admin' ? '전체 출석부' : `${role.part}부 ${role.grade}학년 ${role.class}반`}</span></div>
                  <button type="button" className="as-button as-button-quiet" aria-label={`${role.email || key} 계정 수정`} onClick={() => openEditAccount(key)}>수정</button>
                </article>;
              })}
            </div><p className="as-list-count" aria-live="polite">전체 {entries.length}개 계정 중 {visibleAccounts.length}개 표시</p>
          </> : <div className="as-empty"><AdminIcon name="users" size={24} /><h3>{entries.length === 0 ? '등록된 계정이 없습니다' : '검색 조건에 맞는 계정이 없습니다'}</h3><p>{entries.length === 0 ? '교사 이메일과 담당 반을 등록해 출석부를 시작하세요.' : '다른 이름이나 이메일로 검색하거나 역할 필터를 변경해 주세요.'}</p>{entries.length > 0 && <button type="button" className="as-button" onClick={() => { setAccountQuery(''); setAccountRoleFilter('all'); }}>검색 초기화</button>}</div>}
      </section>

      <section className="as-panel" id={`${settingsId}-panel-teachers`} role="tabpanel" aria-labelledby={`${settingsId}-tab-teachers`} hidden={section !== 'teachers'}>
        {section === 'teachers' && <TeacherManagement />}
      </section>

      <section className="as-panel" id={`${settingsId}-panel-events`} role="tabpanel" aria-labelledby={`${settingsId}-tab-events`} hidden={section !== 'events'}>
        <div className="as-section-heading"><div><h2>출석 제외 일정 <span>{curYear}년</span></h2><p>수련회 등 일반 주일이 아닌 날을 등록하면 주일 선택 목록과 출석 집계에서 제외됩니다.</p></div></div>
        <form className="as-event-form" onSubmit={event => { event.preventDefault(); void addEvent(); }} aria-busy={eventSaving}>
          <label><span>날짜</span><input type="date" min={`${curYear}-01-01`} max={`${curYear}-12-31`} required value={evDate} disabled={eventSaving}
            aria-describedby={`${settingsId}-event-preview`} onChange={event => { setEventDraft({ year: curYear, date: event.target.value, label: evLabel }); setEventResult(null); }} /></label>
          <label className="as-event-name"><span>일정 이름</span><input required value={evLabel} disabled={eventSaving}
            onChange={event => { setEventDraft({ year: curYear, date: evDate, label: event.target.value }); setEventResult(null); }} placeholder="예: 여름 수련회" /></label>
          <button type="submit" className="as-button as-button-primary" disabled={!eventReady || eventSaving || !eventDate?.sunday || !evLabel.trim()}>{eventSaving ? '추가 중…' : '일정 추가'}</button>
          <p id={`${settingsId}-event-preview`} className={`as-event-preview${evDate && !eventDate?.sunday ? ' as-event-error' : ''}`} role="status">
            {!evDate ? `${curYear}년 일요일을 선택하면 제외되는 출석 날짜를 미리 확인할 수 있습니다.`
              : !eventDate ? `${curYear}년의 올바른 날짜를 선택해 주세요.`
              : !eventDate.sunday ? '주일이 아닌 날짜는 출석 집계에 적용되지 않습니다. 일요일을 선택해 주세요.'
              : `${eventDate.month}월 ${eventDate.day}일(일) 주일 선택 목록과 출석 집계에서 제외됩니다.`}
          </p>
        </form>
        {!eventReady && <p className="as-event-error" role="alert">명단·출석·행사 자료를 모두 불러온 뒤 일정을 추가할 수 있습니다. 연결 상태를 확인해 주세요.</p>}
        {result?.error && <p className="as-event-error" role="alert">{result.error}</p>}
        {result?.success && <p className="as-event-result" role="status">{result.success}</p>}
        <div className="as-event-list">
          {eventEntries.map(([key, ev]) => <article className="as-event-row" key={key}>
            <span className="as-event-date"><AdminIcon name="calendar" />{ev.month}월 {ev.day}일</span><strong>{ev.label}</strong>
            <div className="as-event-actions">{confirmEventKey === key ? <><span className="as-delete-prompt" role="status">이 일정을 삭제할까요?</span><button type="button" className="as-button as-button-danger" onClick={() => deleteEvent(key)}>삭제 확인</button><button type="button" className="as-button" onClick={() => setConfirmEventKey(null)}>취소</button></> : <button type="button" className="as-button as-button-quiet" aria-label={`${ev.label} 일정 삭제`} onClick={() => setConfirmEventKey(key)}>삭제</button>}</div>
          </article>)}
          {eventEntries.length === 0 && <div className="as-empty"><AdminIcon name="calendar" size={24} /><h3>등록된 특별 일정이 없습니다</h3><p>위에서 날짜와 일정 이름을 입력해 추가하세요.</p></div>}
        </div>
      </section>

      <section className="as-panel" id={`${settingsId}-panel-data`} role="tabpanel" aria-labelledby={`${settingsId}-tab-data`} hidden={section !== 'data'}>
        <div className="as-section-heading"><div><h2>데이터 관리 <span>{curYear}년</span></h2><p>명단 변경 내용을 미리 확인한 뒤 필요한 작업을 적용하세요.</p></div></div>
        {section === 'data' && <YouthHandoffSection key={`${curYear}:${dataRevision}`} />}
        <details className="as-promotion-section">
          <summary><span><AdminIcon name="book" size={18} /><strong>새해 진급 처리</strong></span><span>{curYear - 1}년 → {curYear}년 <AdminIcon name="chevron" /></span></summary>
          <div className="as-promotion-body">
            <div className="as-section-heading"><div><h3>이전 연도 명단으로 진급 준비</h3><p>{curYear - 1}년 명단의 학년을 올려 {curYear}년에 추가합니다. 3학년은 {curYear}년 명단에 포함하지 않습니다.</p></div><button type="button" className="as-button" disabled={promotionLoading} onClick={loadPromotionPreview}>{promotionLoading ? '불러오는 중…' : '진급 미리보기'}</button></div>
            {promotionRows !== null && <div className="as-promotion-preview">
              {promotionRows.length > 0 ? <><h4>진급 예정 <span>{promotionRows.reduce((sum, row) => sum + row.studentCount, 0)}명</span></h4><div className="as-promotion-list">{promotionRows.map(row => {
                const [part, grade, cls] = row.fromCk.split('-');
                const [, nextGrade] = row.toCk.split('-');
                return <div className="as-promotion-row" key={row.fromCk}><span>{part}부 {grade}학년 {cls}반</span><AdminIcon name="arrow" /><strong>{part}부 {nextGrade}학년 {cls}반</strong><span>{row.studentCount}명</span>{row.hasConflict && <AdminStatusBadge label="이미 명단 있음" />}</div>;
              })}</div></> : <p className="as-empty-note">진급할 학생이 없습니다.</p>}
              {graduateRows.length > 0 && <div className="as-graduate-list"><h4>졸업 대상 <span>{graduateRows.reduce((sum, row) => sum + row.studentCount, 0)}명</span></h4><p>{curYear}년 명단에는 포함하지 않습니다.</p>{graduateRows.map(row => { const [part, , cls] = row.ck.split('-'); return <div key={row.ck}>{part}부 3학년 {cls}반 · {row.studentCount}명</div>; })}</div>}
              {promotionRows.some(row => row.hasConflict) && <label className="as-overwrite-option"><input type="checkbox" checked={overwrite} onChange={event => setOverwrite(event.target.checked)} /><span>이미 데이터가 있는 반도 덮어쓰기</span></label>}
              {promotionRows.length > 0 && <div className="as-promotion-actions"><button type="button" className="as-button" onClick={() => setPromotionRows(null)} disabled={promotionRunning}>취소</button><button type="button" className="as-button as-button-primary" onClick={runPromotion} disabled={promotionRunning}>{promotionRunning ? '처리 중…' : '진급 실행'}</button></div>}
            </div>}
          </div>
        </details>
      </section>

      {accountModal.open && <AccountDialog title={accountModal.editKey ? '이메일 역할 수정' : '이메일 역할 등록'} busy={saving} onClose={closeAccount}>
        <form onSubmit={event => { event.preventDefault(); void saveAccount(); }}>
          <div className="as-account-fields">
            <label className="as-field"><span>이메일 <b aria-hidden="true">*</b></span><input type="email" required autoComplete="off" value={formEmail} onChange={event => setFormEmail(event.target.value)} disabled={!!accountModal.editKey || saving} placeholder="teacher@example.com" /></label>
            {accountModal.editKey && <p className="as-field-help">등록된 이메일은 변경할 수 없습니다.</p>}
            <label className="as-field"><span>역할</span><select value={formRole} disabled={saving} onChange={event => setFormRole(event.target.value as 'admin' | 'teacher')}><option value="teacher">교사</option><option value="admin">관리자</option></select></label>
            {formRole === 'teacher' ? <fieldset className="as-class-fields" disabled={saving}><legend>담당 반</legend><label className="as-field"><span>부</span><select value={formPart} onChange={event => setFormPart(event.target.value)}><option value="1">1부</option><option value="2">2부</option></select></label><label className="as-field"><span>학년</span><select value={formGrade} onChange={event => setFormGrade(event.target.value)}>{[1, 2, 3].map(grade => <option key={grade} value={String(grade)}>{grade}학년</option>)}</select></label><label className="as-field"><span>반</span><input type="number" min="1" required value={formClass} onChange={event => setFormClass(event.target.value)} /></label></fieldset> : <p className="as-field-help">관리자는 모든 반의 출석과 계정을 관리할 수 있습니다.</p>}
          </div>
          <div className="as-dialog-actions">
            {accountModal.editKey && (deleteAccountConfirm ? <div className="as-account-delete-confirm" role="status"><span>이 계정을 삭제할까요?</span><button type="button" className="as-button as-button-danger" onClick={deleteAccount} disabled={saving}>삭제 확인</button><button type="button" className="as-button" onClick={() => setDeleteAccountConfirm(false)} disabled={saving}>아니오</button></div> : <button type="button" className="as-button as-button-danger as-delete-account" onClick={() => setDeleteAccountConfirm(true)} disabled={saving}>계정 삭제</button>)}
            <div className="as-dialog-save"><button type="button" className="as-button" onClick={closeAccount} disabled={saving}>취소</button><button type="submit" className="as-button as-button-primary" disabled={saving}>{saving ? '저장 중…' : '저장'}</button></div>
          </div>
        </form>
      </AccountDialog>}
    </div>
  );
}

function AccountDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element?.showModal();
    element?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)')?.focus({ preventScroll: true });
    return () => {
      element?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="as-account-dialog" aria-labelledby={titleId} aria-modal="true"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="as-dialog-content"><header className="as-dialog-header"><div><h2 id={titleId}>{title}</h2><p>이메일과 담당 역할을 확인해 주세요.</p></div><button type="button" className="as-button as-button-quiet" onClick={onClose} disabled={busy}>닫기</button></header>{children}</div>
  </dialog>;
}
