'use client';
import { useEffect, useRef } from 'react';
import { useApp, type TeacherSubmission } from '@/store/AppContext';
import { saveTeacherMessage, TeacherMessageSaveError, type TeacherMessageWrite } from '@/lib/teacherMessageSave';
import { showToast } from '@/utils/toast';
import { useTeacherDraft } from './useTeacherDraft';
import type { TeacherMessageKind } from '@/utils/teacherMessages';

/** 결과 불명인 요청은 반·종류별 로그인 세션에 보관하고 화면 재진입 후에도 같은 키로 확인한다. */
export function useTeacherMessageSave(year: number, classKey: string, kind: TeacherMessageKind) {
  const draft = useTeacherDraft(`${year}/${classKey}`, kind);
  const { state, dispatch } = useApp();
  const latest = useRef(state);
  latest.current = state;
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const inFlight = useRef(false);
  // 전송 전 실패가 확실하면 수정한 내용으로 새 요청을 허용하되, 결과 불명인 요청은 먼저 확인한다.
  const retry = draft.submission && (!draft.submission.error || draft.submission.uncertain) ? draft.submission : null;
  async function submit(makePayload: () => TeacherMessageWrite | null) {
    if (inFlight.current || draft.saving) return false;
    const payload = retry?.payload ?? makePayload();
    if (!payload) return false;
    const attempt: TeacherSubmission = retry ?? { id: `msg_${crypto.randomUUID()}`, draft: { ...draft.current }, payload };
    const session = state.draftSession;
    const isCurrent = () => active.current && latest.current.draftSession === session && latest.current.curYear === year && !!latest.current.userRole;
    inFlight.current = true;
    draft.setSubmission({ ...attempt, error: undefined });
    draft.setSaving(true);
    try {
      await saveTeacherMessage(year, classKey, attempt.id, attempt.payload, isCurrent, () => {
        if (!attempt.payload.studentId) return true;
        const student = latest.current.classData[classKey]?.students.find(value => value.id === attempt.payload.studentId);
        return !!student && student.name === attempt.payload.studentName
          && (!attempt.payload.studentPersonId || student.personId === attempt.payload.studentPersonId);
      });
      if (!isCurrent()) return false;
      // 본문은 복제하지 않고 서버 저장이 확인된 마지막 접수만 현재 로그인 세션에 남긴다.
      dispatch({ type: 'SET_TEACHER_RECEIPT', session, year, key: `${year}/${classKey}/${kind}`,
        payload: { id: attempt.id, receivedAt: Date.now(), ...(attempt.payload.studentName ? { studentName: attempt.payload.studentName } : {}) } });
      draft.clearSaved(attempt.draft);
      draft.setSubmission(null);
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      const message = error instanceof Error ? error.message : '저장에 실패했습니다. 내용을 보존했으니 다시 시도해 주세요.';
      draft.setSubmission({ ...attempt, error: message,
        uncertain: attempt.uncertain || !(error instanceof TeacherMessageSaveError) || error.kind === 'unknown' });
      showToast(message);
      return false;
    } finally { inFlight.current = false; draft.setSaving(false); }
  }
  return { ...draft, submit, receipt: state.teacherReceipts[`${year}/${classKey}/${kind}`], saveError: draft.submission?.error, retrying: !!retry };
}
