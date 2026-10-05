'use client';
import { useEffect, useRef, useState } from 'react';
import { db, ref, onValue, push } from '@/lib/db';
import { showToast } from '@/utils/toast';
import { parseTeacherMessages, type TeacherMessage } from '@/utils/teacherMessages';
import { useTeacherDraft } from './useTeacherDraft';

export function useSuggestions(year: number, classKey: string, listEnabled: boolean, teacher: string) {
  const scope = `${year}/${classKey}`;
  const [list, setList] = useState<{ scope: string; items: TeacherMessage[]; error: boolean } | null>(null);
  const { current, setStudentId, setText, clearSaved, saving, setSaving } = useTeacherDraft(scope, 'note');
  const inFlight = useRef(false);
  useEffect(() => {
    if (!listEnabled) return;
    let active = true;
    const stop = onValue(ref(db, `suggestions/${scope}`), snap => {
      if (!active) return;
      setList({ scope, items: parseTeacherMessages(snap.val(), 'note'), error: false });
    }, () => { if (active) setList({ scope, items: [], error: true }); });
    return () => { active = false; stop?.(); };
  }, [scope, listEnabled]);
  async function submit(studentName?: string) {
    if (!current.text.trim() || inFlight.current || saving) return;
    inFlight.current = true; setSaving(true);
    try {
      await push(ref(db, `suggestions/${scope}`), {
        kind: 'note', text: current.text.trim(), createdAt: Date.now(), author: teacher,
        ...(current.studentId && studentName ? { studentId: current.studentId, studentName } : {}),
      });
      clearSaved();
      showToast('특이사항이 등록되었습니다.');
    } catch { showToast('저장에 실패했습니다. 내용을 보존했으니 다시 시도해 주세요.'); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return { suggestions: list?.scope === scope ? list.items : [], suggestLoadError: list?.scope === scope && list.error,
    suggestStudentId: current.studentId,
    setSuggestStudentId: setStudentId,
    suggestText: current.text,
    setSuggestText: setText,
    suggestSaving: saving, handleSuggestSubmit: submit };
}
