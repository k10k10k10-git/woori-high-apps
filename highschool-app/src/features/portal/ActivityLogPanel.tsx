"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowClockwise, CaretDown, ClockCounterClockwise, MagnifyingGlass, WarningCircle, X } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { loadActivityLogPage, subscribeActivityLogStatus } from "@/features/activityLog/db";
import { activityRangeBounds, defaultActivityLogRange } from "@/features/activityLog/model";
import { presentActivityLog, type ActivityChangePresentation } from "@/features/activityLog/presentation";
import {
  ACTIVITY_AREAS,
  type ActivityAction,
  type ActivityArea,
  type ActivityLogCursor,
  type ActivityLogRange,
  type ActivityLogRecord,
  type ActivityLogStatus,
} from "@/features/activityLog/types";
import { canViewActivityLogs } from "./accessPolicy";

const ACTION_LABELS: Record<ActivityAction, string> = { create: "추가", update: "저장", delete: "삭제" };
const DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

function formatDate(timestamp: number): string {
  return Number.isFinite(timestamp) && timestamp > 0 ? DATE_FORMAT.format(timestamp) : "시각 미확인";
}

function actorLabel(record: ActivityLogRecord): string {
  if (record.actor.kind === "system") return "시스템";
  if (record.actor.kind === "unknown") return "주체 미확인";
  return record.actor.name?.trim() || "이름 미확인 계정";
}

export default function ActivityLogPanel() {
  const { user, roles } = useAuth();
  if (!user || !canViewActivityLogs(roles)) return <div role="alert" className="activity-log-empty"><strong>활동 로그 조회 권한이 없습니다.</strong><p>통합관리자 계정에서 확인할 수 있습니다.</p></div>;
  return <ActivityLogWorkspace key={`${user.uid}:${roles.semester}:${roles.retreat}`} />;
}

function ActivityLogWorkspace() {
  const [initialRange] = useState(defaultActivityLogRange);
  const [draftRange, setDraftRange] = useState(initialRange);
  const [range, setRange] = useState(initialRange);
  const [revision, setRevision] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const id = useId();

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      activityRangeBounds(draftRange);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "조회 기간을 다시 확인해 주세요.");
      return;
    }
    setValidationError(null);
    setRange({ ...draftRange });
    setRevision(value => value + 1);
  }

  return <div className="activity-log-panel">
    <header className="activity-log-header">
      <div><h3>활동 로그</h3><p>누가 어떤 업무와 항목을 저장했는지 한국어로 확인합니다. 민감한 원문은 기록하지 않습니다.</p></div>
      <button type="button" className="activity-log-refresh" onClick={() => setRevision(value => value + 1)}><ArrowClockwise size={16} aria-hidden="true" />새로고침</button>
    </header>
    <form className="activity-log-range" onSubmit={applyRange}>
      <div className="activity-log-date-fields">
        <label htmlFor={`${id}-from`}>시작일<input id={`${id}-from`} type="date" value={draftRange.from} onChange={event => { setDraftRange(current => ({ ...current, from: event.target.value })); setValidationError(null); }} aria-describedby={`${id}-range-help`} /></label>
        <label htmlFor={`${id}-to`}>종료일<input id={`${id}-to`} type="date" value={draftRange.to} onChange={event => { setDraftRange(current => ({ ...current, to: event.target.value })); setValidationError(null); }} aria-describedby={`${id}-range-help`} /></label>
      </div>
      <button type="submit" className="activity-log-apply">기간 조회</button>
      <p id={`${id}-range-help`}>한국 시간 기준 · 최대 31일</p>
      {validationError && <p role="alert" className="activity-log-validation">{validationError}</p>}
    </form>
    <ActivityLogResults key={`${range.from}:${range.to}:${revision}`} range={range} onRetry={() => setRevision(value => value + 1)} />
  </div>;
}

type PageState = { records: ActivityLogRecord[]; cursor: ActivityLogCursor | null; loading: boolean; error: string | null };

function ActivityLogResults({ range, onRetry }: { range: ActivityLogRange; onRetry: () => void }) {
  const [page, setPage] = useState<PageState>({ records: [], cursor: null, loading: true, error: null });
  const [status, setStatus] = useState<ActivityLogStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<ActivityArea | "all">("all");
  const [action, setAction] = useState<ActivityAction | "all">("all");
  const active = useRef(false);
  const blocked = useRef(false);
  const requestSequence = useRef(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const id = useId();

  useEffect(() => {
    active.current = true;
    blocked.current = false;
    busy.current = true;
    const lifecycle = ++generation.current;
    const isCurrent = () => active.current && lifecycle === generation.current;
    const request = ++requestSequence.current;
    const fail = (error: unknown) => {
      if (!isCurrent()) return;
      blocked.current = true;
      requestSequence.current += 1;
      busy.current = false;
      setStatus(null);
      setPage({ records: [], cursor: null, loading: false, error: error instanceof Error ? error.message : "활동 로그를 불러오지 못했습니다." });
    };
    const unsubscribe = subscribeActivityLogStatus(next => {
      if (!isCurrent() || blocked.current) return;
      setStatus(next);
      setStatusLoaded(true);
    }, fail);
    void loadActivityLogPage(range).then(next => {
      if (!isCurrent() || blocked.current || request !== requestSequence.current) return;
      busy.current = false;
      setPage({ records: uniqueRecords(next.records), cursor: next.nextCursor, loading: false, error: null });
    }).catch(error => {
      if (request === requestSequence.current) fail(error);
    });
    return () => {
      active.current = false;
      generation.current += 1;
      requestSequence.current += 1;
      unsubscribe();
    };
  }, [range]);

  async function loadMore() {
    if (busy.current || blocked.current || !page.cursor) return;
    busy.current = true;
    const request = ++requestSequence.current;
    setPage(current => ({ ...current, loading: true }));
    try {
      const next = await loadActivityLogPage(range, page.cursor);
      if (!active.current || blocked.current || request !== requestSequence.current) return;
      setPage(current => ({ records: uniqueRecords([...current.records, ...next.records]), cursor: next.nextCursor, loading: false, error: null }));
    } catch (error) {
      if (!active.current || request !== requestSequence.current) return;
      blocked.current = true;
      setPage({ records: [], cursor: null, loading: false, error: error instanceof Error ? error.message : "이전 기록을 불러오지 못했습니다." });
    } finally {
      if (request === requestSequence.current) busy.current = false;
    }
  }

  const filtered = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase("ko").split(/\s+/).filter(Boolean);
    return page.records.filter(record => {
      if (area !== "all" && record.area !== area || action !== "all" && record.action !== action) return false;
      const text = [actorLabel(record), presentActivityLog(record).searchText].join(" ").toLocaleLowerCase("ko");
      return tokens.every(token => text.includes(token));
    });
  }, [action, area, page.records, query]);
  const hasFilters = Boolean(query.trim() || area !== "all" || action !== "all");
  function resetFilters() { setQuery(""); setArea("all"); setAction("all"); }

  if (page.error) return <div role="alert" className="activity-log-error"><WarningCircle size={22} aria-hidden="true" /><div><strong>활동 로그를 확인하지 못했습니다.</strong><p>{page.error}</p></div><button type="button" onClick={onRetry}>다시 불러오기</button></div>;

  return <div className="activity-log-results">
    <div className="activity-log-collection">
      <span>{!statusLoaded ? "기록 범위 확인 중…" : status?.startedAt ? `첫 변경 기록 ${formatDate(status.startedAt)}` : "저장된 활동 기록이 아직 없습니다."}</span>
      {status?.lastRecordedAt ? <span>마지막 저장 {formatDate(status.lastRecordedAt)}</span> : null}
    </div>
    <p className="activity-log-provenance">저장 요청에 사용된 인증 계정입니다. 사람이 직접 조작했는지는 확인할 수 없습니다.<br />구버전 화면·직접 DB 수정은 포함되지 않을 수 있습니다.</p>
    <div className="activity-log-filters">
      <div className="activity-log-search">
        <label className="sr-only" htmlFor={`${id}-query`}>활동 로그 검색</label>
        <MagnifyingGlass size={17} aria-hidden="true" />
        <input id={`${id}-query`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름, 업무, 변경 항목 검색" autoComplete="off" aria-describedby={`${id}-result-count`} />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="활동 로그 검색 초기화"><X size={15} aria-hidden="true" /></button>}
      </div>
      <label className="activity-log-select"><span className="sr-only">활동 영역</span><select value={area} onChange={event => setArea(event.target.value as ActivityArea | "all")}><option value="all">모든 영역</option>{Object.entries(ACTIVITY_AREAS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="activity-log-select"><span className="sr-only">활동 동작</span><select value={action} onChange={event => setAction(event.target.value as ActivityAction | "all")}><option value="all">모든 동작</option>{Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="activity-log-result-line">
      <p id={`${id}-result-count`} role="status" aria-live="polite">{page.loading && page.records.length === 0 ? "활동 로그를 불러오는 중…" : `조회된 ${page.records.length.toLocaleString("ko-KR")}건에서 검색 · ${filtered.length.toLocaleString("ko-KR")}건 표시`}</p>
      {hasFilters && <button type="button" onClick={resetFilters}>필터 초기화</button>}
    </div>
    {page.loading && page.records.length === 0 ? <div className="activity-log-empty" aria-hidden="true"><ClockCounterClockwise size={25} /><p>변경 이력을 확인하고 있습니다.</p></div> : filtered.length === 0 ? <div className="activity-log-empty"><ClockCounterClockwise size={25} aria-hidden="true" /><strong>{page.records.length === 0 ? "조회 기간에 기록된 활동이 없습니다." : "검색 조건에 맞는 활동이 없습니다."}</strong><p>{page.records.length === 0 ? "기능 적용 전의 활동은 포함되지 않습니다. 다른 기간을 조회해 보세요." : page.cursor ? "필터를 바꾸거나 이전 기록을 더 불러와 확인해 보세요." : "검색어나 활동 필터를 바꿔 보세요."}</p>{hasFilters && <button type="button" onClick={resetFilters}>전체 조회 목록 보기</button>}</div> : <ol className="activity-log-list" aria-label="활동 기록 목록">{filtered.map(record => <ActivityLogRow key={record.id} record={record} />)}</ol>}
    {page.cursor && <div className="activity-log-pagination"><p>현재 조회 기간의 이전 기록을 100건씩 불러옵니다.</p><button type="button" onClick={() => void loadMore()} disabled={page.loading}>{page.loading ? "이전 기록 불러오는 중…" : "이전 기록 더 불러오기"}</button></div>}
  </div>;
}

function uniqueRecords(records: ActivityLogRecord[]): ActivityLogRecord[] {
  const unique = new Map<string, ActivityLogRecord>();
  for (const record of records) if (!unique.has(record.id)) unique.set(record.id, record);
  return [...unique.values()];
}

function ActivityLogRow({ record }: { record: ActivityLogRecord }) {
  const presentation = presentActivityLog(record);
  return <li className="activity-log-item"><details>
    <summary className="activity-log-row">
      <time dateTime={new Date(record.occurredAt).toISOString()}>{formatDate(record.occurredAt)}</time>
      <span className="activity-log-subject"><strong>{presentation.targetLabel}</strong><span>{presentation.areaLabel}{presentation.contextLabel ? ` · ${presentation.contextLabel}` : ""}</span><span className="activity-log-change-summary">{presentation.summary}</span></span>
      <span className="activity-log-actor"><strong>{actorLabel(record)}</strong><span>{record.actor.kind === "user" ? "인증 계정" : record.actor.kind === "system" ? "시스템 작업" : "인증 정보 없음"}</span></span>
      <span className={`activity-log-action is-${record.action}`}>{ACTION_LABELS[record.action]}</span>
      <CaretDown size={15} aria-hidden="true" /><span className="sr-only">상세 보기</span>
    </summary>
    <div className="activity-log-detail">
      <dl className="activity-log-metadata"><div><dt>기록 시각</dt><dd>{formatDate(record.recordedAt)}</dd></div><div><dt>작업 계정</dt><dd>{actorLabel(record)}</dd></div><div><dt>업무 영역</dt><dd>{presentation.areaLabel}</dd></div><div><dt>변경 대상</dt><dd>{presentation.targetLabel}{presentation.contextLabel ? ` · ${presentation.contextLabel}` : ""}</dd></div></dl>
      <h4>기록된 내용 <span>{presentation.countLabel}</span></h4>
      {presentation.changes.length === 0 ? <p className="activity-log-detail-empty">항목별 내용은 기록되지 않았습니다.</p> : <div className="activity-log-changes">{presentation.changes.map((change, index) => <ChangeRow key={`${change.title}:${index}`} change={change} />)}</div>}
      {record.changedCount > record.changes.length && <p className="activity-log-detail-empty">전체 저장 내용 중 일부만 요약해 표시합니다.</p>}
    </div>
  </details></li>;
}

function ChangeRow({ change }: { change: ActivityChangePresentation }) {
  const displayValue = (value: string | null | undefined) => value === undefined ? "기록하지 않음" : value === null ? "값 없음" : value === "" ? "빈 값" : value;
  return <div className="activity-log-change"><strong>{change.title}</strong>{change.redacted ? <div className="activity-log-redacted">{change.fields.length > 0 && <p className="activity-log-change-fields">{change.fields.join(" · ")}</p>}<p>{change.description}</p></div> : <div className="activity-log-values"><div><span>변경 전</span><p>{displayValue(change.before)}</p></div><div><span>{change.before === undefined ? "저장값" : "변경 후"}</span><p>{displayValue(change.after)}</p></div></div>}</div>;
}
