'use client';

import {
  signInWithEmailAndPassword, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

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
