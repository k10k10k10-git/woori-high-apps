"use client";

import { useState } from "react";
import type { Participant } from "@/lib/types";
import { clampPage, pageCount, pageSlice } from "@/lib/pagination";

export type ParticipantListItem = Participant & { key: string };

type Props = {
  list: ParticipantListItem[];
  mismatchKeys: Set<string>;
  ambiguousKeys: Set<string>;
};

export default function RetreatParticipantMobileList({ list, mismatchKeys, ambiguousKeys }: Props) {
  const pageSize = 40;
  const [pickedPage, setPickedPage] = useState(1);
  const currentPage = clampPage(pickedPage, list.length, pageSize);
  const totalPages = pageCount(list.length, pageSize);
  const visibleList = pageSlice(list, currentPage, pageSize);
  const offset = (currentPage - 1) * pageSize;

  return (
    <div className="retreat-roster-mobile" aria-label="참가자 핵심 명단">
      <div className="retreat-roster-mobile__pager" aria-label="참가자 명단 페이지">
        <p><strong>{list.length}명</strong> 중 {list.length === 0 ? 0 : offset + 1}-{Math.min(offset + pageSize, list.length)}명</p>
        <div>
          <button type="button" className="pagination-control" onClick={() => setPickedPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="이전 명단 페이지">이전</button>
          <label>
            <span className="sr-only">명단 페이지 선택</span>
            <select value={currentPage} onChange={(event) => setPickedPage(Number(event.target.value))}>
              {Array.from({ length: totalPages }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} / {totalPages}</option>)}
            </select>
          </label>
          <button type="button" className="pagination-control" onClick={() => setPickedPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="다음 명단 페이지">다음</button>
        </div>
      </div>
      {visibleList.map((participant, index) => {
        const hasMismatch = mismatchKeys.has(participant.key);
        const isAmbiguous = ambiguousKeys.has(participant.key);
        return (
          <article key={participant.key} className="retreat-roster-mobile__card retreat-participant-mobile-card">
            <div className="retreat-roster-mobile__heading">
              <span className="retreat-roster-mobile__number">{offset + index + 1}</span>
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
