'use client';
import { useState, useEffect } from 'react';
import { doLogin } from '@/hooks/useAuth';
import AdminIcon from '@/components/admin/AdminIcon';

export default function LoginScreen({ authError, onBackToDemo }: {
  authError?: string | null;
  /** 데모 모드에서만 넘어온다 — 관리자 로그인을 취소하고 반 선택 화면으로 되돌아간다. */
  onBackToDemo?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [saveEmail, setSaveEmail] = useState(false);
  const [stayLogin, setStayLogin] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('saveEmail') === '1';
    const stay = localStorage.getItem('stayLogin') === '1';
    setSaveEmail(saved);
    setStayLogin(stay);
    if (saved) setEmail(localStorage.getItem('savedEmail') ?? '');
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !pw) { setErr('이메일과 비밀번호를 입력하세요'); return; }
    setErr(''); setLoading(true);
    try {
      await doLogin(email, pw, stayLogin, saveEmail);
      // 화면 진입은 AppShell의 인증 구독이 사용자 역할 조회까지 마친 뒤 확정한다.
    } catch (e: unknown) {
      const msg = (e as { code?: string })?.code;
      if (msg?.includes('user-not-found') || msg?.includes('wrong-password') || msg?.includes('invalid-credential')) {
        setErr('이메일 또는 비밀번호가 잘못되었습니다');
      } else {
        setErr('로그인 실패: ' + msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="attendance-entry attendance-entry--login">
      <a className="entry-skip" href="#entry-main">본문으로 이동</a>
      <header className="entry-header">
        <div className="entry-header-inner">
          <div className="entry-brand">
            <span className="entry-brand-mark"><AdminIcon name="book" size={18} /></span>
            <span>출석부</span>
          </div>
          <span className="entry-mode">관리자</span>
        </div>
      </header>

      <main id="entry-main" className="entry-main" tabIndex={-1}>
        <section className="entry-panel" aria-labelledby="admin-login-title">
          <div className="entry-intro">
            <h1 id="admin-login-title">관리자 로그인</h1>
            <p>우리교회 고등부 온라인 출석 관리</p>
          </div>

          <form className="entry-form" onSubmit={handleLogin} aria-busy={loading}>
            <div className="entry-field">
              <label htmlFor="admin-email">이메일</label>
              <input
                id="admin-email"
                className="entry-input"
                type="email"
                placeholder="이메일"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="entry-field">
              <label htmlFor="admin-password">비밀번호</label>
              <input
                id="admin-password"
                className="entry-input"
                type="password"
                placeholder="비밀번호"
                value={pw}
                onChange={e => setPw(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="entry-check-row">
              <label>
                <input type="checkbox" checked={saveEmail} onChange={e => setSaveEmail(e.target.checked)} />
                이메일 저장
              </label>
              <label>
                <input type="checkbox" checked={stayLogin} onChange={e => setStayLogin(e.target.checked)} />
                로그인 유지
              </label>
            </div>
            <button className="entry-primary-action" type="submit" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
              {!loading && <AdminIcon name="arrow" size={15} />}
            </button>
            <span className="entry-sr-only" role="status" aria-live="polite">
              {loading ? '로그인 정보를 확인하는 중입니다' : ''}
            </span>
            {authError && <div className="entry-error" role="alert">{authError}</div>}
            {!authError && err && <div className="entry-error" role="alert">{err}</div>}
          </form>
          {onBackToDemo && (
            <button type="button" className="entry-back-action" onClick={onBackToDemo}>
              <AdminIcon name="arrow" size={14} />
              반 선택 화면으로 돌아가기
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
