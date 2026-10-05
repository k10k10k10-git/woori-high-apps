'use client';
import { useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';
import { demoCredentials } from '@/lib/demo';
import { loadUserRole } from './useFirebaseData';
import { writeLoginPreferences } from '@/utils/loginPreferences';

export function useAuth() {
  const { dispatch } = useApp();

  useEffect(() => {
    dispatch({ type: 'SET_FB_READY' });
    let active = true;
    let request = 0;
    const unsub = onAuthStateChanged(auth, async user => {
      const currentRequest = ++request;
      const isCurrent = () => active && request === currentRequest
        && (auth.currentUser?.uid ?? null) === (user?.uid ?? null);
      if (!isCurrent()) return;
      dispatch({ type: 'SET_USER_ROLE', payload: null });
      if (user) {
        await loadUserRole({ uid: user.uid, email: user.email }, dispatch, isCurrent);
      }
    });
    return () => { active = false; request++; unsub(); };
  }, [dispatch]);
}

export async function doLogin(
  email: string,
  pw: string,
  stayLogin: boolean,
  saveEmail: boolean,
) {
  const persistence = stayLogin ? browserLocalPersistence : browserSessionPersistence;
  await setPersistence(auth, persistence);
  await signInWithEmailAndPassword(auth, email, pw);

  writeLoginPreferences(email, saveEmail, stayLogin);
}

export async function doLogout() {
  await signOut(auth);
}

/** 임시 공용 출석 계정으로 로그인한다. 사용자의 명시적 복원 요청에 따른 기존 접속 방식. */
export async function doDemoLogin() {
  const { email, password } = demoCredentials();
  if (!email || !password) throw new Error('공용 출석 계정이 설정되지 않았습니다.');
  await setPersistence(auth, browserLocalPersistence);
  await signInWithEmailAndPassword(auth, email, password);
}
