'use client';
export default function UpdateBanner({ onReload }: { onReload: () => void }) {
  return (
    <div className="update-toast">
      <img src="/icon-192.png" alt="우리교회" className="update-toast-icon" />
      <div className="update-toast-body">
        <div className="update-toast-title">새 버전이 업데이트되었습니다</div>
        <div className="update-toast-sub">새로고침하면 최신 버전으로 전환됩니다</div>
      </div>
      <button className="update-toast-btn" onClick={onReload}>새로고침</button>
    </div>
  );
}
