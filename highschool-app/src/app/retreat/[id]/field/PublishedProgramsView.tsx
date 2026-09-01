"use client";

import PublishedProgramCard from "@/components/PublishedProgramCard";
import type { Group, RetreatProgram } from "@/lib/types";

export default function PublishedProgramsView({ programs, groups }: { programs: RetreatProgram[]; groups: Group[] }) {
  const published = programs.filter((program) => program.status === "published");

  if (published.length === 0) {
    return (
      <section className="published-programs-empty">
        <h2>현장에 공유된 프로그램이 없습니다</h2>
        <p>프로그램 준비 화면에서 모든 준비 항목을 완료한 뒤 <strong>현장에 공유</strong>하면 여기에 나타납니다.</p>
      </section>
    );
  }

  return (
    <div className="published-programs">
      <header>
        <div><h2>프로그램</h2><p>확정된 진행안과 현장 준비 내용입니다.</p></div>
        <span>{published.length}개 공유 중</span>
      </header>
      {published.map((program, index) => (
        <PublishedProgramCard key={program.id} program={program} groups={groups} sequence={index + 1} />
      ))}
    </div>
  );
}
