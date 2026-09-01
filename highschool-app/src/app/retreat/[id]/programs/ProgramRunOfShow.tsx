"use client";

import { Clock, MapPin, User } from "@phosphor-icons/react";
import {
  PROGRAM_OPERATION_MODE_META,
  programOperationMode,
} from "@/lib/programPreparation";
import type { RetreatProgramItem, RetreatProgramPost, RetreatProgramRole } from "@/lib/types";

type Props = {
  posts: RetreatProgramPost[];
  itemsOf: (postId: string) => RetreatProgramItem[];
  rolesOf: (postId: string) => RetreatProgramRole[];
};

export default function ProgramRunOfShow({ posts, itemsOf, rolesOf }: Props) {
  if (posts.length === 0) return null;

  function openBlock(postId: string) {
    const details = document.getElementById(`program-block-${postId}`) as HTMLDetailsElement | null;
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ behavior: "smooth", block: "start" });
    details.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  }

  return (
    <section className="program-run-sheet" aria-labelledby="program-run-sheet-heading">
      <div className="program-subsection-heading">
        <div>
          <h3 id="program-run-sheet-heading">현장 진행 순서</h3>
          <p>활동의 순서와 장소·시간·담당을 먼저 훑고, 필요한 블록을 바로 펼쳐 수정합니다.</p>
        </div>
        <span className="program-count">{posts.length}블록</span>
      </div>
      <ol className="program-run-sheet__list">
        {posts.map((post, index) => {
          const roleCount = rolesOf(post.id).filter((role) => role.assignee?.trim()).length;
          const itemCount = itemsOf(post.id).length;
          return (
            <li key={post.id}>
              <button type="button" onClick={() => openBlock(post.id)} aria-label={`${index + 1}번째 ${post.name} 블록 열기`}>
                <span className="program-run-sheet__number">{String(index + 1).padStart(2, "0")}</span>
                <span className="program-run-sheet__copy">
                  <strong>{post.name}</strong>
                  <small>{PROGRAM_OPERATION_MODE_META[programOperationMode(post)].label}</small>
                </span>
                <span className="program-run-sheet__signals">
                  <span><Clock aria-hidden="true" size={14} />{post.duration?.trim() || "시간 미정"}</span>
                  <span><MapPin aria-hidden="true" size={14} />{post.place?.trim() || "장소 미정"}</span>
                  <span><User aria-hidden="true" size={14} />담당 {roleCount || "미정"}</span>
                </span>
                <span className="program-run-sheet__readiness" data-ready={roleCount > 0 && itemCount > 0 ? "true" : "false"}>
                  역할 {roleCount} · 물품 {itemCount}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
