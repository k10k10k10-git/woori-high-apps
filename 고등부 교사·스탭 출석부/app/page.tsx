'use client';

import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useApp } from '@/store/AppContext';
import { loadUserRole, useFirebaseData } from '@/hooks/useFirebaseData';
import { doLogout } from '@/hooks/useAuth';
import LoginScreen from '@/components/LoginScreen';
import TopBar from '@/components/TopBar';
import TabNav from '@/components/TabNav';
import Toast from '@/components/Toast';
import AttendanceTab from '@/components/tabs/AttendanceTab';
import StatTab from '@/components/tabs/StatTab';
import AdminTab from '@/components/tabs/AdminTab';

type AuthState = 'loading' | 'login' | 'app';

export default function Page() {
  const { state, dispatch } = useApp();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Firebase Auth 감지
  useEffect(() => {
    setIsOnline(navigator.onLine);
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

  // 네트워크 감지
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
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

  if (authState === 'loading') {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (authState === 'login') {
    return (
      <LoginScreen
        onLogin={() => { setAuthError(null); setAuthState('app'); }}
        authError={authError}
      />
    );
  }

  return (
    <div className="app">
      <Toast />
      {!isOnline && (
        <div className="offline-banner">오프라인 상태입니다. 인터넷 연결을 확인해 주세요.</div>
      )}
      <TopBar onLogout={doLogout} />
      <TabNav />
      <div className="content-area">
        <FirebaseDataLoader />
        {state.curTab === 'att'   && <AttendanceTab />}
        {state.curTab === 'stat'  && <StatTab />}
        {state.curTab === 'admin' && <AdminTab />}
      </div>
    </div>
  );
}

function FirebaseDataLoader() {
  const loadError = useFirebaseData();
  if (!loadError) return null;
  return <div className="offline-banner" role="alert">⚠ {loadError}</div>;
}
