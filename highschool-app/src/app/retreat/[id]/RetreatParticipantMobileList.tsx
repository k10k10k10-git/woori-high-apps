import type { Participant } from "@/lib/types";

export type ParticipantListItem = Participant & { key: string };

type Props = {
  list: ParticipantListItem[];
  mismatchKeys: Set<string>;
  ambiguousKeys: Set<string>;
};

export default function RetreatParticipantMobileList({ list, mismatchKeys, ambiguousKeys }: Props) {
  return (
    <div className="retreat-roster-mobile" aria-label="참가자 핵심 명단">
      {list.map((participant, index) => {
        const hasMismatch = mismatchKeys.has(participant.key);
        const isAmbiguous = ambiguousKeys.has(participant.key);
        return (
          <article key={participant.key} className="retreat-roster-mobile__card">
            <div className="retreat-roster-mobile__heading">
              <span className="retreat-roster-mobile__number">{index + 1}</span>
              <div className="min-w-0">
                <strong>{participant.name}</strong>
                <p>{participant.bu || "부서 미입력"} · {participant.grade > 0 ? `${participant.grade}학년 ${participant.class > 0 ? `${participant.class}반` : ""}` : "학년 미입력"}</p>
              </div>
              <span className={`tag ${participant.gender === "여" ? "tag-red" : "tag-blue"}`}>{participant.gender || "미입력"}</span>
            </div>
            <dl>
              <div><dt>접수</dt><dd>{participant.registeredAt || "미입력"}</dd></div>
              <div><dt>상태</dt><dd>{hasMismatch ? "정보 불일치" : isAmbiguous ? "매칭 검토" : "확인 완료"}</dd></div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
