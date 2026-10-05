'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { AttendanceSaveError, saveAttendanceCell } from '@/lib/attendanceSave';
import { BrowserWriteLockError } from '@/utils/browserWriteLock';
import type { AttendanceSaveFeedback } from '@/components/AttendanceSaveBanner';
import type { AttEditTarget, AttValue } from '@/types';

/** 저장 결과는 로그인·조회 세대에 보관한다. 화면 이동은 저장의 취소나 결과 폐기가 아니다. */
export function useAttendanceSave() {
  const { state, dispatch, getState } = useApp();
  const [feedback, setFeedback] = useState<AttendanceSaveFeedback | null>(state.attendanceFeedback);
  const [dismissedSavedAt, setDismissedSavedAt] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef(true);
  const running = useRef(false);
  const lastSavedAt = useRef(state.lastAttendanceSavedAt ?? 0);
  const current = useRef(state);
  useEffect(() => { current.current = state; }, [state]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const scope = `${state.curYear}/${state.dataRevision}`;
  const valid = useCallback((year: number, revision: number) => {
    const latest = getState ? getState() : current.current;
    return latest.curYear === year && latest.dataRevision === revision;
  }, [getState]);

  async function save(target: AttEditTarget, value: AttValue, retry?: AttendanceSaveFeedback) {
    if (running.current || (getState && getState().saveStatus === 'saving') || (retry && retry.scope !== scope)) return;
    const year = state.curYear, revision = state.dataRevision;
    const expected = retry?.expected ?? state.attData[target.ck]?.[target.sid]?.[target.k] ?? '';
    const studentName = state.classData[target.ck]?.students.find(student => student.id === target.sid)?.name ?? '학생';
    const [mi, di] = target.k.split('-').map(Number);
    const [part, grade, cls] = target.ck.split('-');
    const targetLabel = `${year}년 ${part}부 ${grade}학년 ${cls}반 · ${state.months[mi]?.month}월 ${state.months[mi]?.sundays[di]}일`;
    const base = { sid: target.sid, studentName, target, value, expected, scope, targetLabel };
    running.current = true; setPending(true);
    setFeedback({ ...base, status: 'saving' });
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving', revision, feedback: { ...base, status: 'saving' } });
    try {
      await saveAttendanceCell({ year, target, value, expected }, () => valid(year, revision));
      if (!valid(year, revision)) return;
      // 안내 식별 시각은 같은 밀리초에 저장해도 겹치지 않아야 이전 닫기 타이머와 구분된다.
      const savedAt = Math.max(Date.now(), lastSavedAt.current + 1, ((getState ? getState() : current.current).lastAttendanceSavedAt ?? 0) + 1);
      lastSavedAt.current = savedAt;
      if (active.current) setFeedback({ ...base, status: 'saved', savedAt });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved', savedAt, revision, feedback: { ...base, status: 'saved', savedAt } });
    } catch (error) {
      if (!valid(year, revision)) return;
      const known = error instanceof AttendanceSaveError || error instanceof BrowserWriteLockError;
      const status = error instanceof AttendanceSaveError && error.kind === 'unknown' ? 'unknown' : 'error';
      const failed: AttendanceSaveFeedback = { ...base, status, ...(known ? { message: error.message } : {}),
        retryable: !(error instanceof AttendanceSaveError && ['conflict', 'session'].includes(error.kind)) };
      if (active.current) setFeedback(failed);
      dispatch({ type: 'SET_SAVE_STATUS', payload: status, revision, feedback: failed });
    } finally { running.current = false; if (active.current) setPending(false); }
  }
  const dismissSaved = useCallback((savedAt: number) => {
    setDismissedSavedAt(savedAt);
  }, []);
  const visible = state.attendanceFeedback ?? feedback;
  const dismissed = visible?.status === 'saved' && visible.savedAt === dismissedSavedAt;
  return { feedback: visible?.scope === scope && !dismissed ? visible : null, save, dismissSaved, pending: pending || state.saveStatus === 'saving' };
}
