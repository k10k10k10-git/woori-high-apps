"use client";
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
      <strong>{person.name}</strong>
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
      {canEdit && (
        <p className="praise-note">
          학생 카드를 다른 조로 끌어 놓거나 카드의 조 선택을 이용하세요. 담당
          스탭은 각 조에서 추가·해제합니다.
        </p>
      )}
      <div
        className="praise-group-board"
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
          return (
            <section
              key={group.id}
              className="praise-group-column"
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
                {members.map((p) => card(p, group.id))}
              </div>
            </section>
          );
        })}
        {unassigned.length > 0 && (
          <section className="praise-group-column">
            <header>
              <h3>미배정</h3>
              <span>{unassigned.length}명</span>
            </header>
            {unassigned.map((p) => card(p, ""))}
          </section>
        )}
      </div>
      <p role="status" className="praise-note">
        {notice}
      </p>
    </>
  );
}
