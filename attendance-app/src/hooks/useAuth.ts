'use client';
import { useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';
import { demoCredentials } from '@/lib/demo';
import { loadUserRole } from './useFirebaseData';

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

  localStorage.setItem('saveEmail', saveEmail ? '1' : '0');
  localStorage.setItem('stayLogin', stayLogin ? '1' : '0');
  if (saveEmail) {
    localStorage.setItem('savedEmail', email);
  } else {
    localStorage.removeItem('savedEmail');
  }
}

/**
 * 데모 모드 전용 — 화면 뒤에서 공용 데모 계정으로 조용히 로그인한다.
 * 테스트 기간에만 쓰이며, 계정 정보는 .env.local의 NEXT_PUBLIC_DEMO_* 값에서만 온다.
 */
export async function doDemoLogin() {
  const { email, password } = demoCredentials();
  if (!email || !password) throw new Error('데모 계정이 설정되지 않았습니다.');
  await setPersistence(auth, browserLocalPersistence);
  await signInWithEmailAndPassword(auth, email, password);
}

export async function doLogout() {
  await signOut(auth);
}
