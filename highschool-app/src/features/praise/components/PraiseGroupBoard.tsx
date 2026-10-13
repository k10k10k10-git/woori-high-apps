"use client";
import styles from "./PraiseBoardTools.module.css";
import { useState } from "react";
import type { PraiseGroup, PraisePerson } from "../types";

type Props = {
  groups: PraiseGroup[];
  people: PraisePerson[];
  maximum: number;
  canEdit: boolean;
  onMove: (
    id: string,
    groupId: string,
    kind: "studentIds" | "staffIds",
  ) => void;
  onRename: (id: string, name: string) => void;
};
/** 드래그와 카드 안의 선택 메뉴가 같은 이동 함수를 사용한다. 터치·키보드도 동일하게 지원한다. */
export function PraiseGroupBoard({
  groups,
  people,
  maximum,
  canEdit,
  onMove,
  onRename,
}: Props) {
  const [moving, setMoving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [chosenGroup, setChosenGroup] = useState(groups[0]?.id ?? "all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [destination, setDestination] = useState("");
  const matches = (person: PraisePerson) => person.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const mobileGroup = groups.some(group => group.id === chosenGroup) || chosenGroup === "unassigned" ? chosenGroup : "all";
  const selectedStudents = people.filter(person => person.active && person.kind === "STUDENT" && selected.has(person.id));
  const bulkMove = () => {
    if (!canEdit || !destination || !selectedStudents.length || (destination !== "unassigned" && !groups.some(group => group.id === destination))) return;
    selectedStudents.forEach(person => onMove(person.id, destination === "unassigned" ? "" : destination, "studentIds"));
    setNotice(`${selectedStudents.length}명의 배치를 변경했습니다. 초안을 저장하면 반영됩니다.`);
    setSelected(new Set());
  };
  const students = people.filter((p) => p.kind === "STUDENT" && p.active);
  const staff = people.filter((p) => p.kind === "STAFF" && p.active);
  const move = (
    id: string,
    groupId: string,
    kind: "studentIds" | "staffIds",
  ) => {
    if (!canEdit) return;
    onMove(id, groupId, kind);
    setMoving(null);
    setNotice(
      `${people.find((p) => p.id === id)?.name ?? "팀원"} · ${groups.find((g) => g.id === groupId)?.name ?? "미배정"}으로 이동했습니다. 저장하면 반영됩니다.`,
    );
  };
  const card = (person: PraisePerson, groupId: string) => (
    <article
      key={person.id}
      className={`praise-group-student ${moving === person.id ? "is-moving" : ""}`}
      draggable={canEdit}
      onDragStart={(event) => {
        setMoving(person.id);
        event.dataTransfer.setData("text/plain", person.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setMoving(null)}
    >
      {canEdit ? <label className={styles.selectPerson}><input type="checkbox" aria-label={`${person.name} 함께 이동 선택`} checked={selected.has(person.id)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(person.id); else next.delete(person.id); return next; })} /><strong>{person.name}</strong></label> : <strong>{person.name}</strong>}
      <span>
        {person.grade}학년 ·{" "}
        {person.gender === "FEMALE"
          ? "여"
          : person.gender === "MALE"
            ? "남"
            : "성별 미입력"}{" "}
        · {person.team === "SINGER" ? "싱어" : "세션"} ·{" "}
        {person.department === "FIRST" ? "1부" : "2부"}
      </span>
      {canEdit && (
        <label className="praise-group-move">
          <span className="sr-only">{person.name} 카드에서 조 이동</span>
          <select
            value={groupId}
            onChange={(e) => move(person.id, e.target.value, "studentIds")}
          >
            <option value="">미배정</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
  const unassigned = students.filter(
    (p) => !groups.some((g) => g.studentIds.includes(p.id)),
  );
  return (
    <>
      <div className={styles.tools}>
        <label className={styles.search}>학생 찾기<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름으로 전체 조 검색" /></label>
        <label className={styles.mobileChoice}>볼 조<select value={mobileGroup} onChange={event => setChosenGroup(event.target.value)}><option value="all">모든 조</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name} · {group.studentIds.length}명</option>)}<option value="unassigned">미배정 · {unassigned.length}명</option></select></label>
      </div>
      {canEdit && selectedStudents.length > 0 && <div className={styles.bulk} aria-label="선택 학생 함께 이동"><strong>{selectedStudents.length}명 선택</strong><label>이동할 조<select value={destination} onChange={event => setDestination(event.target.value)}><option value="">목적지 선택</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}<option value="unassigned">미배정</option></select></label><button type="button" className="praise-button praise-button--primary" disabled={!destination} onClick={bulkMove}>선택 학생 이동</button><button type="button" className="praise-button" onClick={() => setSelected(new Set())}>선택 해제</button></div>}
      {query && <p className="praise-note" role="status">전체 조에서 {students.filter(matches).length}명을 찾았습니다.</p>}
      <div
        className={`praise-group-board ${styles.board}`}
        role="region"
        aria-label="조별 편성 카드"
        tabIndex={0}
      >
        {groups.map((group) => {
          const members = students.filter((p) =>
            group.studentIds.includes(p.id),
          );
          const count = (test: (person: PraisePerson) => boolean) =>
            members.filter(test).length;
          if (query.trim() && !members.some(matches)) return null;
          return (
            <section
              key={group.id}
              className={`praise-group-column ${!query.trim() && mobileGroup !== "all" && mobileGroup !== group.id ? styles.mobileHidden : ""}`}
              onDragOver={(e) => {
                if (canEdit && moving) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (moving && students.some((p) => p.id === moving))
                  move(moving, group.id, "studentIds");
              }}
            >
              <header>
                {canEdit ? (
                  <label>
                    <span className="sr-only">{group.name} 이름</span>
                    <input
                      value={group.name}
                      maxLength={60}
                      onChange={(e) => onRename(group.id, e.target.value)}
                    />
                  </label>
                ) : (
                  <h3>{group.name}</h3>
                )}
                <span>
                  {members.length}/{maximum}명
                </span>
              </header>
              <dl className="praise-group-distribution">
                <div>
                  <dt>학년</dt>
                  <dd>
                    {[1, 2, 3]
                      .map((n) => `${n}학년 ${count((p) => p.grade === n)}`)
                      .join(" · ")}
                  </dd>
                </div>
                <div>
                  <dt>성비</dt>
                  <dd>
                    여 {count((p) => p.gender === "FEMALE")} · 남{" "}
                    {count((p) => p.gender === "MALE")}
                    {count((p) => p.gender === "UNSPECIFIED") > 0 &&
                      ` · 미입력 ${count((p) => p.gender === "UNSPECIFIED")}`}
                  </dd>
                </div>
                <div>
                  <dt>파트</dt>
                  <dd>
                    싱어 {count((p) => p.team === "SINGER")} · 세션{" "}
                    {count((p) => p.team === "SESSION")}
                  </dd>
                </div>
                <div>
                  <dt>예배</dt>
                  <dd>
                    1부 {count((p) => p.department === "FIRST")} · 2부{" "}
                    {count((p) => p.department === "SECOND")}
                  </dd>
                </div>
              </dl>
              <div className="praise-group-staff">
                <div className="praise-group-staff-heading">
                  <strong>담당 스탭</strong>
                  <span>{group.staffIds.length}명 배정</span>
                </div>
                {canEdit && (
                  <label>
                    <span className="sr-only">{group.name} 담당 스탭 선택</span>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          move(e.target.value, group.id, "staffIds");
                      }}
                    >
                      <option value="">스탭 추가하기</option>
                      {staff
                        .filter((p) => !group.staffIds.includes(p.id))
                        .map((p) => {
                          const assigned = groups.find((g) =>
                            g.staffIds.includes(p.id),
                          );
                          return (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {assigned ? ` · ${assigned.name}에서 이동` : ""}
                            </option>
                          );
                        })}
                    </select>
                  </label>
                )}
                <div className="praise-staff-chips">
                  {group.staffIds.map((id) => (
                    <span key={id}>
                      {people.find((p) => p.id === id)?.name ?? "보관된 스탭"}
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={`${people.find((p) => p.id === id)?.name ?? "스탭"} 배정 해제`}
                          onClick={() => move(id, "", "staffIds")}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <div className="praise-group-students">
                {members.filter(matches).map((p) => card(p, group.id))}
              </div>
            </section>
          );
        })}
        {unassigned.length > 0 && (
          <section className={`praise-group-column ${!query.trim() && mobileGroup !== "all" && mobileGroup !== "unassigned" ? styles.mobileHidden : ""}`}>
            <header>
              <h3>미배정</h3>
              <span>{unassigned.length}명</span>
            </header>
            {unassigned.filter(matches).map((p) => card(p, ""))}
          </section>
        )}
      </div>
      <p role="status" className="praise-note">
        {notice}
      </p>
    </>
  );
}
