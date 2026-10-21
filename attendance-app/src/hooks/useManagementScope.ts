'use client';
import { useEffect, useRef, useState } from 'react';
import { isDataReady, useApp, useClassKey } from '@/store/AppContext';

/** 관리 폼은 처음 연 연도·원장 세대·반만 대상으로 삼는다. 화면 해제 뒤 새 쓰기를 시작하지 않는다. */
export function useManagementScope() {
  const { state, dispatch, getState } = useApp();
  const selectedClassKey = useClassKey(state);
  const [scope] = useState(() => ({ year: state.curYear, revision: state.dataRevision, classKey: selectedClassKey }));
  const current = useRef(state);
  current.current = state;
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const isCurrent = () => {
    const latest = getState ? getState() : current.current;
    return active.current && latest.curYear === scope.year && latest.dataRevision === scope.revision
      && `${latest.curPart}-${latest.curGrade}-${latest.curClass}` === scope.classKey
      && latest.userRole?.role === 'admin' && isDataReady(latest);
  };
  return { state, dispatch, ...scope, isCurrent, active };
}
