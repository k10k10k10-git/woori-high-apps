'use client';
import { useState, useEffect, useRef } from 'react';
import { db, ref, get, push, runTransaction } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { adminActor, buildAdminChangeEntry } from '@/utils/adminChange';
import { restoreMissingClass, restoreMissingStudent, sameStoredValue } from '@/utils/studentPersistence';
import { trashEntries, type TrashEntry } from '@/utils/trash';
import ManagementDialog from './ManagementDialog';
import type { Student } from '@/types';

type TrashStudent = Student & { ck: string; deletedAt: number };
type TrashClass = { ck: string; teacher: string; teacherPhoto?: string | null; students: Record<string, Student>; adminChanges?: Record<string, unknown>; deletedAt: number };

export default function TrashModal({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const [curYear] = useState(state.curYear);
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
  const [restored, setRestored] = useState<Map<string, unknown>>(() => new Map());

  useEffect(() => {
    let active = true;
    get(ref(db, `trash/${curYear}`)).then(snap => {
      if (!active) return;
      const data = (snap.val() ?? {}) as { students?: Record<string, TrashStudent>; classes?: Record<string, TrashClass> };
      setStudents(trashEntries(data.students)); setClasses(trashEntries(data.classes));
      setLoading(false); setLoadError(false);
    }).catch(() => { if (active) { setLoading(false); setLoadError(true); } });
    return () => { active = false; };
  }, [curYear, reload]);

  async function perform(key: string, task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setWorking(key); setError(null); setMessage('');
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'); }
    finally { busyRef.current = false; setWorking(null); setConfirmKey(null); }
  }
  async function removeCopy(path: string, expected: unknown) {
    const target = ref(db, path);
    await get(target);
    const result = await runTransaction(target, current => sameStoredValue(current, expected) ? null : undefined, { applyLocally: false });
    if (!result.committed) throw new Error('삭제 목록이 변경되었습니다. 목록을 다시 불러온 뒤 확인해 주세요.');
  }
  function removeRow(kind: 'students' | 'classes', key: string) {
    if (kind === 'students') setStudents(rows => rows.filter(row => row.key !== key));
    else setClasses(rows => rows.filter(row => row.key !== key));
  }
  async function finishRestore(kind: 'students' | 'classes', key: string, value: unknown) {
    setRestored(previous => new Map(previous).set(`${kind}:${key}`, value));
    try { await removeCopy(`trash/${curYear}/${kind}/${key}`, value); }
    catch { throw new Error('명단 복원은 완료했습니다. 삭제 목록 정리는 끝나지 않았습니다. 해당 항목의 ‘삭제 목록 정리’를 눌러 주세요.'); }
    removeRow(kind, key); setMessage('명단 복원과 삭제 목록 정리가 완료되었습니다.');
  }
  function restoreStudent(entry: TrashEntry<TrashStudent>) {
    const { key, value: item } = entry;
    return perform(`students:${key}`, async () => {
      if (!sameStoredValue(restored.get(`students:${key}`), item)) {
        const student: Student = { ...item };
        delete (student as Partial<TrashStudent>).ck;
        delete (student as Partial<TrashStudent>).deletedAt;
        const target = ref(db, `classes/${curYear}/${item.ck}`);
        await get(target);
        const changeId = push(ref(db, `classes/${curYear}/${item.ck}/adminChanges`)).key!;
        const change = buildAdminChangeEntry({ classKey: item.ck, teacher: state.classData[item.ck]?.teacher, student,
          action: '학생 복원', changeSummary: '최근 삭제 목록에서 학생 명단 복원', actor: adminActor(state.userRole) });
        const result = await runTransaction(target, current => restoreMissingStudent(current, student, changeId, change), { applyLocally: false });
        if (!result.committed) throw new Error('반이 없거나 같은 학생 ID가 이미 존재합니다. 현재 명단을 확인해 주세요.');
      }
      await finishRestore('students', key, item);
    });
  }
  function restoreClass(entry: TrashEntry<TrashClass>) {
    const { key, value: item } = entry;
    return perform(`classes:${key}`, async () => {
      if (!sameStoredValue(restored.get(`classes:${key}`), item)) {
        const target = ref(db, `classes/${curYear}/${item.ck}`);
        await get(target);
        const changeId = push(ref(db, `classes/${curYear}/${item.ck}/adminChanges`)).key!;
        const change = buildAdminChangeEntry({ classKey: item.ck, teacher: item.teacher,
          studentName: `반 전체 (${Object.keys(item.students ?? {}).length}명)`, action: '학생 복원',
          changeSummary: '최근 삭제 목록에서 반과 학생 명단 복원', actor: adminActor(state.userRole) });
        const classValue = { ...item };
        delete (classValue as Partial<TrashClass>).ck;
        delete (classValue as Partial<TrashClass>).deletedAt;
        const result = await runTransaction(target, current => restoreMissingClass(current, {
          ...classValue, teacher: item.teacher, ...(item.teacherPhoto ? { teacherPhoto: item.teacherPhoto } : {}),
          students: item.students ?? {}, adminChanges: { ...item.adminChanges, [changeId]: change },
        }), { applyLocally: false });
        if (!result.committed) throw new Error('같은 반이 이미 존재합니다. 현재 명단을 보호하기 위해 복원을 중단했습니다.');
      }
      await finishRestore('classes', key, item);
    });
  }
  function permanentDelete(kind: 'students' | 'classes', entry: TrashEntry<TrashStudent | TrashClass>) {
    return perform(`${kind}:${entry.key}`, async () => {
      await removeCopy(`trash/${curYear}/${kind}/${entry.key}`, entry.value);
      removeRow(kind, entry.key); setMessage('선택한 삭제본을 영구 삭제했습니다.');
    });
  }
  function actions(kind: 'students' | 'classes', entry: TrashEntry<TrashStudent> | TrashEntry<TrashClass>, restore: () => void) {
    const key = `${kind}:${entry.key}`;
    const alreadyRestored = sameStoredValue(restored.get(key), entry.value);
    return <div className="management-actions">
      {confirmKey === key ? <>
        <span className="management-hint">이 삭제본은 복원할 수 없게 됩니다.</span>
        <button className="btn-danger" disabled={working !== null} onClick={() => { void permanentDelete(kind, entry); }}>영구 삭제 확인</button>
        <button className="btn-secondary" disabled={working !== null} onClick={() => setConfirmKey(null)}>취소</button>
      </> : <>
        <button className="btn-primary" disabled={working !== null} onClick={restore}>{working === key ? '처리 중…' : alreadyRestored ? '삭제 목록 정리' : '복원'}</button>
        {!alreadyRestored && <button className="btn-secondary" disabled={working !== null} onClick={() => setConfirmKey(key)}>영구 삭제</button>}
      </>}
    </div>;
  }
  function dateLabel(value: number) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '삭제 시각 미상' : date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }
  const classLabel = (key: string) => key.split('-').map((part, index) => `${part}${['부', '학년', '반'][index]}`).join(' ');
  return <ManagementDialog title="최근 삭제 목록" description={`${curYear}년 삭제본입니다. 명단만 복원하며, 삭제된 출석 기록은 복원되지 않습니다.`}
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
          <p>{classLabel(entry.value.ck)} · {dateLabel(entry.value.deletedAt)}</p></div>
          {actions('students', entry, () => { void restoreStudent(entry); })}</div>)}
        {classes.length > 0 && <h3 className="management-trash-section">반 삭제본</h3>}
        {classes.map(entry => <div key={entry.key} className="management-trash-row"><div><strong>{classLabel(entry.value.ck)}</strong>
          <p>{entry.value.teacher || '담당 교사 없음'} · 학생 {Object.keys(entry.value.students ?? {}).length}명<br />{dateLabel(entry.value.deletedAt)}</p></div>
          {actions('classes', entry, () => { void restoreClass(entry); })}</div>)}
      </>}
    <div className="btn-row"><button className="btn-secondary" disabled={working !== null || loading} onClick={() => { setLoading(true); setError(null); setLoadError(false); setReload(value => value + 1); }}>목록 새로고침</button></div>
  </>}</ManagementDialog>;
}
