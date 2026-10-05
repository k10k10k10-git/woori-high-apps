'use client';
import { useEffect, useState } from 'react';
import { db, onValue, ref } from '@/lib/db';
import { showToast } from '@/utils/toast';
import { parseTeacherMessages, parseYearTeacherMessages, type TeacherMessage } from '@/utils/teacherMessages';
import { useTeacherMessageSave } from './useTeacherMessageSave';

export type OpenVisitRequest = TeacherMessage & { classKey: string };

export function useVisitRequests(year: number, classKey: string, enabled: boolean, teacher: string) {
  const scope = `${year}/${classKey}`;
  const [list, setList] = useState<{ scope: string; items: TeacherMessage[]; error: boolean } | null>(null);
  const { current, setStudentId, setText, saving, submit: save, saveError, retrying } = useTeacherMessageSave(year, classKey, 'visit');

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const stop = onValue(ref(db, `suggestions/${scope}`), snap => {
      if (active) setList({ scope, items: parseTeacherMessages(snap.val(), 'visit'), error: false });
    }, () => { if (active) setList({ scope, items: [], error: true }); });
    return () => { active = false; stop?.(); };
  }, [enabled, scope]);

  async function submit(studentName: string, studentPersonId?: string) {
    const saved = await save(() => {
      if (!current.studentId || !studentName || !current.text.trim()) return null;
      return {
        kind: 'visit', studentId: current.studentId, studentName,
        ...(studentPersonId ? { studentPersonId } : {}),
        text: current.text.trim(), status: 'open', createdAt: Date.now(), author: teacher,
      };
    });
    if (saved) showToast('심방 요청이 등록되었습니다.');
  }

  return {
    visitRequests: list?.scope === scope ? list.items : [],
    visitLoadError: list?.scope === scope && list.error,
    visitStudentId: current.studentId,
    setVisitStudentId: setStudentId,
    visitText: current.text,
    setVisitText: setText,
    visitSaving: saving,
    visitSaveError: saveError,
    visitRetrying: retrying,
    handleVisitSubmit: submit,
  };
}

export function useOpenVisitRequests(year: number) {
  const [load, setLoad] = useState<{ year: number; rows: OpenVisitRequest[]; status: 'loading' | 'ready' | 'error' }>({ year, rows: [], status: 'loading' });
  useEffect(() => {
    let active = true;
    const stop = onValue(ref(db, `suggestions/${year}`), snap => {
      if (!active) return;
      const rows = Object.entries(parseYearTeacherMessages(snap.val(), 'visit'))
        .flatMap(([classKey, items]) => items.map(item => ({ ...item, classKey })))
        .filter(item => item.status !== 'done')
        .sort((a, b) => b.createdAt - a.createdAt);
      setLoad({ year, rows, status: 'ready' });
    }, () => { if (active) setLoad({ year, rows: [], status: 'error' }); });
    return () => { active = false; stop?.(); };
  }, [year]);
  return load.year === year ? load : { year, rows: [], status: 'loading' as const };
}
