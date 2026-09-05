"use client";

import { CaretDown, CheckCircle, Eye, LockKey, WarningCircle } from "@phosphor-icons/react";
import PublishedProgramCard from "@/components/PublishedProgramCard";
import { canPublishProgram, programTasks, programTaskStatus } from "@/lib/programPreparation";
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
  onRequestPublish: () => void;
  onRequestUnpublish: () => void;
};

export default function ProgramPublicationPanel({
  program,
  groups,
  readiness,
  canEdit,
  busy,
  onRequestPublish,
  onRequestUnpublish,
}: Props) {
  const published = program.status === "published";
  const ready = canPublishProgram(program);
  const incompleteTasks = programTasks(program).filter((task) => programTaskStatus(task) !== "done").length;

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
              : readiness.missingLabels.length > 0
                ? `아직 ${readiness.missingLabels.length}개 현장 점검이 남았습니다: ${readiness.missingLabels.join(", ")}`
                : `현장 점검은 끝났지만 실행 할 일 ${incompleteTasks}건이 남았습니다.`}
        </p>
      </div>
      <div className="program-publication__action">
        <strong>{readiness.ready}/{readiness.total}</strong>
        <span>{incompleteTasks > 0 ? `할 일 ${incompleteTasks}건 남음` : "준비 완료"}</span>
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
      <details className="program-publication-preview">
        <summary>
          <Eye aria-hidden="true" size={18} />
          <span><strong>이가드 화면 미리보기</strong><small>현재 입력된 내용이 현장에 어떻게 보이는지 확인합니다.</small></span>
          <CaretDown aria-hidden="true" size={17} weight="bold" />
        </summary>
        <div className="program-publication-preview__body">
          <PublishedProgramCard program={program} groups={groups} sequence={1} embedded />
        </div>
      </details>
    </section>
  );
}
