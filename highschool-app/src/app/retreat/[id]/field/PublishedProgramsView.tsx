"use client";

import { CalendarBlank, Clock, MapPin, UserCircle } from "@phosphor-icons/react";
import { PROGRAM_KIND_META, programTasks } from "@/lib/programPreparation";
import type { RetreatProgram } from "@/lib/types";

export default function PublishedProgramsView({ programs }: { programs: RetreatProgram[] }) {
  const published = programs.filter((program) => program.status === "published");

  if (published.length === 0) {
    return (
      <section className="published-programs-empty">
        <h2>현장에 공유된 프로그램이 없습니다</h2>
        <p>프로그램 준비 화면에서 상태를 <strong>현장 공유</strong>로 바꾸면 여기에 나타납니다.</p>
      </section>
    );
  }

  return (
    <div className="published-programs">
      <header>
        <div><h2>프로그램</h2><p>확정된 진행안과 현장 준비 내용입니다.</p></div>
        <span>{published.length}개 공유 중</span>
      </header>
      {published.map((program, index) => {
        const tasks = programTasks(program);
        return (
          <article key={program.id} className="published-program">
            <div className="published-program-title">
              <span>{index + 1}</span>
              <div><h3>{program.title}</h3><p>{PROGRAM_KIND_META[program.kind]}</p></div>
            </div>
            <dl className="published-program-meta">
              {program.date && <div><dt><CalendarBlank aria-hidden="true" size={16} /> 날짜</dt><dd>{program.date}</dd></div>}
              {(program.startTime || program.endTime) && <div><dt><Clock aria-hidden="true" size={16} /> 시간</dt><dd>{program.startTime || "미정"}{program.endTime ? `–${program.endTime}` : ""}</dd></div>}
              {program.place && <div><dt><MapPin aria-hidden="true" size={16} /> 장소</dt><dd>{program.place}</dd></div>}
              {program.lead && <div><dt><UserCircle aria-hidden="true" size={16} /> 총괄</dt><dd>{program.lead}</dd></div>}
            </dl>
            {(program.theme || program.scripture || program.objective) && (
              <div className="published-program-purpose">
                {program.theme && <p><strong>주제</strong>{program.theme}</p>}
                {program.scripture && <p><strong>말씀</strong>{program.scripture}</p>}
                {program.objective && <p><strong>목표</strong>{program.objective}</p>}
              </div>
            )}
            <div className="published-program-sections">
              {program.flow && <section><h4>진행안</h4><p>{program.flow}</p></section>}
              {program.rules && <section><h4>규칙·안전</h4><p>{program.rules}</p></section>}
              {program.briefing && <section><h4>브리핑</h4><p>{program.briefing}</p></section>}
              {program.script && <section><h4>대본</h4><p>{program.script}</p></section>}
              {program.materials && <section><h4>물품·자료</h4><p>{program.materials}</p></section>}
            </div>
            {tasks.length > 0 && (
              <section className="published-program-tasks">
                <h4>할 일</h4>
                <ul>{tasks.map((task) => <li key={task.id} data-done={task.done ? "true" : undefined}>{task.done ? "완료" : "예정"} · {task.title}{task.assignee ? ` · ${task.assignee}` : ""}{task.dueDate ? ` · ${task.dueDate}` : ""}</li>)}</ul>
              </section>
            )}
          </article>
        );
      })}
    </div>
  );
}
