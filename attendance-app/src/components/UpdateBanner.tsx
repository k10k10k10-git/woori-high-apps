'use client';
export default function UpdateBanner({ onReload, onDismiss, saving = false }: { onReload: () => void; onDismiss: () => void; saving?: boolean }) {
  return (
    <div className="update-toast" role="status" aria-live="polite">
      <img src="/icon-192.png" alt="우리교회" className="update-toast-icon" />
      <div className="update-toast-body">
        <div className="update-toast-title">새 버전을 사용할 수 있습니다</div>
        <div className="update-toast-sub">{saving ? '저장 중입니다. 저장이 끝나면 업데이트해 주세요.' : '작성 중인 내용을 저장한 뒤 새로고침해 주세요.'}</div>
      </div>
      <div className="update-toast-actions">
        <button type="button" className="update-toast-later" onClick={onDismiss}>나중에</button>
        <button type="button" className="update-toast-btn" disabled={saving} onClick={onReload}>{saving ? '저장 중' : '새로고침'}</button>
      </div>
    </div>
  );
}
