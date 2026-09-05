'use client';

export default function ChartLoadState({ ready, error, onRetry }: {
  ready: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (ready) return null;
  return (
    <div className="overall-card" role="status" aria-live="polite" aria-atomic="true"
      style={{ padding: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: '1 1 220px', fontSize: 13, color: error ? 'var(--red-text)' : 'var(--text2)' }}>
        {error ? '차트를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.' : '차트를 불러오는 중입니다.'}
      </span>
      {error && (
        <button type="button" className="btn-secondary" onClick={onRetry}
          style={{ minHeight: 44, flex: '0 0 auto' }}>
          차트 다시 불러오기
        </button>
      )}
    </div>
  );
}
