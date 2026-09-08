'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { AttendanceSaveError, saveAttendanceCell } from '@/lib/attendanceSave';
import { BrowserWriteLockError } from '@/utils/browserWriteLock';
import type { AttendanceSaveFeedback } from '@/components/AttendanceSaveBanner';
import type { AttEditTarget, AttValue } from '@/types';

/** 저장 대상·사전값·조회 세대를 고정하고, 이전 화면의 완료 응답과 재시도를 무시한다. */
export function useAttendanceSave() {
  const { state, dispatch } = useApp();
  const [feedback, setFeedback] = useState<AttendanceSaveFeedback | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef(true);
  const running = useRef(false);
  const current = useRef(state);
  useEffect(() => { current.current = state; }, [state]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const scope = `${state.curYear}/${state.dataRevision}`;
  const valid = useCallback((year: number, revision: number) => active.current && current.current.curYear === year && current.current.dataRevision === revision, []);

  async function save(target: AttEditTarget, value: AttValue, retry?: AttendanceSaveFeedback) {
    if (running.current || (retry && retry.scope !== scope)) return;
    const year = state.curYear, revision = state.dataRevision;
    const expected = retry?.expected ?? state.attData[target.ck]?.[target.sid]?.[target.k] ?? '';
    const studentName = state.classData[target.ck]?.students.find(student => student.id === target.sid)?.name ?? '학생';
    const base = { sid: target.sid, studentName, target, value, expected, scope };
    running.current = true; setPending(true);
    setFeedback({ ...base, status: 'saving' });
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    try {
      await saveAttendanceCell({ year, target, value, expected }, () => valid(year, revision));
      if (!valid(year, revision)) return;
      setFeedback({ ...base, status: 'saved', savedAt: Date.now() });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    } catch (error) {
      if (!valid(year, revision)) return;
      const known = error instanceof AttendanceSaveError || error instanceof BrowserWriteLockError;
      setFeedback({ ...base, status: 'error', ...(known ? { message: error.message } : {}),
        retryable: !(error instanceof AttendanceSaveError && ['conflict', 'session'].includes(error.kind)) });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'idle' });
    } finally { running.current = false; if (active.current) setPending(false); }
  }
  const dismissSaved = useCallback((savedAt: number) => {
    setFeedback(value => value?.status === 'saved' && value.savedAt === savedAt ? null : value);
  }, []);
  return { feedback: feedback?.scope === scope ? feedback : null, save, dismissSaved, pending };
}
