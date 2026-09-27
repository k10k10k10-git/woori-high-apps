'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';
import { loadUserRole } from '@/hooks/useFirebaseData';
import { doLogout } from '@/hooks/useAuth';
import {
  DEMO_MODE, resolveDemoSelection,
  saveDemoSelection, type DemoSelection,
} from '@/lib/demo';
import DemoClassPicker from '@/components/DemoClassPicker';
import DemoAttendance from '@/components/DemoAttendance';
import LoginScreen from '@/components/LoginScreen';
import TopBar from '@/components/TopBar';
import TabNav from '@/components/TabNav';
import Toast from '@/components/Toast';
import UpdateBanner from '@/components/UpdateBanner';
import FirebaseDataLoader from '@/components/FirebaseDataLoader';
import DataLoadGate from '@/components/DataLoadGate';
import { watchCalendarYear } from '@/utils/yearRollover';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import { canAccessAttendancePath, canUseAdminWorkspace, createAdminEntryTracker } from '@/lib/adminNavigation';

type AuthState = 'loading' | 'demo-pick' | 'demo-app' | 'login' | 'role-error' | 'app';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [demoSelection, setDemoSelection] = useState<DemoSelection | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminEntryRef = useRef<ReturnType<typeof createAdminEntryTracker> | null>(null);

  useEffect(() => {
    if (adminEntryRef.current) return;
    let storage: Storage | undefined;
    try { storage = window.sessionStorage; } catch { /* 제한된 브라우저에서는 메모리 기록을 사용한다. */ }
    adminEntryRef.current = createAdminEntryTracker(storage);
  }, []);

  // Firebase Auth 감지
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
      setAuthState('loading');
      if (user) {
        const result = await loadUserRole({ uid: user.uid, email: user.email }, dispatch, isCurrent);
        if (!isCurrent() || result === 'stale') return;
        if (result === 'unauthorized') {
          setAuthError('권한이 부여되지 않은 계정입니다.\n관리자에게 문의해 주세요.');
          setAuthState('login');
          try { await doLogout(); } catch { /* 권한 없는 화면은 계속 로그인 게이트에 둔다. */ }
        } else if (result === 'error') {
          setAuthError('계정 권한 정보를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.');
          setAuthState('role-error');
        } else {
          setAuthError(null);
          setAuthState('app');
        }
      } else {
        adminEntryRef.current?.reset();
        // 세션이 만료돼도 저장된 가상 반으로 자동 진입하지 않는다.
        setDemoSelection(null);
        setAuthState('login');
      }
    });
    return () => { active = false; request++; unsub(); };
  }, [dispatch]);

  // 첫 로그인만 대시보드로 안내한다. 이후 메뉴 이동·새로고침·깊은 링크는 사용자의 선택이다.
  useEffect(() => {
    if (authState !== 'app' || !state.userRole || !auth.currentUser) return;
    const target = adminEntryRef.current?.take(
      auth.currentUser.uid, `${pathname}${window.location.search}`, state.userRole, false,
    );
    if (target) router.replace(target);
  }, [authState, pathname, router, state.userRole]);

  // 데모: 반 선택 → Firebase와 분리된 가상 출석 화면으로
  const handleDemoPick = useCallback((sel: DemoSelection) => {
    const safe = resolveDemoSelection(sel);
    if (!safe) return;
    saveDemoSelection(safe);
    setDemoSelection(safe);
    setAuthState('demo-app');
  }, []);

  // 데모: 다른 가상 반 고르기
  const handleDemoChangeClass = useCallback(() => {
    setDemoSelection(null);
    setAuthState('demo-pick');
  }, []);

  // 데모에서 실제 교사·관리자 로그인으로 돌아간다.
  const handleAdminLogin = useCallback(() => {
    setDemoSelection(null);
    setAuthError(null);
    setAuthState('login');
  }, []);

  // 실제 로그인 화면 → 사용자가 명시적으로 가상 체험 선택
  const handleBackToDemo = useCallback(() => {
    setAuthError(null);
    setDemoSelection(null);
    setAuthState('demo-pick');
  }, []);

  const handleSwitchAccount = useCallback(async () => {
    try {
      await doLogout();
      setAuthError(null);
      setAuthState('login');
    } catch {
      setAuthError('로그아웃하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.');
    }
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
    const watcher = watchCalendarYear((previousYear, currentYear) => {
      dispatch({ type: 'CALENDAR_YEAR_CHANGED', payload: { previousYear, currentYear } });
    });
    const vis = () => { if (!document.hidden) watcher.check(); };
    document.addEventListener('visibilitychange', vis);
    return () => { watcher.stop(); document.removeEventListener('visibilitychange', vis); };
  }, [authState, dispatch]);

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

  if (authState === 'role-error') {
    return (
      <div className="loading-screen" role="alert" style={{ flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center' }}>
        <p style={{ maxWidth: 360, fontSize: 14, lineHeight: 1.6 }}>{authError}<br />로그인 상태는 유지됩니다.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          <button className="btn-primary" style={{ padding: '10px 20px' }} onClick={() => window.location.reload()}>
            다시 불러오기
          </button>
          <button className="btn-secondary" style={{ padding: '10px 20px' }} onClick={() => void handleSwitchAccount()}>
            다른 계정으로 로그인
          </button>
        </div>
      </div>
    );
  }

  if (authState === 'demo-pick') {
    return (
      <DemoClassPicker
        onPick={handleDemoPick}
        onAdminLogin={() => void handleAdminLogin()}
      />
    );
  }

  if (authState === 'demo-app' && demoSelection) {
    return <DemoAttendance key={demoSelection.ck} selection={demoSelection} onChangeClass={handleDemoChangeClass} onAdminLogin={() => void handleAdminLogin()} />;
  }

  if (authState === 'login') {
    return (
      <LoginScreen
        authError={authError}
        onBackToDemo={DEMO_MODE ? handleBackToDemo : undefined}
      />
    );
  }

  const isDemoRole = false;

  if (canUseAdminWorkspace(state.userRole, isDemoRole)) {
    return (
      <>
        <Toast />
        {showUpdate && <UpdateBanner onReload={() => window.location.reload()} />}
        <AdminWorkspace onLogout={doLogout} isOnline={isOnline}>
          <FirebaseDataLoader />
          <DataLoadGate>{children}</DataLoadGate>
        </AdminWorkspace>
      </>
    );
  }

  return (
    <div className={`app${state.userRole?.role === 'teacher' ? ' teacher-workspace' : ''}`}>
      {state.userRole?.role === 'teacher' && (
        <a className="teacher-skip" href="#teacher-main">본문으로 이동</a>
      )}
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
      <main id="teacher-main" className="content-area" tabIndex={-1}>
        <FirebaseDataLoader />
        {!canAccessAttendancePath(pathname, state.userRole, isDemoRole) ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)', fontSize: 14, lineHeight: 1.7 }}>
            관리자 전용 화면입니다.<br />
            {isDemoRole
              ? <>상단의 <strong>실제 출석부 로그인</strong> 버튼으로 로그인해 주세요.</>
              : <>담당 반의 출석부에서 업무를 이어갈 수 있습니다.</>}
            <div style={{ marginTop: 16 }}><Link href="/attendance" className="btn-secondary" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', padding: '10px 20px', textDecoration: 'none' }}>출석부로 돌아가기</Link></div>
          </div>
        ) : <DataLoadGate>{children}</DataLoadGate>}
      </main>
      <TabNav />
    </div>
  );
}
