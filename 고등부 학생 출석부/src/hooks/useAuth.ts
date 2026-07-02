'use client';
import { useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';
import { loadUserRole } from './useFirebaseData';

export function useAuth() {
  const { dispatch } = useApp();

  useEffect(() => {
    dispatch({ type: 'SET_FB_READY' });
    const unsub = onAuthStateChanged(auth, async user => {
      if (user) {
        await loadUserRole({ uid: user.uid, email: user.email }, dispatch);
      } else {
        dispatch({ type: 'SET_USER_ROLE', payload: null });
      }
    });
    return unsub;
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

export async function doLogout() {
  await signOut(auth);
}
