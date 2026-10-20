'use client';
import { useState, useEffect, useRef } from 'react';
import { db, ref, get } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { adminActor } from '@/utils/adminChange';
import { restoreRoster, permanentDeleteRosterCopy } from '@/lib/rosterRestore';
import { trashEntries, type TrashEntry } from '@/utils/trash';
import { normalizeAttendanceRecord } from '@/utils/attendanceValue';
import ManagementDialog from './ManagementDialog';
import type { Student } from '@/types';

type TrashStudent = Student & { ck: string; deletedAt: number };
type TrashClass = { ck: string; teacher: string; teacherPhoto?: string | null; students: Record<string, Student>; adminChanges?: Record<string, unknown>; deletedAt: number };

export default function TrashModal({ onClose }: { onClose: () => void }) {
  const { state, getState } = useApp();
  const [curYear] = useState(state.curYear);
  const [revision] = useState(state.dataRevision);
  const current = useRef(state);
  current.current = state;
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const isCurrent = () => {
    const latest = getState ? getState() : current.current;
    return active.current && latest.curYear === curYear && latest.dataRevision === revision && latest.userRole?.role === 'admin';
  };
  const [students, setStudents] = useState<TrashEntry<TrashStudent>[]>([]);
  const [classes, setClasses] = useState<TrashEntry<TrashClass>[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [retainedAttendance, setRetainedAttendance] = useState<Record<string, Record<string, Record<string, unknown>>>>({});

  useEffect(() => {
    let active = true;
    Promise.all([get(ref(db, `trash/${curYear}`)), get(ref(db, `attendance/${curYear}`))]).then(([snap, attendance]) => {
      if (!active) return;
      const data = (snap.val() ?? {}) as { students?: Record<string, TrashStudent>; classes?: Record<string, TrashClass> };
      setStudents(trashEntries(data.students)); setClasses(trashEntries(data.classes));
      setRetainedAttendance(attendance.val() ?? {});
      setLoading(false); setLoadError(false);
    }).catch(() => { if (active) { setLoading(false); setLoadError(true); } });
    return () => { active = false; };
  }, [curYear, reload]);

  async function perform(key: string, task: () => Promise<void>) {
    if (busyRef.current || !isCurrent()) return;
    busyRef.current = true; setWorking(key); setError(null); setMessage('');
    try { await task(); }
    catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : '처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'); }
    finally { busyRef.current = false; if (active.current) { setWorking(null); setConfirmKey(null); } }
  }
  function removeRow(kind: 'students' | 'classes', key: string) {
    if (kind === 'students') setStudents(rows => rows.filter(row => row.key !== key));
    else setClasses(rows => rows.filter(row => row.key !== key));
  }
  function restoreStudent(entry: TrashEntry<TrashStudent>) {
    const { key, value: item } = entry;
    return perform(`students:${key}`, async () => {
      await restoreRoster({ year: curYear, kind: 'students', key, value: item, actor: adminActor(state.userRole) }, isCurrent);
      if (!isCurrent()) return;
      removeRow('students', key); setMessage('명단 복원과 삭제 목록 정리가 함께 완료되었습니다.');
    });
  }
  function restoreClass(entry: TrashEntry<TrashClass>) {
    const { key, value: item } = entry;
    return perform(`classes:${key}`, async () => {
      await restoreRoster({ year: curYear, kind: 'classes', key, value: item, actor: adminActor(state.userRole) }, isCurrent);
      if (!isCurrent()) return;
      removeRow('classes', key); setMessage('반 명단 복원과 삭제 목록 정리가 함께 완료되었습니다.');
    });
  }
  function permanentDelete(kind: 'students' | 'classes', entry: TrashEntry<TrashStudent | TrashClass>) {
    return perform(`${kind}:${entry.key}`, async () => {
      await permanentDeleteRosterCopy({ year: curYear, kind, key: entry.key, value: entry.value, actor: adminActor(state.userRole) }, isCurrent);
      if (!isCurrent()) return;
      removeRow(kind, entry.key); setMessage('선택한 삭제본을 영구 삭제했습니다.');
    });
  }
  function actions(kind: 'students' | 'classes', entry: TrashEntry<TrashStudent> | TrashEntry<TrashClass>, restore: () => void) {
    const key = `${kind}:${entry.key}`;
    return <div className="management-actions">
      {confirmKey === key ? <>
        <span className="management-hint">이 사본으로 명단을 복원할 수 없게 됩니다. 보관 출석은 자동 삭제하지 않습니다.</span>
        <button className="btn-danger" disabled={working !== null} onClick={() => { void permanentDelete(kind, entry); }}>영구 삭제 확인</button>
        <button className="btn-secondary" disabled={working !== null} onClick={() => setConfirmKey(null)}>취소</button>
      </> : <>
        <button className="btn-primary" disabled={working !== null} onClick={restore}>{working === key ? '처리 중…' : '복원'}</button>
        <button className="btn-secondary" disabled={working !== null} onClick={() => setConfirmKey(key)}>영구 삭제</button>
      </>}
    </div>;
  }
  function dateLabel(value: number) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '삭제 시각 미상' : date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }
  const classLabel = (key: string) => key.split('-').map((part, index) => `${part}${['부', '학년', '반'][index]}`).join(' ');
  function attendanceLabel(classKey: string, studentIds: string[]) {
    const count = studentIds.reduce((sum, id) => sum + Object.keys(normalizeAttendanceRecord(retainedAttendance[classKey]?.[id])).length, 0);
    return count ? `보관 출석 ${count}건 · 같은 학생 ID로 다시 연결` : '보관 출석 없음 · 과거에 삭제된 기록은 복원할 수 없음';
  }
  return <ManagementDialog title="최근 삭제 목록" description={`${curYear}년 복구 사본입니다. 명단 복원 시 남아 있는 출석을 같은 ID로 다시 연결하며, 현재 출석값을 덮지 않습니다.`}
    busy={working !== null} onClose={onClose}>{() => <>
    {error && <p className="management-error" role="alert">{error}</p>}
    {message && <p className="management-status" role="status">{message}</p>}
    {loadError ? <div className="management-error" role="alert"><p>삭제 목록을 불러오지 못했습니다.</p>
      <button className="btn-secondary" onClick={() => { setLoading(true); setLoadError(false); setReload(value => value + 1); }}>다시 불러오기</button></div>
      : loading ? <p role="status" className="management-status">삭제 목록을 불러오고 있습니다.</p>
      : <>
        <p className="management-hint">학생 {students.length}건 · 반 {classes.length}건. 확인한 항목만 복원하거나 영구 삭제해 주세요.</p>
        {!students.length && !classes.length && <p className="management-status">최근 삭제된 항목이 없습니다.</p>}
        {students.length > 0 && <h3 className="management-trash-section">학생 삭제본</h3>}
        {students.map(entry => <div key={entry.key} className="management-trash-row"><div><strong>{entry.value.name}</strong>
          <p>{classLabel(entry.value.ck)} · {dateLabel(entry.value.deletedAt)}</p><p>{attendanceLabel(entry.value.ck, [entry.value.id])}</p></div>
          {actions('students', entry, () => { void restoreStudent(entry); })}</div>)}
        {classes.length > 0 && <h3 className="management-trash-section">반 삭제본</h3>}
        {classes.map(entry => <div key={entry.key} className="management-trash-row"><div><strong>{classLabel(entry.value.ck)}</strong>
          <p>{entry.value.teacher || '담당 교사 없음'} · 학생 {Object.keys(entry.value.students ?? {}).length}명<br />{dateLabel(entry.value.deletedAt)}</p><p>{attendanceLabel(entry.value.ck, Object.keys(entry.value.students ?? {}))}</p></div>
          {actions('classes', entry, () => { void restoreClass(entry); })}</div>)}
      </>}
    <div className="btn-row"><button className="btn-secondary" disabled={working !== null || loading} onClick={() => { setLoading(true); setError(null); setLoadError(false); setReload(value => value + 1); }}>목록 새로고침</button></div>
  </>}</ManagementDialog>;
}
