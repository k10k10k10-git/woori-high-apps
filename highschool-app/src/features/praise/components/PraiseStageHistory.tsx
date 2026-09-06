"use client";
import { useMemo, useState } from "react";
import type { PraiseView } from "../types";
import { praiseStudentStageHistory } from "../stageHistoryModel";
import styles from "./PraiseStageHistory.module.css";

type Props = { view: Pick<PraiseView, "people" | "stages"> };
export function PraiseStageHistory({ view }: Props) {
  const [visited, setVisited] = useState(false);
  return <details className="praise-disclosure" onToggle={(event) => { if (event.currentTarget.open) setVisited(true); }}>
    <summary>학생별 과거 등단 기록</summary>
    {visited && <StudentHistoryTable view={view} />}
  </details>;
}

function StudentHistoryTable({ view }: Props) {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const invalidRange = Boolean(from && to && from > to);
  const history = useMemo(() => praiseStudentStageHistory(view.people, view.stages, { from, to }), [view.people, view.stages, from, to]);
  const normalizedQuery = query.replaceAll(/\s/g, "").toLocaleLowerCase("ko");
  const rows = history.rows.filter((row) => row.searchNames.some((name) => name.replaceAll(/\s/g, "").toLocaleLowerCase("ko").includes(normalizedQuery)));
  const hasConfirmed = view.stages.some((version) => version.kind === "CONFIRMED");
  const pageCount = Math.max(1, Math.ceil(history.versions.length / 8));
  const currentPage = Math.min(page, pageCount - 1);
  const offset = currentPage * 8;
  const visibleVersions = history.versions.slice(offset, offset + 8);
  return <div className={styles.body}>
    <p className="praise-note">조회 가능한 확정표에서 예배일별 최신 확정본 한 개만 보여줍니다. 같은 주일 1·2부 등단은 1회로 셉니다.</p>
    <div className={styles.filters}>
      <label className="praise-field"><span>등단 이력 학생 검색</span><input type="search" placeholder="당시 이름 · 현재 이름 검색" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
      <label className="praise-field"><span>등단 이력 시작일</span><input type="date" min="2000-01-01" max={to || "2100-12-31"} value={from} aria-invalid={invalidRange} onChange={(event) => { setFrom(event.target.value); setPage(0); }} /></label>
      <label className="praise-field"><span>등단 이력 종료일</span><input type="date" min={from || "2000-01-01"} max="2100-12-31" value={to} aria-invalid={invalidRange} onChange={(event) => { setTo(event.target.value); setPage(0); }} /></label>
      {(query || from || to) && <button type="button" className="praise-button" onClick={() => { setQuery(""); setFrom(""); setTo(""); setPage(0); }}>검색·기간 초기화</button>}
    </div>
    {invalidRange ? <p className="praise-error" role="alert">시작일이 종료일보다 늦습니다. 날짜 범위를 확인해 주세요.</p> : !hasConfirmed ? <p className="praise-empty">확정된 등단 이력이 아직 없습니다.</p> : history.versions.length === 0 ? <p className="praise-empty">선택한 기간에 확정된 등단표가 없습니다.</p> : rows.length === 0 ? <p className="praise-empty">{query ? "검색한 학생의 등단 이력이 없습니다." : "확정표에서 확인할 학생이 없습니다."}</p> : <>
      <p className={styles.count} role="status">학생 {rows.length}명 · 확정 예배 {history.versions.length}회</p>
      {pageCount > 1 && <nav className="praise-toolbar" aria-label="등단 이력 날짜 페이지"><button type="button" className="praise-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>최근 기록</button><span className="praise-note" role="status">{currentPage + 1} / {pageCount}페이지 · 예배일 8개씩 표시</span><button type="button" className="praise-button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>이전 기록</button></nav>}
      <div className={styles.scroll} role="region" aria-label="학생별 등단 이력표" tabIndex={0}>
        <table className={styles.table}>
          <caption className="sr-only">학생별 최신 확정 등단 기록. 날짜는 최근 예배일부터 표시합니다.</caption>
          <thead><tr><th scope="col">학생</th><th scope="col">기간 등단</th>{visibleVersions.map((version) => <th scope="col" key={version.worshipDate}><time dateTime={version.worshipDate}>{version.worshipDate}</time><small>{version.number}차 확정{version.imported ? " · 이관본" : ""}</small></th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <th scope="row"><strong>{row.name}</strong>{row.currentName && row.currentName !== row.name && <small>현재 이름: {row.currentName}</small>}{row.active === false ? <small>현재 비활성</small> : row.active === null ? <small>현재 명단에 없음</small> : null}</th>
            <td className={styles.total}>{row.stagedCount}회</td>
            {row.records.slice(offset, offset + 8).map((record, index) => <td key={visibleVersions[index].worshipDate}><span className={record.staged ? styles.staged : styles.record}>{record.label}</span>{record.storedNames.length > 0 && <small>저장된 이름: {record.storedNames.join(" · ")}</small>}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </>}
    <p className="praise-note">‘반에서 예배하기’는 확정본에 남은 후보·제외 기록으로 구분합니다. ‘기록 없음’은 결석을 뜻하지 않으며, 조회 권한에 따라 후보 정보가 제공되지 않을 수 있습니다. 비활성 학생과 현재 명단에 없는 과거 학생도 저장된 등단표에 있으면 표시합니다.</p>
    {history.versions.some((version) => version.imported) && <p className="praise-note">이관본의 이름은 원본을 내보낸 시점의 명단 기준입니다. 실제 예배 당시 이름을 확인한 기록은 아닙니다.</p>}
  </div>;
}
