'use client';
import { useState, useEffect } from 'react';
import { ref, get, set, update } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';
import { sortAndRenumber } from '@/utils/dates';
import { showToast } from '@/utils/toast';
import type { Student } from '@/types';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
      const now = Date.now();
      const cleanupPaths: Record<string, null> = {};

      // 학생 — 7일 지난 항목 자동 삭제
      const stuList: TrashStudent[] = [];
      if (data.students) {
        for (const [id, item] of Object.entries(data.students)) {
          if (now - item.deletedAt > SEVEN_DAYS_MS) {
            cleanupPaths[`trash/${curYear}/students/${id}`] = null;
          } else {
            stuList.push(item);
          }
        }
      }
      stuList.sort((a, b) => b.deletedAt - a.deletedAt);

      // 반 — 7일 지난 항목 자동 삭제
      const clsList: TrashClass[] = [];
      if (data.classes) {
        for (const [key, item] of Object.entries(data.classes)) {
          if (now - item.deletedAt > SEVEN_DAYS_MS) {
            cleanupPaths[`trash/${curYear}/classes/${key}`] = null;
          } else {
            clsList.push(item);
          }
        }
      }
      clsList.sort((a, b) => b.deletedAt - a.deletedAt);

      // 만료된 항목 정리
      if (Object.keys(cleanupPaths).length > 0) {
        await update(ref(db), cleanupPaths).catch(() => {});
      }

      setStudents(stuList);
      setClasses(clsList);
      setLoading(false);
    }
    load();
  }, [curYear]);

  async function restoreStudent(item: TrashStudent) {
    setWorking(item.id);
    try {
      const snap = await get(ref(db, `classes/${curYear}/${item.ck}/students`));
      const existing: Record<string, Student> = snap.exists() ? snap.val() : {};
      const list = sortAndRenumber([...Object.values(existing), { id: item.id, name: item.name, birth: item.birth, phone: item.phone, pphone: item.pphone, school: item.school, addr: item.addr, photo: item.photo }]);
      const obj: Record<string, unknown> = {};
      list.forEach(s => { obj[s.id] = s; });
      await update(ref(db), {
        [`classes/${curYear}/${item.ck}/students`]: obj,
        [`trash/${curYear}/students/${item.id}`]: null,
      });
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
      await update(ref(db), {
        [`classes/${curYear}/${item.ck}`]: {
          teacher: item.teacher,
          ...(item.teacherPhoto ? { teacherPhoto: item.teacherPhoto } : {}),
          students: studentsObj,
        },
        [`trash/${curYear}/classes/${trashKey}`]: null,
      });
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

  function daysLeft(deletedAt: number) {
    const remaining = SEVEN_DAYS_MS - (Date.now() - deletedAt);
    return Math.max(1, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  }

  return (
    <div className="modal-overlay center-modal" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      role="dialog" aria-modal="true" aria-label="최근 삭제 목록">
      <div className="modal-dialog" style={{ maxWidth: 480, width: '95vw', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">최근 삭제 목록</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
          삭제 후 7일간 보관됩니다. 복원 또는 영구 삭제할 수 있습니다.
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
                        {item.ck.replace(/-/g, ' ')}반 · {daysLeft(item.deletedAt)}일 후 자동 삭제
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
                          {item.teacher || '담당 교사 없음'} · 학생 {studentCount}명 · {daysLeft(item.deletedAt)}일 후 자동 삭제
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
