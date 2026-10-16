'use client';
import { useEffect, useState } from 'react';
import { db, ref, onValue } from '@/lib/db';
import { showToast } from '@/utils/toast';
import { parseTeacherMessages, type TeacherMessage } from '@/utils/teacherMessages';
import { useTeacherMessageSave } from './useTeacherMessageSave';

export function useSuggestions(year: number, classKey: string, listEnabled: boolean, teacher: string) {
  const scope = `${year}/${classKey}`;
  const [list, setList] = useState<{ scope: string; items: TeacherMessage[]; error: boolean } | null>(null);
  const { current, setStudentId, setText, saving, submit: save, receipt, saveError, retrying } = useTeacherMessageSave(year, classKey, 'note');
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
    const saved = await save(() => {
      if (!current.text.trim()) return null;
      if (current.studentId && !studentName) {
        showToast('선택한 학생이 현재 반에 없습니다. 학생을 다시 선택해 주세요.');
        return null;
      }
      return {
        kind: 'note', text: current.text.trim(), createdAt: Date.now(), author: teacher,
        ...(current.studentId && studentName ? { studentId: current.studentId, studentName } : {}),
      };
    });
    if (saved) showToast('특이사항이 등록되었습니다.');
  }
  return { suggestions: list?.scope === scope ? list.items : [], suggestLoadError: list?.scope === scope && list.error,
    suggestStudentId: current.studentId,
    setSuggestStudentId: setStudentId,
    suggestText: current.text,
    setSuggestText: setText,
    suggestReceipt: receipt,
    suggestSaving: saving, suggestSaveError: saveError, suggestRetrying: retrying, handleSuggestSubmit: submit };
}
