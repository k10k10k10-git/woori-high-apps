'use client';

import { useRef, useState, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '@/hooks/useModalFocus';
import './management-dialog.css';

/** 관리 폼의 닫기·작성 내용 보호·초점·모바일 스크롤을 한곳에서 처리한다. */
export default function ManagementDialog({ title, description, busy = false, dirty = false, onClose, children }: {
  title: string; description?: string; busy?: boolean; dirty?: boolean; onClose: () => void;
  children: (dismiss: () => void) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const dismiss = () => {
    if (busy) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };
  useModalFocus({ containerRef, onDismiss: () => confirmClose ? setConfirmClose(false) : dismiss() });
  useEffect(() => { if (confirmClose) keepEditingRef.current?.focus(); }, [confirmClose]);
  useLayoutEffect(() => {
    const previous = document.body.style.overflow;
    const overlay = containerRef.current?.parentElement;
    const background = [...document.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay)
      .map(node => ({ node, inert: node.inert }));
    background.forEach(({ node }) => { node.inert = true; });
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; background.forEach(({ node, inert }) => { node.inert = inert; }); };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="management-overlay" onClick={dismiss}>
    <div ref={containerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy}
      className="management-dialog" onClick={event => event.stopPropagation()}>
      <header className="management-dialog-header">
        <h2>{title}</h2>
        <button type="button" className="management-close" aria-label={`${title} 닫기`} onClick={dismiss} disabled={busy}>닫기</button>
        {description && <p>{description}</p>}
      </header>
      {confirmClose && <div className="management-discard" role="alert">
        <p>저장하지 않은 내용이 있습니다. 작성을 그만둘까요?</p>
        <div className="management-actions"><button ref={keepEditingRef} type="button" className="btn-primary" onClick={() => setConfirmClose(false)}>계속 작성</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>변경 버리고 닫기</button></div>
      </div>}
      {children(dismiss)}
    </div>
  </div>, document.body);
}
