"use client";

import { CheckCircle, Eye, LockKey, WarningCircle } from "@phosphor-icons/react";
import type { RetreatProgramStatus } from "@/lib/types";

type Readiness = {
  ready: number;
  total: number;
  percent: number;
  missingLabels: string[];
};

type Props = {
  status: RetreatProgramStatus;
  readiness: Readiness;
  canEdit: boolean;
  busy: boolean;
  onRequestPublish: () => void;
  onRequestUnpublish: () => void;
};

export default function ProgramPublicationPanel({
  status,
  readiness,
  canEdit,
  busy,
  onRequestPublish,
  onRequestUnpublish,
}: Props) {
  const published = status === "published";
  const ready = readiness.percent === 100;

  return (
    <section className="program-publication" aria-labelledby="program-publication-heading" data-published={published ? "true" : "false"}>
      <div className="program-publication__icon">
        {published ? <CheckCircle aria-hidden="true" size={24} weight="fill" /> : ready ? <Eye aria-hidden="true" size={24} /> : <LockKey aria-hidden="true" size={24} />}
      </div>
      <div className="program-publication__copy">
        <span>마지막 단계</span>
        <h3 id="program-publication-heading">{published ? "이가드 현장에 공유 중" : "현장 공유"}</h3>
        <p>
          {published
            ? "이가드 정보 화면에서 이 프로그램을 볼 수 있습니다. 내용을 바꾸면 공유 화면에도 바로 반영됩니다."
            : ready
              ? "준비 항목을 모두 확인했습니다. 공유하면 이가드 정보 화면에 즉시 표시됩니다."
              : `아직 ${readiness.missingLabels.length}개 준비가 남았습니다: ${readiness.missingLabels.join(", ")}`}
        </p>
      </div>
      <div className="program-publication__action">
        <strong>{readiness.ready}/{readiness.total}</strong>
        <span>준비 완료</span>
        {canEdit && (published ? (
          <button type="button" className="btn-secondary" disabled={busy} onClick={onRequestUnpublish}>
            <WarningCircle aria-hidden="true" size={16} /> 공유 해제
          </button>
        ) : (
          <button type="button" className="btn-primary" disabled={busy || !ready} onClick={onRequestPublish}>
            <Eye aria-hidden="true" size={16} /> 현장에 공유
          </button>
        ))}
      </div>
    </section>
  );
}
