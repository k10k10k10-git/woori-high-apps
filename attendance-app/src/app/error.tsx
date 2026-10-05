'use client';

import { useEffect } from 'react';

/**
 * 런타임 에러 바운더리.
 *
 * 이게 없으면 렌더 중 예외 하나에 화면 전체가 흰 화면이 되고 복구 수단이 없다.
 * 주일 아침에 반 교사가 출석을 넣다 흰 화면을 만나면 새로고침을 떠올리지 못하고
 * 그대로 포기한다. 최소한 (1) 무슨 일인지, (2) 다시 시도, (3) 홈으로 가는 길
 * 셋을 항상 제공한다.
 *
 * error.tsx는 루트 레이아웃 아래에서 일어난 예외만 잡는다. 레이아웃 자체의
 * 예외는 Context에 의존하지 않는 global-error.tsx가 별도로 복구 안내한다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[출석부] 화면 오류:', error);
  }, [error]);

  return (
    <div style={{ display: 'flex', minHeight: '60vh', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow)', padding: 24, maxWidth: 380, width: '100%', textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden="true">⚠️</div>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>
          화면을 불러오지 못했습니다
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, margin: '0 0 4px' }}>
          일시적인 문제일 수 있습니다.<br />다시 시도해도 같은 화면이면 관리자에게 알려주세요.
        </p>

        {error.digest && (
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: '8px 0 0' }}>
            오류 코드 {error.digest}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button
            onClick={reset}
            style={{
              minHeight: 44, padding: '0 18px', background: 'var(--primary)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            다시 시도
          </button>
          {/* 탈출구는 의도적으로 하드 내비게이션을 쓴다. 클라이언트 라우팅은 깨진
              React 트리와 구독 상태를 그대로 들고 갈 수 있다. 소프트 복구는
              "다시 시도"(reset)가 맡고, "홈으로"는 새 문서를 받는 최후 수단이다. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              minHeight: 44, padding: '0 18px', display: 'inline-flex', alignItems: 'center',
              background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}
          >
            홈으로
          </a>
        </div>
      </div>
    </div>
  );
}
