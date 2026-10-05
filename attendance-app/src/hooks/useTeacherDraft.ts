'use client';
import { useApp, type TeacherDraft, type TeacherSubmission } from '@/store/AppContext';
import type { TeacherMessageKind } from '@/utils/teacherMessages';

/** 상담 내용은 저장소에 남기지 않고 로그인 세션 안에서만 반·연도·종류별로 보관한다. */
export function useTeacherDraft(scope: string, kind: TeacherMessageKind) {
  const { state, dispatch } = useApp();
  const key = `${scope}/${kind}`;
  const current = state.teacherDrafts[key] ?? { studentId: '', text: '' };
  const session = state.draftSession;
  const set = (payload: TeacherDraft) => dispatch({ type: 'SET_TEACHER_DRAFT', key, session, payload });
  return {
    current,
    submission: state.teacherSubmissions[key],
    setSubmission: (payload: TeacherSubmission | null) => dispatch({ type: 'SET_TEACHER_SUBMISSION', key, session, payload }),
    saving: state.teacherDraftSaves[key] === true,
    setSaving: (payload: boolean) => dispatch({ type: 'SET_TEACHER_DRAFT_SAVING', key, session, payload }),
    setStudentId: (studentId: string) => set({ ...current, studentId }),
    setText: (text: string) => set({ ...current, text }),
    clearSaved: (expected: TeacherDraft = current) => dispatch({ type: 'CLEAR_TEACHER_DRAFT', key, session, expected }),
  };
}
