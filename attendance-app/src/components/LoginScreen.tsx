'use client';
import { useState, useEffect } from 'react';
import { doLogin } from '@/hooks/useAuth';

export default function LoginScreen({ onLogin, authError, onBackToDemo }: {
  onLogin: () => void;
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
      onLogin();
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
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">📋</div>
          <div className="login-title">고등부 출석부</div>
          <div className="login-sub">우리교회 고등부 온라인 출석 관리</div>
        </div>
        <form onSubmit={handleLogin}>
          <input
            className="login-input"
            type="email"
            placeholder="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="login-input"
            type="password"
            placeholder="비밀번호"
            value={pw}
            onChange={e => setPw(e.target.value)}
            autoComplete="current-password"
          />
          <div className="login-check-row">
            <label>
              <input type="checkbox" checked={saveEmail} onChange={e => setSaveEmail(e.target.checked)} />
              이메일 저장
            </label>
            <label>
              <input type="checkbox" checked={stayLogin} onChange={e => setStayLogin(e.target.checked)} />
              로그인 유지
            </label>
          </div>
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
          {authError && (
            <div className="login-err" style={{ whiteSpace: 'pre-line', textAlign: 'center' }}>{authError}</div>
          )}
          {!authError && err && <div className="login-err">{err}</div>}
        </form>
        {onBackToDemo && (
          <button type="button" className="demo-back-btn" onClick={onBackToDemo}>
            ← 반 선택 화면으로 돌아가기
          </button>
        )}
      </div>
    </div>
  );
}
