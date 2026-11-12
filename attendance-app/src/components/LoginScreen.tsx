'use client';
// 2026-11-12 사용자 결정 "기존으로 돌려줘": 이관 전처럼 이메일 + 비밀번호만 쓴다(이메일 코드·Google 없음).
// 로그인은 Supabase 비밀번호 로그인(doLogin)이고, 권한은 그대로 userRoles·attendanceAdmins 가 정한다.
import { useState, useEffect, useRef } from 'react';
import { doLogin } from '@/hooks/useAuth';
import AdminIcon from '@/components/admin/AdminIcon';
import { loginErrorMessage, readLoginPreferences } from '@/utils/loginPreferences';

export default function LoginScreen({ authError, onBackToDemo }: {
  authError?: string | null;
  /** 공용 반 선택이 켜져 있을 때만 복귀 버튼을 표시한다. */
  onBackToDemo?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [saveEmail, setSaveEmail] = useState(false);
  const [stayLogin, setStayLogin] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const emailEdited = useRef(false);

  useEffect(() => { setErr(''); }, [authError]);

  useEffect(() => {
    const prefs = readLoginPreferences();
    setSaveEmail(prefs.saveEmail);
    setStayLogin(prefs.stayLogin);
    if (!emailEdited.current) setEmail(prefs.email);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending.current) return;
    if (!email || !pw) { setErr('이메일과 비밀번호를 입력하세요'); return; }
    pending.current = true;
    setErr(''); setLoading(true);
    try {
      await doLogin(email, pw, stayLogin, saveEmail);
      // 화면 진입은 AppShell의 인증 구독이 사용자 역할 조회까지 마친 뒤 확정한다.
    } catch (e: unknown) {
      setErr(loginErrorMessage(e));
    } finally {
      pending.current = false;
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
          <span className="entry-mode">교사·관리자</span>
        </div>
      </header>

      <main id="entry-main" className="entry-main" tabIndex={-1}>
        <section className="entry-panel" aria-labelledby="admin-login-title">
          <div className="entry-intro">
            <h1 id="admin-login-title">교사·관리자 로그인</h1>
            <p>개별 계정으로 로그인해 출석부와 관리자 업무를 이용합니다.</p>
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
                onChange={e => { emailEdited.current = true; setEmail(e.target.value); }}
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
            {(err || authError) && <div className="entry-error" role="alert">{err || authError}</div>}
          </form>
          {onBackToDemo && (
            <button type="button" className="entry-back-action" onClick={onBackToDemo}>
              <AdminIcon name="arrow" size={14} />
              반 선택으로 돌아가기
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
