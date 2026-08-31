"use client";

import { ArrowCounterClockwise, X } from "@phosphor-icons/react";

type Props = {
  label: string;
  busy: boolean;
  onUndo: () => void;
  onDismiss: () => void;
};

export default function ProgramUndoNotice({ label, busy, onUndo, onDismiss }: Props) {
  return (
    <div className="program-undo-notice" role="status" aria-live="polite">
      <span>{label}을(를) 삭제했습니다.</span>
      <button type="button" onClick={onUndo} disabled={busy}>
        <ArrowCounterClockwise aria-hidden="true" size={17} weight="bold" />
        {busy ? "복구 중…" : "실행 취소"}
      </button>
      <button type="button" className="program-undo-dismiss" onClick={onDismiss} disabled={busy} aria-label="삭제 알림 닫기">
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}
