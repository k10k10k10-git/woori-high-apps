'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';

type ViewValues = Record<string, string | boolean | null>;
const PREFIX = 'woori-admin-ui:';
const memory = new Map<string, ViewValues>();
let owner = '';

/** 검색어는 메모리에만, 비민감 보기 조건은 현재 탭의 로그인 사용자·연도별로 복원한다. */
export function clearAdminViewState() {
  memory.clear();
  owner = '';
  try {
    Object.keys(sessionStorage).filter(key => key.startsWith(PREFIX)).forEach(key => sessionStorage.removeItem(key));
  } catch { /* 저장소 제한이 업무 화면을 막지 않게 한다. */ }
}

export function useAdminViewState<T extends ViewValues>(page: string, initial: T, memoryOnly: (keyof T)[] = []) {
  const { state } = useApp();
  const uid = state.userRole?.role === 'admin' ? auth.currentUser?.uid ?? '' : '';
  const scope = `${uid}/${state.curYear}/${state.draftSession}`;
  const key = `${PREFIX}${uid}/${state.curYear}/${page}`;
  const defaults = useRef(initial);
  const privateKeys = useRef(memoryOnly);
  const [saved, setSaved] = useState({ scope, value: initial });
  const current = useRef(saved);
  current.current = saved;

  useEffect(() => {
    if (!uid) {
      clearAdminViewState();
      const next = { scope, value: defaults.current };
      current.current = next;
      setSaved(next);
      return;
    }
    let persisted: ViewValues = {};
    try {
      if ((owner && owner !== uid) || (sessionStorage.getItem(`${PREFIX}owner`) && sessionStorage.getItem(`${PREFIX}owner`) !== uid)) clearAdminViewState();
      sessionStorage.setItem(`${PREFIX}owner`, uid);
      const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? '{}');
      if (value && typeof value === 'object' && !Array.isArray(value)) persisted = value as ViewValues;
    } catch { /* 잘못되거나 차단된 저장값은 기본 보기로 연다. */ }
    owner = uid;
    const restored = { ...defaults.current };
    const cached = memory.get(`${scope}/${page}`);
    for (const field of Object.keys(restored) as (keyof T)[]) {
      const value = cached && field in cached ? cached[String(field)] : (!privateKeys.current.includes(field) ? persisted[String(field)] : undefined);
      if (restored[field] === null ? value === null || typeof value === 'string' : typeof value === typeof restored[field]) restored[field] = value as T[keyof T];
    }
    const next = { scope, value: restored };
    current.current = next;
    setSaved(next);
  }, [uid, scope, key, page]);

  const update = useCallback((patch: Partial<T>) => {
    const value = { ...(current.current.scope === scope ? current.current.value : defaults.current), ...patch };
    const next = { scope, value };
    current.current = next;
    setSaved(next);
    if (!uid || auth.currentUser?.uid !== uid) return;
    memory.set(`${scope}/${page}`, value);
    const persist = Object.fromEntries(Object.entries(value).filter(([field]) => !privateKeys.current.includes(field as keyof T)));
    try { sessionStorage.setItem(key, JSON.stringify(persist)); } catch { /* 메모리 복원은 유지한다. */ }
  }, [uid, scope, key, page]);
  return [saved.scope === scope ? saved.value : defaults.current, update] as const;
}
