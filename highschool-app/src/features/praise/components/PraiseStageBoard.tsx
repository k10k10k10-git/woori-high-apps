"use client";
import styles from "./PraiseBoardTools.module.css";
import { useState } from "react";
import type { StageAssignment, StageOverride } from "../domain/stage";
import {
  canPlaceOnStage,
  normalizeStagePositions,
  placeStagePerson,
  stagePersonKey,
} from "../domain/stageBoard";
import type {
  PraiseMeeting,
  PraisePerson,
  PraiseStageConfig,
  PraiseStageService,
  PraiseView,
} from "../types";

type Props = {
  view: PraiseView;
  meeting: PraiseMeeting;
  config: PraiseStageConfig;
  overrides: StageOverride[];
  service: PraiseStageService;
  leaderName: string;
  canEdit: boolean;
  onChange: (assignments: StageAssignment[]) => void;
};
export function PraiseStageBoard({
  view,
  meeting,
  config,
  overrides,
  service,
  leaderName,
  canEdit,
  onChange,
}: Props) {
  const [moving, setMoving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [compact, setCompact] = useState(false);
  const [query, setQuery] = useState("");
  const label = service.department === "FIRST" ? "1부" : "2부";
  const placed = new Set(
    service.assignments.map((p) => `${p.personType}:${p.personId}`),
  );
  const eligible = (p: PraisePerson) =>
    canPlaceOnStage(p, service.department, view, meeting, config, overrides);
  const move = (person: PraisePerson, location: string, position = 999) => {
    if (!canEdit) return;
    if (location === "off")
      onChange(
        normalizeStagePositions(
          service.assignments.filter(
            (p) => p.personId !== person.id || p.personType !== person.kind,
          ),
        ),
      );
    else {
      if (!eligible(person)) {
        setNotice("출석·참석·부서와 등단 제외 조건을 먼저 확인해 주세요.");
        return;
      }
      const [role, side] = location.split(":") as [
        "SINGER" | "CHOIR",
        "LEFT" | "RIGHT",
      ];
      onChange(
        placeStagePerson(service.assignments, person, role, side, position),
      );
    }
    setMoving(null);
    setNotice(`${person.name} 배치를 변경했습니다. 수정 초안을 저장해 주세요.`);
  };
  const chip = (person: PraisePerson, assignment?: StageAssignment) => {
    const available = Boolean(assignment) || eligible(person);
    const position = assignment
      ? `${assignment.role}:${assignment.side}`
      : "off";
    return (
      <div
        className={`praise-stage-person ${moving === person.id ? "is-moving" : ""}`}
        key={stagePersonKey(person)}
        draggable={canEdit && available}
        onDragStart={(e) => {
          setMoving(person.id);
          e.dataTransfer.setData("text/plain", person.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setMoving(null)}
        onDragOver={(e) => {
          if (canEdit && moving && assignment) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDrop={(e) => {
          if (!assignment || !moving) return;
          e.preventDefault();
          e.stopPropagation();
          const p = view.people.find((p) => p.id === moving);
          if (p) move(p, position, assignment.positionOrder);
        }}
      >
        <strong>{assignment?.name ?? person.name}</strong>
        {person.kind === "STAFF" && <small>스탭</small>}
        {canEdit && (
          <label>
            <span className="sr-only">
              {label} {person.name} 무대 위치
            </span>
            <select
              value={position}
              disabled={!available}
              onChange={(e) => move(person, e.target.value)}
            >
              <option value="off">등단 안 함</option>
              <option value="CHOIR:LEFT">콰이어 왼쪽</option>
              <option value="CHOIR:RIGHT">콰이어 오른쪽</option>
              <option value="SINGER:LEFT">싱어 왼쪽</option>
              <option value="SINGER:RIGHT">싱어 오른쪽</option>
            </select>
          </label>
        )}
        {canEdit && assignment && (
          <div className="praise-stage-order">
            <button
              type="button"
              aria-label={`${label} ${person.name} 앞 순서로`}
              disabled={assignment.positionOrder === 0}
              onClick={() =>
                move(person, position, assignment.positionOrder - 1)
              }
            >
              ←
            </button>
            <button
              type="button"
              aria-label={`${label} ${person.name} 뒤 순서로`}
              disabled={
                assignment.positionOrder >=
                service.assignments.filter(
                  (a) =>
                    a.role === assignment.role && a.side === assignment.side,
                ).length -
                  1
              }
              onClick={() =>
                move(person, position, assignment.positionOrder + 1)
              }
            >
              →
            </button>
          </div>
        )}
      </div>
    );
  };
  const waiting = view.people.filter(
    (p) =>
      p.active &&
      p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
      !placed.has(stagePersonKey(p)) &&
      !(config.leaderType === p.kind && config.leaderId === p.id),
  );
  return (
    <>
      <div className={styles.tools}><div role="group" aria-label={`${label} 배치 보기 방식`} className="praise-segment"><button type="button" aria-pressed={!compact} onClick={() => setCompact(false)}>무대 보기</button><button type="button" aria-pressed={compact} onClick={() => setCompact(true)}>목록으로 편집</button></div><label className={styles.search}>미등단 팀원 찾기<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름으로 찾기" /></label></div>
      <div className={`praise-stage-workbench ${compact ? styles.compact : ""}`}>
        <div
          className="praise-stage-canvas"
          role="region"
          aria-label={`${label} 등단 무대`}
        >
          <header>
            <h4>{label} 등단표</h4>
            <p>회중석에서 바라본 무대</p>
          </header>
          {(["CHOIR", "SINGER"] as const).map((role) => (
            <div className="praise-stage-row" key={role}>
              {(["LEFT", "RIGHT"] as const).map((side) => {
                const items = service.assignments
                  .filter((a) => a.role === role && a.side === side)
                  .sort((a, b) => a.positionOrder - b.positionOrder);
                return (
                  <div
                    key={side}
                    className="praise-stage-zone"
                    aria-label={`${label} ${role === "CHOIR" ? "콰이어" : "싱어"} ${side === "LEFT" ? "왼쪽" : "오른쪽"}`}
                    onDragOver={(e) => {
                      if (canEdit && moving) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const p = view.people.find((p) => p.id === moving);
                      if (p) move(p, `${role}:${side}`);
                    }}
                  >
                    <span className="praise-stage-zone-label">
                      {role === "CHOIR" ? "콰이어" : "싱어"} ·{" "}
                      {side === "LEFT" ? "왼쪽" : "오른쪽"}
                    </span>
                    <div className="praise-stage-zone-people">
                      {items.map((a) => {
                        const person = view.people.find(
                          (p) => p.id === a.personId && p.kind === a.personType,
                        );
                        return person ? (
                          chip(person, a)
                        ) : (
                          <div
                            className="praise-stage-person"
                            key={`${a.personType}:${a.personId}`}
                          >
                            <strong>{a.name}</strong>
                          </div>
                        );
                      })}
                      {items.length === 0 && (
                        <span className="praise-stage-drop-hint">
                          {canEdit ? "여기에 끌어 놓기" : "배정 없음"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="praise-stage-leader">
            <span>인도자</span>
            <strong>{leaderName}</strong>
          </div>
        </div>
        <aside
          className="praise-stage-waiting"
          onDragOver={(e) => {
            if (canEdit && moving) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const p = view.people.find((p) => p.id === moving);
            if (p) move(p, "off");
          }}
        >
          {query && <p role="status" className="praise-note">미등단 목록에서 검색 중입니다. 현재 무대 배치는 그대로 표시합니다.</p>}
          <section>
            <h4>반에서 예배하기</h4>
            <p>해당 예배 부서의 미등단 학생</p>
            <div className="praise-stage-waiting-people">
              {waiting
                .filter(
                  (p) =>
                    p.kind === "STUDENT" &&
                    (overrides.find(
                      (o) =>
                        o.termStudentId === p.id &&
                        o.kind === "MOVE_DEPARTMENT",
                    )?.department ?? p.department) === service.department,
                )
                .map((p) => chip(p))}
            </div>
          </section>
          <section>
            <h4>등단하지 않는 스탭</h4>
            <div className="praise-stage-waiting-people">
              {waiting.filter((p) => p.kind === "STAFF").map((p) => chip(p))}
            </div>
            {!waiting.some((p) => p.kind === "STAFF") && (
              <p>해당 인원이 없습니다.</p>
            )}
          </section>
        </aside>
      </div>
      {canEdit && (
        <p className="praise-note">
          무대와 미등단 영역 사이로 끌어 놓거나 이름 아래 위치 메뉴로
          이동하세요. 화살표로 같은 줄의 순서를 바꿀 수 있습니다.
        </p>
      )}
      <p className="praise-note" role="status">
        {notice}
      </p>
    </>
  );
}
