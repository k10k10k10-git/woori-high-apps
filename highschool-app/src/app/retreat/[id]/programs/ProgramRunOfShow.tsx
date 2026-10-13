"use client";

import { ArrowDown, ArrowUp, Clock, MapPin, User } from "@phosphor-icons/react";
import {
  PROGRAM_OPERATION_MODE_META,
  programOperationMode,
  programPostReadiness,
} from "@/lib/programPreparation";
import type { RetreatProgramItem, RetreatProgramPost, RetreatProgramRole } from "@/lib/types";

type Props = {
  posts: RetreatProgramPost[];
  itemsOf: (postId: string) => RetreatProgramItem[];
  rolesOf: (postId: string) => RetreatProgramRole[];
  canEdit: boolean;
  busyId: string | null;
  onMove: (postId: string, direction: -1 | 1) => void;
};

export default function ProgramRunOfShow({ posts, itemsOf, rolesOf, canEdit, busyId, onMove }: Props) {
  if (posts.length === 0) return null;

  function openBlock(postId: string) {
    const details = document.getElementById(`program-block-${postId}`) as HTMLDetailsElement | null;
    if (!details) return;
    details.open = true;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    details.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    details.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  }

  return (
    <section className="program-run-sheet" aria-labelledby="program-run-sheet-heading">
      <div className="program-subsection-heading">
        <div>
          <h3 id="program-run-sheet-heading">현장 진행 순서</h3>
        </div>
        <span className="program-count">{posts.length}블록</span>
      </div>
      <ol className="program-run-sheet__list">
        {posts.map((post, index) => {
          const readiness = programPostReadiness(post, itemsOf(post.id), rolesOf(post.id));
          const testLabel = post.testStatus === "passed"
            ? "테스트 완료"
            : post.testStatus === "notNeeded"
              ? "테스트 불필요"
              : post.testStatus === "testing"
                ? "테스트 중"
                : "테스트 필요";
          return (
            <li key={post.id} aria-busy={busyId === post.id || undefined}>
              <button className="program-run-sheet__open" type="button" onClick={() => openBlock(post.id)} aria-label={`${index + 1}번째 ${post.name} 블록 열기`}>
                <span className="program-run-sheet__number">{String(index + 1).padStart(2, "0")}</span>
                <span className="program-run-sheet__copy">
                  <strong>{post.name}</strong>
                  <small>{PROGRAM_OPERATION_MODE_META[programOperationMode(post)].label}</small>
                </span>
                <span className="program-run-sheet__signals">
                  <span><Clock aria-hidden="true" size={14} />{post.duration?.trim() || "시간 미정"}</span>
                  <span><MapPin aria-hidden="true" size={14} />{post.place?.trim() || "장소 미정"}</span>
                  <span><User aria-hidden="true" size={14} />담당 {readiness.roleCount || "미정"}</span>
                </span>
                <span className="program-run-sheet__readiness" data-ready={readiness.ready ? "true" : "false"}>
                  {readiness.blocked ? "준비 막힘" : `${testLabel} · 역할 ${readiness.roleCount || "미정"} · 물품 ${readiness.itemCount}`}
                </span>
              </button>
              {canEdit && (
                <div className="program-run-sheet__order" aria-label={`${post.name} 순서 변경`}>
                  <button type="button" disabled={index === 0 || busyId !== null} onClick={() => onMove(post.id, -1)} aria-label={`${post.name} 한 칸 위로`}>
                    <ArrowUp aria-hidden="true" size={16} weight="bold" />
                  </button>
                  <button type="button" disabled={index === posts.length - 1 || busyId !== null} onClick={() => onMove(post.id, 1)} aria-label={`${post.name} 한 칸 아래로`}>
                    <ArrowDown aria-hidden="true" size={16} weight="bold" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
