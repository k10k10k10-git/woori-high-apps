'use client';
import { useState, useEffect } from 'react';
import { db, ref, get, push, set, runTransaction } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { showToast } from '@/utils/toast';
import { adminActor, buildAdminChangeEntry } from '@/utils/adminChange';
import { restoreMissingClass, restoreMissingStudent, sameStoredValue } from '@/utils/studentPersistence';
import type { Student } from '@/types';

type TrashStudent = Student & { ck: string; deletedAt: number };
type TrashClass = {
  ck: string;
  teacher: string;
  teacherPhoto?: string | null;
  students: Record<string, Student>;
  deletedAt: number;
};

export default function TrashModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp();
  const { curYear } = state;
  const [students, setStudents] = useState<TrashStudent[]>([]);
  const [classes, setClasses]   = useState<TrashClass[]>([]);
  const [loading, setLoading]   = useState(true);
  const [working, setWorking]   = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const snap = await get(ref(db, `trash/${curYear}`));
      if (!snap.exists()) { setLoading(false); return; }
      const data = snap.val() as {
        students?: Record<string, TrashStudent>;
        classes?: Record<string, TrashClass>;
      };
      // 조회만으로 운영 데이터를 지우지 않는다. 영구 삭제는 각 항목의 확인 버튼에서만 실행한다.
      const stuList = Object.values(data.students ?? {});
      stuList.sort((a, b) => b.deletedAt - a.deletedAt);
      const clsList = Object.values(data.classes ?? {});
      clsList.sort((a, b) => b.deletedAt - a.deletedAt);

      setStudents(stuList);
      setClasses(clsList);
      setLoading(false);
    }
    load().catch(() => { setLoading(false); showToast('삭제 목록을 불러오지 못했습니다. 다시 열어 주세요.'); });
  }, [curYear]);

  async function cleanupTrash(path: string, expected: unknown): Promise<boolean> {
    try {
      const target = ref(db, path);
      await get(target);
      const result = await runTransaction(target, current => sameStoredValue(current, expected) ? null : undefined, { applyLocally: false });
      if (result.committed) return true;
    } catch { /* 복원된 원장은 유지하고 휴지통만 재확인하도록 안내한다. */ }
    showToast('복원은 완료했지만 삭제 목록 정리가 끝나지 않았습니다. 새로고침 후 확인해 주세요.');
    return false;
  }

  async function restoreStudent(item: TrashStudent) {
    setWorking(item.id);
    try {
      const restoredStudent: Student = { ...item };
      delete (restoredStudent as Partial<TrashStudent>).ck;
      delete (restoredStudent as Partial<TrashStudent>).deletedAt;
      const changeId = push(ref(db, `classes/${curYear}/${item.ck}/adminChanges`)).key ?? `change_${Date.now()}`;
      const classRef = ref(db, `classes/${curYear}/${item.ck}`);
      await get(classRef);
      const change = buildAdminChangeEntry({
        classKey: item.ck, teacher: state.classData[item.ck]?.teacher,
        student: restoredStudent, action: '학생 복원',
        changeSummary: '최근 삭제 목록에서 학생 명단 복원', actor: adminActor(state.userRole),
      });
      const result = await runTransaction(classRef,
        current => restoreMissingStudent(current, restoredStudent, changeId, change), { applyLocally: false });
      if (!result.committed) { showToast('반이 없거나 같은 학생 ID가 이미 존재합니다. 현재 명단을 확인해 주세요.'); return; }
      if (!await cleanupTrash(`trash/${curYear}/students/${item.id}`, item)) return;
      setStudents(prev => prev.filter(s => s.id !== item.id));
      showToast(`${item.name} 학생이 복원되었습니다.`, 'success');
    } catch {
      showToast('복원에 실패했습니다.');
    } finally {
      setWorking(null);
    }
  }

  async function restoreClass(item: TrashClass) {
    const trashKey = item.ck.replace(/-/g, '_');
    setWorking(trashKey);
    try {
      const studentsObj = item.students ?? {};
      const changeId = push(ref(db, `classes/${curYear}/${item.ck}/adminChanges`)).key ?? `change_${Date.now()}`;
      const change = buildAdminChangeEntry({
        classKey: item.ck,
        teacher: item.teacher,
        studentName: `반 전체 (${Object.keys(studentsObj).length}명)`,
        action: '학생 복원',
        changeSummary: '최근 삭제 목록에서 반과 학생 명단 복원',
        actor: adminActor(state.userRole),
      });
      const restored = {
        teacher: item.teacher, ...(item.teacherPhoto ? { teacherPhoto: item.teacherPhoto } : {}),
        students: studentsObj, adminChanges: { [changeId]: change },
      };
      const classRef = ref(db, `classes/${curYear}/${item.ck}`);
      await get(classRef);
      const result = await runTransaction(classRef,
        current => restoreMissingClass(current, restored), { applyLocally: false });
      if (!result.committed) { showToast('같은 반이 이미 존재해 복원을 중단했습니다.'); return; }
      if (!await cleanupTrash(`trash/${curYear}/classes/${trashKey}`, item)) return;
      dispatch({ type: 'SET_CLASS', payload: item.ck.split('-')[2] });
      setClasses(prev => prev.filter(c => c.ck !== item.ck));
      showToast(`${item.ck} 반이 복원되었습니다.`, 'success');
    } catch {
      showToast('복원에 실패했습니다.');
    } finally {
      setWorking(null);
    }
  }

  async function permDeleteStudent(item: TrashStudent) {
    setWorking(item.id);
    try {
      await set(ref(db, `trash/${curYear}/students/${item.id}`), null);
      setStudents(prev => prev.filter(s => s.id !== item.id));
    } catch {
      showToast('삭제에 실패했습니다.');
    } finally {
      setWorking(null);
    }
  }

  async function permDeleteClass(item: TrashClass) {
    const trashKey = item.ck.replace(/-/g, '_');
    setWorking(trashKey);
    try {
      await set(ref(db, `trash/${curYear}/classes/${trashKey}`), null);
      setClasses(prev => prev.filter(c => c.ck !== item.ck));
    } catch {
      showToast('삭제에 실패했습니다.');
    } finally {
      setWorking(null);
    }
  }

  function deletedAtLabel(deletedAt: number) {
    const date = new Date(deletedAt);
    if (Number.isNaN(date.getTime())) return '삭제 시각 미상';
    return `${date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 삭제`;
  }

  return (
    <div className="modal-overlay center-modal" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      role="dialog" aria-modal="true" aria-label="최근 삭제 목록">
      <div className="modal-dialog" style={{ maxWidth: 480, width: '95vw', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">최근 삭제 목록</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
          자동으로 정리되지 않습니다. 확인 후 복원하거나 영구 삭제할 수 있습니다.
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>불러오는 중...</div>
        ) : students.length === 0 && classes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>
            최근 삭제된 항목이 없습니다.
          </div>
        ) : (
          <>
            {/* 삭제된 학생 */}
            {students.length > 0 && (
              <>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text2)', marginBottom: 6, marginTop: 4 }}>학생</div>
                {students.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {item.ck.replace(/-/g, ' ')}반 · {deletedAtLabel(item.deletedAt)}
                      </div>
                    </div>
                    {confirmKey === item.id ? (
                      <>
                        <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} disabled={working !== null} onClick={() => permDeleteStudent(item)}>확인</button>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setConfirmKey(null)}>취소</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }} disabled={working !== null} onClick={() => restoreStudent(item)}>복원</button>
                        <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} disabled={working !== null} onClick={() => setConfirmKey(item.id)}>삭제</button>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* 삭제된 반 */}
            {classes.length > 0 && (
              <>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text2)', marginBottom: 6, marginTop: 12 }}>반</div>
                {classes.map(item => {
                  const [part, grade, cls] = item.ck.split('-');
                  const studentCount = Object.keys(item.students ?? {}).length;
                  return (
                    <div key={item.ck} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{part}부 {grade}학년 {cls}반</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {item.teacher || '담당 교사 없음'} · 학생 {studentCount}명 · {deletedAtLabel(item.deletedAt)}
                        </div>
                      </div>
                      {confirmKey === item.ck ? (
                        <>
                          <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} disabled={working !== null} onClick={() => permDeleteClass(item)}>확인</button>
                          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setConfirmKey(null)}>취소</button>
                        </>
                      ) : (
                        <>
                          <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }} disabled={working !== null} onClick={() => restoreClass(item)}>복원</button>
                          <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} disabled={working !== null} onClick={() => setConfirmKey(item.ck)}>삭제</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn-secondary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
