'use client';
import { useEffect, useState } from 'react';
import AdminIcon from '@/components/admin/AdminIcon';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'woori-attendance-install-dismissed';

function isStandalone() {
  return (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
}

function rememberDismissal() {
  try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* 저장소가 막혀도 현재 화면에서는 닫는다. */ }
}

export default function InstallPrompt() {
  const [mode, setMode] = useState<'hidden' | 'native' | 'ios'>('hidden');
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      setMode('native');
    };
    const handleInstalled = () => {
      rememberDismissal();
      setInstallEvent(null);
      setMode('hidden');
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setMode('ios');

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const dismiss = () => {
    rememberDismissal();
    setMode('hidden');
  };

  const install = async () => {
    if (mode === 'ios') {
      if (showIosSteps) dismiss();
      else setShowIosSteps(true);
      return;
    }
    if (!installEvent) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
      rememberDismissal();
      setInstallEvent(null);
      setMode('hidden');
    } catch {
      setInstallEvent(null);
      setMode('hidden');
    } finally {
      setInstalling(false);
    }
  };

  if (mode === 'hidden') return null;

  return (
    <aside className="install-prompt" role="region" aria-label="홈 화면 설치 안내">
      <span className="install-prompt-icon" aria-hidden="true"><AdminIcon name="book" size={20} /></span>
      <div className="install-prompt-copy">
        <strong>홈 화면에 출석부를 추가해보세요</strong>
        <span>{showIosSteps
          ? '공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요.'
          : mode === 'ios' ? 'Safari의 공유 메뉴에서 앱처럼 추가할 수 있습니다.' : '다음부터 앱처럼 바로 열 수 있습니다.'}</span>
      </div>
      <div className="install-prompt-actions">
        <button type="button" className="install-prompt-primary" onClick={() => void install()} disabled={installing}>
          {installing ? '설치 중' : mode === 'ios' ? (showIosSteps ? '확인' : '방법 보기') : '설치'}
        </button>
        <button type="button" className="install-prompt-dismiss" onClick={dismiss}>닫기</button>
      </div>
    </aside>
  );
}
