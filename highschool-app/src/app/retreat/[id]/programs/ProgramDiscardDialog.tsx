"use client";

import OverlayShell from "@/components/OverlayShell";

type Props = {
  actionLabel: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ProgramDiscardDialog({ actionLabel, onCancel, onConfirm }: Props) {
  if (!actionLabel) return null;
  return (
    <OverlayShell label="저장하지 않은 변경" onClose={onCancel} panelClassName="program-confirm-dialog w-full max-w-sm">
      <div className="program-confirm-dialog__body">
        <h2>변경 사항을 저장하지 않고 이동할까요?</h2>
        <p>작성 중인 내용은 사라집니다. 계속하면 {actionLabel}합니다.</p>
        <div className="program-confirm-dialog__actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>계속 작성</button>
          <button type="button" className="btn-danger" onClick={onConfirm}>변경 버리고 이동</button>
        </div>
      </div>
    </OverlayShell>
  );
}
