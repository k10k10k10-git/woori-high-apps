/** 부가적인 로그인 옵션 저장 실패가 인증 성공/실패를 바꾸지 않게 한다. 비밀번호는 저장하지 않는다. */
export function readLoginPreferences() {
  try {
    const saveEmail = localStorage.getItem('saveEmail') === '1';
    return { saveEmail, stayLogin: localStorage.getItem('stayLogin') === '1', email: saveEmail ? localStorage.getItem('savedEmail') ?? '' : '' };
  } catch { return { saveEmail: false, stayLogin: false, email: '' }; }
}

export function writeLoginPreferences(email: string, saveEmail: boolean, stayLogin: boolean) {
  try {
    localStorage.setItem('saveEmail', saveEmail ? '1' : '0');
    localStorage.setItem('stayLogin', stayLogin ? '1' : '0');
    if (saveEmail) localStorage.setItem('savedEmail', email);
    else localStorage.removeItem('savedEmail');
  } catch { /* 저장소가 제한되어도 이미 완료한 인증은 유지한다. */ }
}

export function loginErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (/user-not-found|wrong-password|invalid-credential/.test(code)) return '이메일 또는 비밀번호가 잘못되었습니다';
  if (code.includes('invalid-email')) return '이메일 형식을 확인해 주세요.';
  if (code.includes('network-request-failed')) return '인터넷 연결을 확인한 뒤 다시 로그인해 주세요.';
  if (code.includes('too-many-requests')) return '로그인 시도가 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.';
  if (code.includes('user-disabled')) return '사용이 중지된 계정입니다. 관리자에게 문의해 주세요.';
  if (/web-storage|unsupported-persistence/.test(code)) return '브라우저의 저장소 설정을 확인한 뒤 다시 로그인해 주세요.';
  // Supabase 로그인(이메일 코드·비밀번호)에서 새로 생긴 경우. supabaseAuth 가 Firebase 식 코드로 바꿔 준다.
  if (code.includes('invalid-code')) return '코드가 맞지 않거나 시간이 지났습니다. 새 코드를 받아 다시 입력해 주세요.';
  if (code.includes('email-not-confirmed')) return '아직 확인되지 않은 계정입니다. 이메일 코드로 로그인해 주세요.';
  if (code.includes('mailboxless-email')) return '@woorihigh.com 계정은 코드를 받을 수 없습니다. 비밀번호로 로그인해 주세요.';
  if (code.includes('signup-disabled')) return '이 이메일로는 새 계정을 만들 수 없습니다. 관리자에게 문의해 주세요.';
  if (code.includes('operation-not-allowed')) return '이 로그인 방법은 지금 쓸 수 없습니다. 다른 방법으로 로그인해 주세요.';
  if (code.includes('not-configured')) return '로그인 설정이 아직 끝나지 않았습니다. 관리자에게 알려 주세요.';
  if (code.includes('captcha-failed')) return '로봇 확인을 마치지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.';
  return '로그인하지 못했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.';
}
