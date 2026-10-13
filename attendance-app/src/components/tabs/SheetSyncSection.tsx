'use client';
import { useEffect, useRef, useState } from 'react';
import { db, ref, get, push, set } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { showToast } from '@/utils/toast';
import {
  extractSheetId, fetchClassTabs,
  buildSyncPlan, buildSyncPayload, describeSheetSyncForClass,
  type SyncPlan, type ParsedClass, type AttendanceYear,
} from '@/lib/sheetSync';
import { commitSheetSync } from '@/lib/sheetSyncCommit';
import AdminStatusBadge from '@/components/admin/AdminStatusBadge';
import type { Student } from '@/types';
import { adminActor, adminChangePath, buildAdminChangeEntry } from '@/utils/adminChange';

type CurrentClasses = Record<string, { teacher?: string; students?: Record<string, Student> }>;

const ckLabel = (ck: string) => {
  const [p, g, c] = ck.split('-');
  return `${p}부 ${g}학년 ${c}반`;
};

export default function SheetSyncSection() {
  const { state } = useApp();
  const { curYear } = state;

  const [bu1Url, setBu1Url] = useState('');
  const [bu2Url, setBu2Url] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applyingRef = useRef(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [currentRef, setCurrentRef] = useState<CurrentClasses | null>(null);
  const [historicalRef, setHistoricalRef] = useState<Record<string, unknown> | null>(null);
  const [attendanceRef, setAttendanceRef] = useState<AttendanceYear | null>(null);
  const [removeMissing, setRemoveMissing] = useState(false);

  // 저장된 시트 URL 로드
  useEffect(() => {
    get(ref(db, 'config/sheetSync')).then(snap => {
      if (snap.exists()) {
        const v = snap.val() as { bu1Url?: string; bu2Url?: string };
        setBu1Url(v.bu1Url ?? '');
        setBu2Url(v.bu2Url ?? '');
      }
    }).catch(() => { /* 설정 없음 — 무시 */ });
  }, []);

  async function saveUrls() {
    try {
      await set(ref(db, 'config/sheetSync'), { bu1Url: bu1Url.trim(), bu2Url: bu2Url.trim() });
      showToast('시트 주소를 저장했습니다.', 'success');
    } catch {
      showToast('시트 주소 저장에 실패했습니다.', 'error');
    }
  }

  async function loadPreview() {
    if (applyingRef.current || uncertain) return;
    setError(null);
    setPlan(null);
    const id1 = extractSheetId(bu1Url);
    const id2 = extractSheetId(bu2Url);
    if (!id1 && !id2) { setError('1부 또는 2부 시트 주소를 입력해주세요.'); return; }

    setLoading(true);
    setProgress('');
    try {
      const [allSnap, attSnap] = await Promise.all([
        get(ref(db, 'classes')),
        // 반이 바뀐 학생의 옛 출석을 새 반으로 이관하려면 올해 출석 기록이 필요하다.
        get(ref(db, `attendance/${curYear}`)),
      ]);
      const allClasses = allSnap.exists() ? allSnap.val() as Record<string, unknown> : {};
      const current = (allClasses[String(curYear)] ?? {}) as CurrentClasses;
      const attendance = attSnap.exists() ? attSnap.val() as AttendanceYear : {};

      const classes: ParsedClass[] = [];
      if (id1) {
        setProgress('1부 불러오는 중…');
        classes.push(...await fetchClassTabs(id1, '1', curYear,
          (d, t) => setProgress(`1부 ${d}/${t}개 탭`)));
      }
      if (id2) {
        setProgress('2부 불러오는 중…');
        classes.push(...await fetchClassTabs(id2, '2', curYear,
          (d, t) => setProgress(`2부 ${d}/${t}개 탭`)));
      }

      if (classes.length === 0) {
        setError('반 탭을 찾지 못했습니다. 시트 공유 설정(링크가 있는 모든 사용자 — 뷰어)을 확인해주세요.');
        return;
      }
      setCurrentRef(current);
      setHistoricalRef(allClasses);
      setAttendanceRef(attendance);
      setPlan(buildSyncPlan(classes, current, attendance));
    } catch (e) {
      setError(e instanceof Error ? e.message : '시트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  }

  async function applySync() {
    if (!plan || !currentRef || !historicalRef || !attendanceRef || applyingRef.current || uncertain) return;
    applyingRef.current = true;
    setApplyError(null);
    setRunning(true);
    try {
      const payload = buildSyncPayload(plan, curYear, currentRef, removeMissing, historicalRef, attendanceRef ?? undefined);
      // 변동이 없는 반은 기록을 남기지 않는다. 예전에는 동기화할 때마다 모든 반에
      // "신규 0명 · 이동 0명"이 쌓여 정작 사람이 바뀐 반을 찾을 수 없었다.
      plan.classes.forEach((classPlan) => {
        const change = describeSheetSyncForClass(plan, classPlan.ck, removeMissing);
        if (!change) return;
        const changeId = push(ref(db, `classes/${curYear}/${classPlan.ck}/adminChanges`)).key ?? `change_${Date.now()}_${classPlan.ck}`;
        payload[adminChangePath(curYear, classPlan.ck, changeId)] = buildAdminChangeEntry({
          classKey: classPlan.ck,
          teacher: classPlan.teacher,
          studentName: change.studentName,
          action: '시트 동기화',
          changeSummary: change.changeSummary,
          actor: adminActor(state.userRole),
        });
      });
      await commitSheetSync({
        year: curYear, classes: historicalRef, attendance: attendanceRef, payload,
        classKeys: [...plan.classes.map(c => c.ck), ...plan.moved.map(m => m.fromCk)],
      });
      showToast(`${plan.classCount}개 반 · ${plan.totalStudents}명 동기화 완료`, 'success');
      setPlan(null);
    } catch (e) {
      setPlan(null);
      const message = e instanceof Error ? e.message : '동기화 적용에 실패했습니다.';
      setApplyError(message);
      if (message.includes('불명확')) setUncertain(true);
    } finally {
      applyingRef.current = false;
      setRunning(false);
    }
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '14px 16px', marginTop: 16 }}>
      <h3 className="admin-section-title">구글 시트 동기화 ({curYear}년)</h3>
      <div style={{ fontSize: 11, color: 'var(--text3)', margin: '6px 0 12px' }}>
        출석부 구글 시트의 명단·출석을 불러옵니다. <strong>1부·2부 주소를 함께 넣고 한 번에</strong> 미리보기하세요
        (한 부만 넣으면 다른 부로 이동한 학생이 “제외”로 잘못 보입니다).
        <strong> 반드시 미리보기로 변경 내용을 확인한 뒤</strong> 적용하세요. 시트 공유는 “링크가 있는 모든 사용자 — 뷰어”여야 합니다.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        <label className="as-sheet-label"><span>1부 출석부 시트 주소</span><input className="form-input" placeholder="https://docs.google.com/spreadsheets/…" value={bu1Url} onChange={e => setBu1Url(e.target.value)} /></label>
        <label className="as-sheet-label"><span>2부 출석부 시트 주소</span><input className="form-input" placeholder="https://docs.google.com/spreadsheets/…" value={bu2Url} onChange={e => setBu2Url(e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={saveUrls}>주소 저장</button>
          <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12, marginLeft: 'auto' }} disabled={loading || running || uncertain} onClick={loadPreview}>
            {loading ? (progress || '불러오는 중…') : '동기화 미리보기'}
          </button>
        </div>
      </div>

      {applyError && <div className="as-sync-error" role="alert" style={{ padding: 14, marginBlock: 12, background: 'var(--red-bg)', color: '#991b1b', borderRadius: 14, lineHeight: 1.6 }}>
        <strong>{uncertain ? '반영 여부 확인이 필요합니다' : '동기화를 완료하지 못했습니다'}</strong>
        <p>{applyError}</p>
        {!uncertain && <p>현재 명단을 확인한 뒤 새 미리보기를 만들어 주세요.</p>}
      </div>}
      {error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '8px 12px', fontSize: 12, color: 'var(--red-text)' }}>
          ⚠ {error}
        </div>
      )}

      {plan && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            미리보기: {plan.classCount}개 반 · {plan.totalStudents}명
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, fontSize: 11 }}>
            <AdminStatusBadge label={`신규 ${plan.added.length}명`} tone="info" />
            <AdminStatusBadge label={`반 이동 ${plan.moved.length}명`} tone="warning" />
            <AdminStatusBadge label={`제외 ${plan.removed.length}명`} tone="danger" />
            <AdminStatusBadge label={`장결자 ${plan.jangCount}명`} tone="neutral" />
            {plan.ambiguous.length > 0 && (
              <AdminStatusBadge label={`확인 필요 ${plan.ambiguous.length}명`} tone="warning" />
            )}
            <AdminStatusBadge label={`출석 ${plan.attendanceChanges}건`} tone="info" />
          </div>

          {plan.ambiguous.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber-text)', marginBottom: 4 }}>확인 필요 — 동명이인·생년월일·본인 연락처를 확인하고 다시 미리보기해 주세요. 확인 전에는 반영하지 않습니다.</div>
              <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 12, color: 'var(--text2)' }}>
                {plan.ambiguous.map((a, i) => <span key={i} style={{ marginRight: 8 }}>{a.name}({ckLabel(a.ck)})</span>)}
              </div>
            </div>
          )}

          {plan.moved.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>반 이동</div>
              <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                {plan.moved.map((m, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '2px 0', color: 'var(--text2)' }}>
                    {m.name}: {ckLabel(m.fromCk)} → <strong>{ckLabel(m.toCk)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {plan.attendanceMoves.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>
                출석 기록 이관 ({plan.attendanceMoves.length}명)
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                반이 바뀐 학생의 옛 반 출석을 새 반으로 옮기고 옛 기록을 정리합니다. 시트에 값이 있는 칸은 시트 값을 따릅니다.
              </div>
              <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                {plan.attendanceMoves.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '2px 0', color: 'var(--text2)' }}>
                    {a.name}: {ckLabel(a.fromCk)} → <strong>{ckLabel(a.toCk)}</strong>
                    <span style={{ color: 'var(--text3)' }}>
                      {' '}· 이관 {a.carried}칸{a.superseded > 0 ? ` · 시트 값으로 대체 ${a.superseded}칸` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {plan.added.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>신규 등록</div>
              <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 12, color: 'var(--text2)' }}>
                {plan.added.map((a, i) => <span key={i} style={{ marginRight: 8 }}>{a.name}({ckLabel(a.ck)})</span>)}
              </div>
            </div>
          )}

          {plan.removed.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red-text)', marginBottom: 4 }}>
                제외 후보 (시트에 없는 학생 — 기본은 <strong>유지</strong>됨)
              </div>
              <div style={{ maxHeight: 100, overflowY: 'auto', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
                {plan.removed.map((r, i) => <span key={i} style={{ marginRight: 8 }}>{r.name}({ckLabel(r.ck)})</span>)}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--red-text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={removeMissing} onChange={e => setRemoveMissing(e.target.checked)} />
                이 학생들을 해당 반에서 삭제 (1부·2부를 모두 동기화했고, 정말 떠난 학생일 때만 체크)
              </label>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn-secondary" onClick={() => setPlan(null)} disabled={running}>취소</button>
            <button className="btn-primary" onClick={applySync} disabled={running || plan.ambiguous.length > 0}>
              {running ? '적용 중…' : '동기화 적용'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
