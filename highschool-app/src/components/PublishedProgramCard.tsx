"use client";

import { CalendarBlank, Clock, MapPin, UserCircle } from "@phosphor-icons/react";
import {
  PROGRAM_OPERATION_MODE_META,
  PROGRAM_PARTICIPATION_MODE_META,
  programCompetitionTeams,
  programKindMeta,
  programOperationMode,
  programParticipationMode,
  programPosts,
  programTasks,
} from "@/lib/programPreparation";
import type { Group, RetreatProgram } from "@/lib/types";

type Props = {
  program: RetreatProgram;
  groups: Group[];
  sequence: number;
  embedded?: boolean;
};

/** 행정 미리보기와 이가드 현장이 같은 마크업을 사용하도록 분리한 읽기 전용 카드. */
export default function PublishedProgramCard({ program, groups, sequence, embedded = false }: Props) {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const tasks = programTasks(program);
  const blocks = programPosts(program);
  const competitionTeams = programCompetitionTeams(program);

  return (
    <article className={`published-program${embedded ? " published-program--embedded" : ""}`}>
      <div className="published-program-title">
        <span>{sequence}</span>
        <div><h3>{program.title}</h3><p>{programKindMeta(program.kind)}</p></div>
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
      {blocks.length > 0 && (
        <section className="published-program-blocks">
          <h4>진행 순서</h4>
          <ol>
            {blocks.map((block) => (
              <li key={block.id}>
                <span>{block.name}</span>
                <small>{PROGRAM_OPERATION_MODE_META[programOperationMode(block)].label} · {PROGRAM_PARTICIPATION_MODE_META[programParticipationMode(block)]}{block.duration ? ` · ${block.duration}` : ""}</small>
                {(block.rules || block.runCautions) && <p>{block.rules || block.runCautions}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {competitionTeams.length > 0 && (
        <section className="published-program-alliance">
          <h4>연합팀</h4>
          <div>{competitionTeams.map((team) => {
            const names = Object.keys(team.groupIds ?? {}).map((groupId) => groupNames.get(groupId) ?? "삭제된 조");
            return <span key={team.id} data-color={team.color ?? "blue"}>{team.name}{names.length > 0 ? ` · ${names.join("·")}` : " · 미배정"}</span>;
          })}</div>
        </section>
      )}
      {tasks.length > 0 && (
        <section className="published-program-tasks">
          <h4>할 일</h4>
          <ul>{tasks.map((task) => <li key={task.id} data-done={task.done ? "true" : undefined}>{task.done ? "완료" : "예정"} · {task.title}{task.assignee ? ` · ${task.assignee}` : ""}{task.dueDate ? ` · ${task.dueDate}` : ""}</li>)}</ul>
        </section>
      )}
    </article>
  );
}
