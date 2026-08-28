"use client";

import { ArrowDown, ArrowUp, Plus } from "@phosphor-icons/react";
import { PROGRAM_KIND_META, PROGRAM_STATUS_META, programReadiness } from "@/lib/programPreparation";
import type { RetreatProgram } from "@/lib/types";

type Props = {
  programs: RetreatProgram[];
  selectedId: string | null;
  canEdit: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onCreateDefaults: () => void;
  onMove: (id: string, direction: -1 | 1) => void;
};

export default function ProgramList({
  programs, selectedId, canEdit, busy, onSelect, onAdd, onCreateDefaults, onMove,
}: Props) {
  if (programs.length === 0) {
    return (
      <section className="program-empty" aria-labelledby="program-empty-heading">
        <div>
          <h2 id="program-empty-heading">프로그램 준비를 시작해보세요</h2>
          <p>수련회당 2개를 기본으로 만들고, 필요하면 3개 이상으로 늘릴 수 있습니다. 빈 초안은 현장에 공유되지 않습니다.</p>
        </div>
        {canEdit && (
          <div className="program-empty-actions">
            <button type="button" className="btn-primary" onClick={onCreateDefaults} disabled={busy}>기본 2개 만들기</button>
            <button type="button" className="btn-secondary" onClick={onAdd} disabled={busy}>1개만 만들기</button>
          </div>
        )}
      </section>
    );
  }

  return (
    <aside className="program-list" aria-label="프로그램 목록">
      <div className="program-list-heading">
        <div>
          <h2>프로그램 {programs.length}개</h2>
          <p>순서대로 현장에 전달합니다.</p>
        </div>
        {canEdit && (
          <button type="button" className="program-add-button" onClick={onAdd} disabled={busy}>
            <Plus aria-hidden="true" size={16} weight="bold" /> 추가
          </button>
        )}
      </div>
      <div className="program-list-items">
        {programs.map((program, index) => {
          const readiness = programReadiness(program);
          return (
            <article key={program.id} className="program-list-item" data-selected={selectedId === program.id ? "true" : undefined}>
              <button type="button" className="program-list-select" onClick={() => onSelect(program.id)} aria-current={selectedId === program.id ? "true" : undefined}>
                <span className="program-list-order">{index + 1}</span>
                <span className="program-list-copy">
                  <strong>{program.title}</strong>
                  <small>{PROGRAM_KIND_META[program.kind]} · {PROGRAM_STATUS_META[program.status].label}</small>
                </span>
                <span className="program-list-progress" aria-label={`준비 ${readiness.percent}%`}>{readiness.percent}%</span>
              </button>
              {canEdit && programs.length > 1 && (
                <div className="program-order-controls" aria-label={`${program.title} 순서 변경`}>
                  <button type="button" onClick={() => onMove(program.id, -1)} disabled={busy || index === 0} aria-label="앞으로 이동"><ArrowUp aria-hidden="true" size={14} /></button>
                  <button type="button" onClick={() => onMove(program.id, 1)} disabled={busy || index === programs.length - 1} aria-label="뒤로 이동"><ArrowDown aria-hidden="true" size={14} /></button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
