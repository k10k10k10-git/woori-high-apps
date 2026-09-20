'use client';
import { useEffect, useRef, useState } from 'react';
import { db, onValue, push, ref } from '@/lib/db';
import { showToast } from '@/utils/toast';
import { parseTeacherMessages, parseYearTeacherMessages, type TeacherMessage } from '@/utils/teacherMessages';

export type OpenVisitRequest = TeacherMessage & { classKey: string };

export function useVisitRequests(year: number, classKey: string, enabled: boolean, teacher: string) {
  const scope = `${year}/${classKey}`;
  const [list, setList] = useState<{ scope: string; items: TeacherMessage[]; error: boolean } | null>(null);
  const [draft, setDraft] = useState({ scope, studentId: '', text: '' });
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const stop = onValue(ref(db, `suggestions/${scope}`), snap => {
      if (active) setList({ scope, items: parseTeacherMessages(snap.val(), 'visit'), error: false });
    }, () => { if (active) setList({ scope, items: [], error: true }); });
    return () => { active = false; stop?.(); };
  }, [enabled, scope]);

  const current = draft.scope === scope ? draft : { scope, studentId: '', text: '' };
  async function submit(studentName: string) {
    if (!current.studentId || !studentName || !current.text.trim() || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await push(ref(db, `suggestions/${scope}`), {
        kind: 'visit', studentId: current.studentId, studentName,
        text: current.text.trim(), status: 'open', createdAt: Date.now(), author: teacher,
      });
      setDraft(value => value.scope === scope && value.studentId === current.studentId && value.text === current.text
        ? { scope, studentId: '', text: '' } : value);
      showToast('심방 요청이 등록되었습니다.');
    } catch { showToast('저장에 실패했습니다. 내용을 보존했으니 다시 시도해 주세요.'); }
    finally { inFlight.current = false; setSaving(false); }
  }

  return {
    visitRequests: list?.scope === scope ? list.items : [],
    visitLoadError: list?.scope === scope && list.error,
    visitStudentId: current.studentId,
    setVisitStudentId: (studentId: string) => setDraft(value => ({ scope, studentId, text: value.scope === scope ? value.text : '' })),
    visitText: current.text,
    setVisitText: (text: string) => setDraft(value => ({ scope, studentId: value.scope === scope ? value.studentId : '', text })),
    visitSaving: saving,
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
