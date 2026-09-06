"use client";

import { useState } from "react";
import type { PraiseView } from "../types";
import { authorName, stampTime } from "./shared";

/** 서버가 권한에 맞게 반환한 최근 기록만 표시한다. 원시 출결을 추가 조회하지 않는다. */
export function PraiseAuditList({ view, attendanceOnly = false }: { view: PraiseView; attendanceOnly?: boolean }) {
  const [query, setQuery] = useState("");
  const normalize = (value: string) => value.replaceAll(/\s/g, "").toLocaleLowerCase();
  const search = normalize(query);
  const events = view.audit.filter((event) => (!attendanceOnly || ["attendance.set", "availability.set"].includes(event.action))
    && (!search || normalize(`${event.label} ${event.actor.name ?? ""} ${stampTime(event.at)}`).includes(search)));
  const title = attendanceOnly ? "최근 출결 변경" : view.permissions.manage ? "최근 운영 활동" : "내 최근 활동";

  return <section className="praise-section" aria-label={title}>
    <details>
      <summary>{title}</summary>
      <p className="praise-note">{view.permissions.manage ? "조회 가능한 최근 활동 중" : "본인이 남긴 최근 활동 중"} 최대 100건에서 확인합니다. 이전 기록 전체를 뜻하지 않습니다.</p>
      <label className="praise-search"><span className="sr-only">활동 기록 검색</span><input type="search" placeholder="이름 · 날짜 · 작업 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {events.length === 0 ? <p className="praise-note">{query ? "검색 조건에 맞는 기록이 없습니다." : "조회된 변경 기록이 없습니다."}</p> : <ul className="praise-audit-list">{events.map((event) => <li key={event.id}>
        <div><strong>{event.label}</strong><span>{event.historical ? "외부 사이트 이관 기록" : event.actor.name || authorName(view, event.actor.uid)} · {stampTime(event.at)}</span></div>
        {event.historical && <p className="praise-note">원본 사이트에서 작성된 기록입니다. 이관 담당자가 과거에 직접 입력했다는 뜻은 아닙니다.</p>}
        {event.changes.length > 0 && <p className="praise-note">{event.changes.map((change) => `${change.field}${change.before !== undefined ? `: ${change.before}` : ""}${change.after !== undefined ? ` → ${change.after}` : ""}`).join(" · ")}</p>}
      </li>)}</ul>}
    </details>
  </section>;
}
