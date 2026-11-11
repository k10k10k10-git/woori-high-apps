'use client';
// 로그인은 Supabase(docs/SUPABASE_PLATFORM_CONTRACT.md 2장): 이메일 6자리 코드 또는 비밀번호.
// @woorihigh.com 계정(메일함 없음)은 비밀번호로만, Google 은 NEXT_PUBLIC_SUPABASE_GOOGLE=1 일 때만.
import { useEffect } from 'react';
import {
  auth, onAuthStateChanged, sendEmailCode, signInWithEmailPassword, signInWithGoogle, signOut, verifyEmailCode,
} from '@/lib/supabaseAuth';
import { setAuthPersistence } from '@/lib/authStorage';
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

/** 비밀번호 로그인. "로그인 유지"를 끄면 Firebase 의 세션 유지처럼 이 탭에만 로그인을 둔다. */
export async function doLogin(
  email: string,
  pw: string,
  stayLogin: boolean,
  saveEmail: boolean,
) {
  setAuthPersistence(stayLogin ? 'local' : 'session');
  await signInWithEmailPassword(email, pw);

  writeLoginPreferences(email, saveEmail, stayLogin);
}

/** 이메일로 6자리 코드를 보낸다. 처음 쓰는 이메일이면 Supabase 계정이 만들어진다(권한은 userRoles 가 정한다). */
export async function doSendLoginCode(email: string) {
  await sendEmailCode(email);
}

export async function doVerifyLoginCode(
  email: string,
  code: string,
  stayLogin: boolean,
  saveEmail: boolean,
) {
  setAuthPersistence(stayLogin ? 'local' : 'session');
  await verifyEmailCode(email, code);
  writeLoginPreferences(email, saveEmail, stayLogin);
}

/** Google 로그인 화면으로 이동한다(돌아오면 인증 구독이 이어 받는다). */
export async function doGoogleLogin(stayLogin: boolean) {
  setAuthPersistence(stayLogin ? 'local' : 'session');
  await signInWithGoogle();
}

export async function doLogout() {
  await signOut(auth);
}

/** 임시 공용 출석 계정으로 로그인한다. 사용자의 명시적 복원 요청에 따른 기존 접속 방식. */
export async function doDemoLogin() {
  const { email, password } = demoCredentials();
  if (!email || !password) throw new Error('공용 출석 계정이 설정되지 않았습니다.');
  setAuthPersistence('local');
  await signInWithEmailPassword(email, password);
}
