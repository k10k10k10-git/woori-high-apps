"use client";

import { CaretDown, CheckCircle, Eye, LockKey, WarningCircle } from "@phosphor-icons/react";
import PublishedProgramCard from "@/components/PublishedProgramCard";
import { canPublishProgram, programReleases, programTasks, programTaskStatus } from "@/lib/programPreparation";
import type { Group, RetreatProgram } from "@/lib/types";

type Readiness = {
  ready: number;
  total: number;
  percent: number;
  missingLabels: string[];
};

type Props = {
  program: RetreatProgram;
  groups: Group[];
  readiness: Readiness;
  canEdit: boolean;
  busy: boolean;
  hasUnsavedChanges: boolean;
  onRequestPublish: () => void;
  onRequestUnpublish: () => void;
};

export default function ProgramPublicationPanel({
  program,
  groups,
  readiness,
  canEdit,
  busy,
  hasUnsavedChanges,
  onRequestPublish,
  onRequestUnpublish,
}: Props) {
  const published = program.status === "published";
  const ready = canPublishProgram(program);
  const incompleteTasks = programTasks(program).filter((task) => programTaskStatus(task) !== "done").length;
  const releases = programReleases(program);
  const activeRelease = program.activeReleaseId ? program.releases?.[program.activeReleaseId] : undefined;
  const hasUnpublishedChanges = published && (!activeRelease || activeRelease.releasedAt !== program.updatedAt);

  return (
    <section className="program-publication" aria-labelledby="program-publication-heading" data-published={published ? "true" : "false"}>
      <div className="program-publication__icon">
        {published ? <CheckCircle aria-hidden="true" size={24} weight="fill" /> : ready ? <Eye aria-hidden="true" size={24} /> : <LockKey aria-hidden="true" size={24} />}
      </div>
      <div className="program-publication__copy">
        <h3 id="program-publication-heading">{published ? "이가드 현장에 공유 중" : "현장 공유"}</h3>
        <p>
          {published
            ? hasUnsavedChanges
              ? "저장하지 않은 초안이 있습니다. 먼저 초안을 저장한 뒤 새 배포본으로 공유해 주세요."
              : `${hasUnpublishedChanges ? "저장된 변경사항이 있습니다. " : ""}현장은 확정된 배포본을 보고 있습니다${releases.length > 0 ? ` · 배포본 ${releases.length}개 보관` : ""}.`
            : ready
              ? "준비 항목을 모두 확인했습니다. 공유하면 현재 내용을 변경 불가 배포본으로 저장하고 이가드에 표시합니다."
              : readiness.missingLabels.length > 0
                ? `아직 ${readiness.missingLabels.length}개 현장 점검이 남았습니다: ${readiness.missingLabels.join(", ")}`
                : `현장 점검은 끝났지만 실행 할 일 ${incompleteTasks}건이 남았습니다.`}
        </p>
      </div>
      <div className="program-publication__action">
        <strong>{readiness.ready}/{readiness.total}</strong>
        <span>{incompleteTasks > 0 ? `할 일 ${incompleteTasks}건 남음` : "준비 완료"}</span>
        {canEdit && (published ? <div className="program-publication__buttons">
          {hasUnpublishedChanges && (
            <button type="button" className="btn-primary" disabled={busy || hasUnsavedChanges || !ready} onClick={onRequestPublish}>
              <Eye aria-hidden="true" size={16} /> 변경사항 다시 공유
            </button>
          )}
          <button type="button" className="btn-secondary" disabled={busy} onClick={onRequestUnpublish}>
            <WarningCircle aria-hidden="true" size={16} /> 공유 해제
          </button>
        </div> : (
          <button type="button" className="btn-primary" disabled={busy || !ready} onClick={onRequestPublish}>
            <Eye aria-hidden="true" size={16} /> 현장에 공유
          </button>
        ))}
      </div>
      <details className="program-publication-preview">
        <summary>
          <Eye aria-hidden="true" size={18} />
          <span><strong>새 배포본 미리보기</strong><small>다시 공유할 때 현장에 전달될 현재 작업 내용을 확인합니다.</small></span>
          <CaretDown aria-hidden="true" size={17} weight="bold" />
        </summary>
        <div className="program-publication-preview__body">
          <PublishedProgramCard program={program} groups={groups} sequence={1} embedded />
        </div>
      </details>
    </section>
  );
}
