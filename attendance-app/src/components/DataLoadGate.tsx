'use client';
import { useEffect, useState } from 'react';
import { isDataReady, useApp } from '@/store/AppContext';

/** 세 원장이 확인되기 전에는 이전 자료나 불완전한 자료로 편집 화면을 열지 않는다. */
export default function DataLoadGate({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useApp();
  const ready = isDataReady(state);
  const errors = Object.values(state.dataErrors).filter((message): message is string => !!message);
  const hasError = errors.length > 0;
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setTimedOut(false);
    if (ready || hasError) return;
    const timer = setTimeout(() => setTimedOut(true), 12_000);
    return () => clearTimeout(timer);
  }, [state.dataRevision, ready, hasError]);

  if (ready) return children;

  return (
    <section role={hasError ? 'alert' : 'status'} aria-live="polite" style={{ padding: 28, textAlign: 'center', color: 'var(--text2)', lineHeight: 1.7 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>
        {hasError ? '출석부를 불러오지 못했습니다.' : timedOut ? '데이터 확인이 지연되고 있습니다.' : '출석부를 불러오고 있습니다.'}
      </h2>
      {errors.map(message => <p key={message} style={{ fontSize: 14 }}>{message}</p>)}
      {timedOut && !hasError && <p style={{ fontSize: 14 }}>네트워크 상태를 확인한 뒤 다시 불러와 주세요.</p>}
      {(hasError || timedOut) && (
        <button type="button" className="btn-secondary" style={{ padding: '10px 20px', minHeight: 44 }} onClick={() => dispatch({ type: 'RETRY_DATA_LOAD' })}>
          다시 불러오기
        </button>
      )}
    </section>
  );
}
