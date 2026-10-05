'use client';

/** root layout의 인증/원장 셸 예외는 같은 segment의 error.tsx로 잡히지 않는다. CSS·Context 없이 복구한다. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="ko"><head><title>화면 다시 열기 · 출석부</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
    <body style={{ margin: 0, background: '#f7f7f9', color: '#292933', fontFamily: 'system-ui, sans-serif', lineHeight: 1.7 }}>
      <main style={{ maxWidth: 480, margin: '12vh auto', padding: 28 }}>
        <h1 style={{ fontSize: 24, lineHeight: 1.4 }}>출석부 화면을 다시 열어 주세요</h1>
        <p>화면을 표시하는 중 문제가 발생했습니다. 이 안내만으로 저장 실패나 기록 소실이 확인된 것은 아닙니다. 다시 열고 최근 저장 상태를 확인해 주세요.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: '10px 18px', borderRadius: 12, border: 'none', font: 'inherit', background: '#6355a7', color: '#fff', cursor: 'pointer' }}>다시 시도</button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ minHeight: 44, padding: '10px 18px', borderRadius: 12, color: '#6355a7', display: 'inline-flex', alignItems: 'center' }}>출석부 다시 열기</a>
        </div>
      </main>
    </body></html>;
}
