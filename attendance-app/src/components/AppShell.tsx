'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';
import { loadUserRole, cleanupOldYears } from '@/hooks/useFirebaseData';
import { doDemoLogin, doLogout } from '@/hooks/useAuth';
import {
  DEMO_MODE, demoConfigured, isDemoAccount, buildDemoRole,
  loadDemoSelection, saveDemoSelection, clearDemoSelection,
  getAdminIntent, setAdminIntent, type DemoSelection,
} from '@/lib/demo';
import { getWindowYears } from '@/utils/dates';
import DemoClassPicker from '@/components/DemoClassPicker';
import LoginScreen from '@/components/LoginScreen';
import TopBar from '@/components/TopBar';
import TabNav from '@/components/TabNav';
import Toast from '@/components/Toast';
import UpdateBanner from '@/components/UpdateBanner';
import FirebaseDataLoader from '@/components/FirebaseDataLoader';

type AuthState = 'loading' | 'demo-pick' | 'login' | 'app';

// 데모 계정은 실제로는 전체 권한(attendanceAdmins)을 가진다. 화면에서 탭을 감추는 것만으로는
// 주소를 직접 입력하는 접근을 막지 못하므로, 관리자 전용 라우트는 셸에서 차단한다.
const ADMIN_ONLY_PATHS = ['/admin', '/overall'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useApp();
  const pathname = usePathname();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 데모 자동 로그인은 한 번만 시도한다 — 실패 시 재시도 루프를 막는다.
  const demoTriedRef = useRef(false);

  // 고른 반을 담임 교사 역할로 적용 (데모 전용)
  const applyDemoSelection = useCallback((sel: DemoSelection): boolean => {
    const role = buildDemoRole(sel);
    if (!role) return false;
    dispatch({ type: 'SET_USER_ROLE', payload: role });
    dispatch({ type: 'SET_PART', payload: role.part! });
    dispatch({ type: 'SET_GRADE', payload: role.grade! });
    dispatch({ type: 'SET_CLASS', payload: role.class! });
    return true;
  }, [dispatch]);

  // Firebase Auth 감지
  useEffect(() => {
    dispatch({ type: 'SET_FB_READY' });
    const unsub = onAuthStateChanged(auth, async user => {
      if (user) {
        // 데모 계정으로 로그인된 상태 — userRoles를 읽지 않고 고른 반을 그대로 적용한다.
        if (isDemoAccount(user.email)) {
          const saved = loadDemoSelection();
          if (saved && applyDemoSelection(saved)) {
            setDemoError(null);
            setAuthState('app');
          } else {
            dispatch({ type: 'SET_USER_ROLE', payload: null });
            setAuthState('demo-pick');
          }
          return;
        }
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
        // 데모 모드에서는 관리자 로그인을 명시적으로 누른 경우에만 로그인 화면을 띄운다.
        if (DEMO_MODE && !getAdminIntent()) {
          if (!demoConfigured) {
            setDemoError('데모 계정이 설정되지 않았습니다.\n.env.local의 NEXT_PUBLIC_DEMO_EMAIL·NEXT_PUBLIC_DEMO_PASSWORD를 채운 뒤 다시 배포해 주세요.');
            setAuthState('demo-pick');
            return;
          }
          if (!demoTriedRef.current) {
            demoTriedRef.current = true;
            try {
              await doDemoLogin(); // 성공하면 이 콜백이 다시 호출된다
              return;
            } catch (e) {
              const code = (e as { code?: string })?.code ?? '';
              setDemoError(
                '데모 계정으로 접속하지 못했습니다.\n' +
                (code.includes('invalid-credential') || code.includes('user-not-found') || code.includes('wrong-password')
                  ? '데모 계정 정보가 맞는지 확인해 주세요.'
                  : code || (e instanceof Error ? e.message : String(e))),
              );
            }
          }
          setAuthState('demo-pick');
          return;
        }
        setAuthState('login');
      }
    });
    return unsub;
  }, [dispatch, applyDemoSelection]);

  // 데모: 반 선택 → 그 반 담임 화면으로
  const handleDemoPick = useCallback((sel: DemoSelection) => {
    if (!applyDemoSelection(sel)) return;
    saveDemoSelection(sel);
    setAuthState('app');
  }, [applyDemoSelection]);

  // 데모: 다른 반 고르기 (로그인은 유지)
  const handleDemoChangeClass = useCallback(() => {
    clearDemoSelection();
    dispatch({ type: 'SET_USER_ROLE', payload: null });
    setAuthState('demo-pick');
  }, [dispatch]);

  // 데모: 관리자 계정으로 접근 → 데모 세션을 끊고 원래 로그인 화면
  const handleAdminLogin = useCallback(async () => {
    setAdminIntent(true);
    clearDemoSelection();
    demoTriedRef.current = false;
    setDemoError(null);
    setAuthState('login');
    await doLogout();
  }, []);

  // 관리자 로그인 화면 → 데모로 되돌아가기
  const handleBackToDemo = useCallback(() => {
    setAdminIntent(false);
    window.location.reload();
  }, []);

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

    // HTTP 캐시를 우회해 배포 때마다 최신 SW를 확인한다.
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(() => {});

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

  if (authState === 'demo-pick') {
    return (
      <DemoClassPicker
        onPick={handleDemoPick}
        onAdminLogin={() => void handleAdminLogin()}
        signInError={demoError}
      />
    );
  }

  if (authState === 'login') {
    return (
      <LoginScreen
        onLogin={() => { setAuthError(null); setAuthState('app'); }}
        authError={authError}
        onBackToDemo={DEMO_MODE ? handleBackToDemo : undefined}
      />
    );
  }

  const isDemoRole = DEMO_MODE && isDemoAccount(auth.currentUser?.email);

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
      <TopBar
        onLogout={doLogout}
        demo={isDemoRole
          ? { onChangeClass: handleDemoChangeClass, onAdminLogin: () => void handleAdminLogin() }
          : undefined}
      />
      <div className="content-area">
        <FirebaseDataLoader />
        {isDemoRole && ADMIN_ONLY_PATHS.includes(pathname) ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)', fontSize: 14, lineHeight: 1.7 }}>
            관리자 전용 화면입니다.<br />
            상단의 <strong>관리자 접근</strong> 버튼으로 관리자 계정에 로그인해 주세요.
          </div>
        ) : children}
      </div>
      <TabNav />
    </div>
  );
}
