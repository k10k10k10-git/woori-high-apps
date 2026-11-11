'use client';
import { useState, useEffect, useRef } from 'react';
import { doGoogleLogin, doLogin, doSendLoginCode, doVerifyLoginCode } from '@/hooks/useAuth';
import AdminIcon from '@/components/admin/AdminIcon';
import { isMailboxlessEmail, isValidEmail, MAILBOXLESS_DOMAIN, normalizeEmail } from '@/lib/accountEmail';
import { isGoogleLoginEnabled } from '@/lib/supabaseAuth';
import { loginErrorMessage, readLoginPreferences } from '@/utils/loginPreferences';

type Mode = 'code' | 'password';

// 고등부 앱 LoginDialog 와 같은 방식: 이메일 6자리 코드(메일함이 있는 계정) 또는 비밀번호(@woorihigh.com 등).
export default function LoginScreen({ authError, onBackToDemo }: {
  authError?: string | null;
  /** 공용 반 선택이 켜져 있을 때만 복귀 버튼을 표시한다. */
  onBackToDemo?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [pickedMode, setPickedMode] = useState<Mode>('code');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [saveEmail, setSaveEmail] = useState(false);
  const [stayLogin, setStayLogin] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const emailEdited = useRef(false);
  // 메일함이 없는 계정은 코드를 골라도 비밀번호 단계로 보인다(렌더 중 파생).
  const mailboxless = isMailboxlessEmail(email);
  const mode: Mode = mailboxless ? 'password' : pickedMode;
  const codeSent = codeSentTo !== null && codeSentTo === normalizeEmail(email);

  useEffect(() => { setErr(''); }, [authError]);

  useEffect(() => {
    const prefs = readLoginPreferences();
    setSaveEmail(prefs.saveEmail);
    setStayLogin(prefs.stayLogin);
    if (!emailEdited.current) setEmail(prefs.email);
  }, []);

  const run = async (action: () => Promise<void>, onSuccess?: () => void) => {
    if (pending.current) return;
    pending.current = true;
    setErr(''); setLoading(true);
    try {
      await action();
      onSuccess?.();
      // 화면 진입은 AppShell의 인증 구독이 사용자 역할 조회까지 마친 뒤 확정한다.
    } catch (e: unknown) {
      setErr(loginErrorMessage(e));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending.current) return;
    if (mode === 'password') {
      if (!email || !pw) { setErr('이메일과 비밀번호를 입력하세요'); return; }
      await run(() => doLogin(email, pw, stayLogin, saveEmail));
      return;
    }
    if (!email) { setErr('이메일을 입력하세요'); return; }
    if (!isValidEmail(email)) { setErr('이메일 형식을 확인해 주세요.'); return; }
    if (!codeSent) {
      await run(() => doSendLoginCode(email), () => { setCodeSentTo(normalizeEmail(email)); setCode(''); });
      return;
    }
    if (!/^\d{6,10}$/.test(code.trim())) { setErr('메일로 받은 숫자 코드를 입력하세요'); return; }
    await run(() => doVerifyLoginCode(email, code, stayLogin, saveEmail));
  };

  const pick = (next: Mode) => { setPickedMode(next); setErr(''); };
  const busyLabel = mode === 'password' ? '로그인 중...' : codeSent ? '확인 중...' : '코드 보내는 중...';
  const submitLabel = mode === 'password' ? '로그인' : codeSent ? '코드 확인' : '코드 받기';

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

          <div className="entry-login-modes" role="group" aria-label="로그인 방법">
            <button type="button" aria-pressed={mode === 'code'} disabled={loading || mailboxless} onClick={() => pick('code')}>이메일 코드</button>
            <button type="button" aria-pressed={mode === 'password'} disabled={loading} onClick={() => pick('password')}>비밀번호</button>
          </div>

          <form className="entry-form" onSubmit={handleLogin} aria-busy={loading} noValidate>
            <div className="entry-field">
              <label htmlFor="admin-email">이메일</label>
              <input
                id="admin-email"
                className="entry-input"
                type="email"
                inputMode="email"
                placeholder="이메일"
                value={email}
                onChange={e => { emailEdited.current = true; setEmail(e.target.value); }}
                autoComplete="email"
              />
            </div>
            {mailboxless && (
              <p className="entry-login-note">@{MAILBOXLESS_DOMAIN} 계정은 메일함이 없어 코드를 받을 수 없습니다. 관리자가 정해 준 비밀번호로 로그인해 주세요.</p>
            )}
            {mode === 'password' && (
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
            )}
            {mode === 'code' && !codeSent && (
              <p className="entry-login-note">이메일로 6자리 코드를 보내 드립니다. 처음이면 계정이 자동으로 만들어지고, 출석부 권한은 관리자가 등록한 이메일에만 열립니다.</p>
            )}
            {mode === 'code' && codeSent && (
              <>
                <p className="entry-login-note" role="status"><strong>{codeSentTo}</strong>로 코드를 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.</p>
                <div className="entry-field">
                  <label htmlFor="admin-code">6자리 코드</label>
                  <input
                    id="admin-code"
                    className="entry-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={10}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </>
            )}
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
              {loading ? busyLabel : submitLabel}
              {!loading && <AdminIcon name="arrow" size={15} />}
            </button>
            {mode === 'code' && codeSent && (
              <button type="button" className="entry-back-action" disabled={loading}
                onClick={() => void run(() => doSendLoginCode(email), () => setCode(''))}>코드 다시 받기</button>
            )}
            <span className="entry-sr-only" role="status" aria-live="polite">
              {loading ? '로그인 정보를 확인하는 중입니다' : ''}
            </span>
            {(err || authError) && <div className="entry-error" role="alert">{err || authError}</div>}
          </form>
          {mode === 'password' && (
            <p className="entry-login-note">비밀번호를 모르면 관리자에게 다시 정해 달라고 요청해 주세요. 메일을 받을 수 있는 계정은 이메일 코드로도 들어올 수 있습니다.</p>
          )}
          {isGoogleLoginEnabled() && (
            <button type="button" className="entry-secondary-action entry-google-action" disabled={loading}
              onClick={() => void run(() => doGoogleLogin(stayLogin))}>Google로 로그인</button>
          )}
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
