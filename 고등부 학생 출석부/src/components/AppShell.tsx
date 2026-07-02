'use client';
import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';
import { loadUserRole, cleanupOldYears } from '@/hooks/useFirebaseData';
import { doLogout } from '@/hooks/useAuth';
import { getWindowYears } from '@/utils/dates';
import LoginScreen from '@/components/LoginScreen';
import TopBar from '@/components/TopBar';
import TabNav from '@/components/TabNav';
import Toast from '@/components/Toast';
import UpdateBanner from '@/components/UpdateBanner';
import FirebaseDataLoader from '@/components/FirebaseDataLoader';

type AuthState = 'loading' | 'login' | 'app';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useApp();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Firebase Auth 감지
  useEffect(() => {
    dispatch({ type: 'SET_FB_READY' });
    const unsub = onAuthStateChanged(auth, async user => {
      if (user) {
        const result = await loadUserRole({ uid: user.uid, email: user.email }, dispatch);
        if (result === 'unauthorized') {
          await doLogout();
          setAuthError('권한이 부여되지 않은 계정입니다.\n관리자에게 문의해 주세요.');
          setAuthState('login');
        } else {
          setAuthError(null);
          setAuthState('app');
        }
      } else {
        dispatch({ type: 'SET_USER_ROLE', payload: null });
        setAuthState('login');
      }
    });
    return unsub;
  }, [dispatch]);

  // 로딩 게이트 타임아웃 — onAuthStateChanged가 끝내 안 오면(캐시 깨짐 등)
  // 무한 스피너 대신 새로고침 안내를 보여준다.
  useEffect(() => {
    if (authState !== 'loading') { setLoadTimedOut(false); return; }
    const t = setTimeout(() => setLoadTimedOut(true), 12000);
    return () => clearTimeout(t);
  }, [authState]);

  // 네트워크 온/오프라인 감지
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 서비스 워커 등록 + 업데이트 감지
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // 메시지 핸들러 먼저 등록
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'NEW_VERSION') setShowUpdate(true);
    };
    navigator.serviceWorker.addEventListener('message', handler);

    // SW 등록 — 없으면 아무것도 안 된다
    navigator.serviceWorker.register('/sw.js').catch(() => {});

    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // 저장 상태 자동 초기화
  useEffect(() => {
    if (state.saveStatus === 'saved') {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'idle' });
      }, 2000);
    }
  }, [state.saveStatus, dispatch]);

  // KST 자정 연도 전환
  useEffect(() => {
    if (authState !== 'app') return;
    const checkRollover = () => {
      const newYear = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
      if (newYear !== state.curYear) {
        dispatch({ type: 'SET_YEAR', payload: newYear });
      }
    };
    const scheduleMidnight = () => {
      const nowKST = new Date(Date.now() + 9 * 3600 * 1000);
      const msUntil =
        ((23 - nowKST.getUTCHours()) * 3600 +
          (59 - nowKST.getUTCMinutes()) * 60 +
          (60 - nowKST.getUTCSeconds())) * 1000 + 1000;
      return setTimeout(() => { checkRollover(); scheduleMidnight(); }, msUntil);
    };
    const timer = scheduleMidnight();
    const vis = () => { if (!document.hidden) checkRollover(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', vis); };
  }, [authState, state.curYear, dispatch]);

  // 로그인 후 모바일 줌 리셋
  // iOS Safari는 input focus 시 자동 확대되는데, 화면 전환 후에도 줌이 유지됨
  // viewport content를 잠깐 갱신해 브라우저가 줌을 1.0으로 되돌리도록 강제
  useEffect(() => {
    if (authState !== 'app') return;
    const meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!meta) return;
    const saved = meta.content;
    meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    requestAnimationFrame(() => { meta.content = saved; });
  }, [authState]);

  // 관리자 오래된 연도 정리
  useEffect(() => {
    if (authState !== 'app' || state.userRole?.role !== 'admin') return;
    cleanupOldYears(getWindowYears(state.curYear)).catch(() => {});
  }, [authState, state.userRole, state.curYear]);

  if (authState === 'loading') {
    if (loadTimedOut) {
      return (
        <div className="loading-screen" style={{ flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--text2)', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
            {'로그인 확인이 지연되고 있습니다.\n네트워크 상태를 확인한 뒤 새로고침해 주세요.'}
          </div>
          <button className="btn-primary" style={{ padding: '10px 20px' }} onClick={() => window.location.reload()}>
            새로고침
          </button>
        </div>
      );
    }
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (authState === 'login') {
    return <LoginScreen onLogin={() => { setAuthError(null); setAuthState('app'); }} authError={authError} />;
  }

  return (
    <div className="app">
      <Toast />
      {!isOnline && (
        <div className="offline-banner">
          오프라인 상태입니다. 인터넷 연결을 확인해 주세요.
        </div>
      )}
      {showUpdate && (
        <UpdateBanner onReload={() => window.location.reload()} />
      )}
      <TopBar onLogout={doLogout} />
      <div className="content-area">
        <FirebaseDataLoader />
        {children}
      </div>
      <TabNav />
    </div>
  );
}
