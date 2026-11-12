// `@/lib/supabaseAuth` 자리. 운영 모듈은 Supabase 로그인을 Firebase Auth 와 같은 모양(auth.currentUser·onAuthStateChanged·
// signOut·user.getIdToken)으로 감싼다. 시험에서는 같은 이름으로 에뮬레이터 Firebase Auth(./firebase)를 감싸,
// 에뮬레이터 ID 토큰이 RTDB 에뮬레이터 Rules 의 auth.uid·auth.token.email 로 그대로 쓰이게 한다(이관 전 하네스와 같다).
// 비밀번호 로그인만 지원한다. 이메일 코드·Google 은 에뮬레이터에 대응이 없어 "쓸 수 없음"으로 끝난다.
// 로그인 유지 선택(authStorage)은 Supabase 세션 저장소용이라 여기서는 Firebase 기본 저장(브라우저 유지)을 쓴다.
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type Auth } from 'firebase/auth';
import { normalizeEmail } from '../src/lib/accountEmail';
import { auth } from './firebase';

export { auth, onAuthStateChanged };

export class AuthError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

const unsupported = () => new AuthError('auth/operation-not-allowed', '격리 시험에서는 비밀번호 로그인만 쓸 수 있습니다.');

export function getAuth(): Auth { return auth; }

export async function signOut(target: Auth = auth): Promise<void> {
  await firebaseSignOut(target);
}

/** 운영 모듈은 규칙용 uid 확인(whoami) 실패 뒤 다시 묻는다. 에뮬레이터 토큰의 uid 를 그대로 쓰므로 다시 물을 것이 없다. */
export function retryAuthIdentity(): boolean { return false; }

export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
}

export async function sendEmailCode(): Promise<void> { throw unsupported(); }
export async function verifyEmailCode(): Promise<void> { throw unsupported(); }
export async function signInWithGoogle(): Promise<void> { throw unsupported(); }
export function isGoogleLoginEnabled(): boolean { return false; }
