"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import OverlayShell from "@/components/OverlayShell";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { loadXlsx } from "@/lib/exportUtils";
import { downloadFinanceReceipt, FinanceApiError, mutateFinance, readFinance, readFinanceHistory } from "./client";
import { financeSummary, MAX_FINANCE_AMOUNT, MAX_RECEIPT_BYTES } from "./model";
import type { FinanceCommand, FinanceEntry, FinanceEntryInput, FinanceHistoryItem, FinanceReceipt, FinanceView } from "./types";
import styles from "./finance.module.css";

type Props = { year: number; canEdit?: boolean; onBusyChange?: (busy: boolean) => void };
type CommandInput = FinanceCommand extends infer Command ? Command extends FinanceCommand ? Omit<Command, "operationId"> : never : never;
type Draft = Omit<FinanceEntryInput, "amount"> & { amount: string };
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const time = (value: string) => Number.isNaN(new Date(value).getTime()) ? "시각 미기록" : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
const errorText = (error: unknown) => error instanceof Error ? error.message : "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
const typeLabel = (value: string) => value === "income" ? "수입" : "지출";
const settlementLabel = (value: string) => value === "settled" ? "정산 완료" : "정산 대기";
const missingEvidence = (entry: FinanceEntry) => entry.type === "expense" && !entry.receipts.length && !entry.receiptExemptReason;
const ENTRY_FIELDS = ["date", "type", "category", "description", "amount", "owner", "ministry", "settlement", "receiptExemptReason"] as const;
const fieldLabels: Record<(typeof ENTRY_FIELDS)[number], string> = { date: "거래일", type: "구분", category: "분류", description: "내용", amount: "금액", owner: "담당자", ministry: "관련 사역", settlement: "정산", receiptExemptReason: "증빙 제외 사유" };

function blankDraft(year: number, owner: string): Draft {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  return { date: today.startsWith(`${year}-`) ? today : `${year}-01-01`, type: "expense", category: "", description: "", amount: "", owner, ministry: "", settlement: "pending", receiptExemptReason: "" };
}

export default function AnnualFinanceTab(props: Props) {
  const { user } = useAuth();
  if (!user) return <p className={styles.state}>로그인 후 회계 기록을 확인할 수 있습니다.</p>;
  return <FinanceWorkspace key={`${user.uid}:${props.year}`} {...props} />;
}

function FinanceWorkspace({ year, canEdit = true, onBusyChange }: Props) {
  const { user, memberName } = useAuth();
  const { toast, uiConfirm } = useUI();
  const [view, setView] = useState<FinanceView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<{ entryId?: string; revision: number; initial: Draft; draft: Draft } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  const unresolved = useRef(false);
  const busyCallback = useRef(onBusyChange);
  const operation = useRef<{ fingerprint: string; id: string; command: CommandInput } | null>(null);
  busyCallback.current = onBusyChange;
  const locked = busy || uncertain;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; busyCallback.current?.(false); };
  }, []);
  useEffect(() => {
    if (!locked) return;
    const lockedHref = window.location.href;
    const lockedState = window.history.state;
    const lockedUrl = new URL(lockedHref);
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const explain = () => toast("저장 결과를 확인한 뒤 화면을 이동할 수 있습니다.", "warning");
    const blockLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, lockedHref);
      const hashOnly = anchor.getAttribute("href")?.startsWith("#") || (destination.pathname === lockedUrl.pathname && destination.search === lockedUrl.search && destination.hash !== lockedUrl.hash);
      if (destination.origin !== lockedUrl.origin || hashOnly) return;
      event.preventDefault(); event.stopPropagation(); explain();
    };
    const restoreLocation = (event: PopStateEvent) => {
      if (window.location.pathname === lockedUrl.pathname && window.location.search === lockedUrl.search) return;
      event.stopImmediatePropagation();
      window.history.pushState(lockedState, "", lockedHref);
      explain();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", blockLink, true);
    window.addEventListener("popstate", restoreLocation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", blockLink, true);
      window.removeEventListener("popstate", restoreLocation, true);
    };
  }, [locked, toast]);
  useEffect(() => {
    const controller = new AbortController();
    readFinance(year, controller.signal).then((next) => {
      if (!controller.signal.aborted && alive.current) { setView(next); setLoadError(""); setLoading(false); }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && alive.current) { setLoadError(errorText(error)); setLoading(false); }
    });
    return () => controller.abort();
  }, [year, retry]);

  function changeBusy(value: boolean) { pending.current = value; if (alive.current) { setBusy(value); busyCallback.current?.(value || unresolved.current); } }
  function changeUncertain(value: boolean) { unresolved.current = value; if (alive.current) { setUncertain(value); busyCallback.current?.(value || pending.current); } }
  function refresh() { if (pending.current || unresolved.current) return; setLoading(true); setLoadError(""); setActionError(""); setRetry((value) => value + 1); }
  async function execute(command: CommandInput): Promise<boolean> {
    if (pending.current || !view?.canEdit || !canEdit) return false;
    const recovering = unresolved.current;
    const fingerprint = JSON.stringify(command);
    if (operation.current && operation.current.fingerprint !== fingerprint) { setActionError("이전 요청의 저장 결과가 확인되지 않았습니다. ‘저장 결과 확인’ 후 새 내용을 저장해 주세요."); return false; }
    if (!operation.current) operation.current = { fingerprint, id: crypto.randomUUID(), command };
    changeBusy(true); setActionError("");
    try {
      const next = await mutateFinance(year, { ...command, operationId: operation.current.id } as FinanceCommand);
      if (!alive.current) return false;
      setView(next); operation.current = null; changeUncertain(false); toast("회계 기록을 저장했습니다.", "success"); return true;
    } catch (error) {
      // 응답을 잃은 저장은 같은 작업 번호로 확인한다. 명시적 거절은 새 수정이 가능하다.
      const rejected = error instanceof FinanceApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429
        && (!recovering || (error.status === 409 && ["revision_conflict", "operation_conflict"].includes(error.code ?? "")));
      if (rejected) operation.current = null;
      changeUncertain(!rejected);
      if (alive.current) setActionError(errorText(error));
      return false;
    } finally { changeBusy(false); }
  }
  async function recoverOperation() {
    const saved = operation.current;
    if (saved && await execute(saved.command) && alive.current) { setEditor(null); setOpening(null); setCancelling(false); }
  }
  const actionFailure = actionError ? <div className={styles.error} role="alert"><p>{actionError}</p>{uncertain && <p>저장 결과가 확인될 때까지 입력과 화면 이동이 잠깁니다. 아래에서 결과를 확인해 주세요.</p>}{operation.current && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void recoverOperation()}>저장 결과 확인</button>}</div> : null;

  const entries = useMemo(() => view?.entries ?? [], [view]);
  const summary = financeSummary(entries, view?.openingBalance ?? 0);
  const editable = canEdit && Boolean(view?.canEdit);
  const categories = useMemo(() => [...new Set(entries.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b, "ko")), [entries]);
  const filtered = entries.filter((entry) => {
    if (status === "cancelled" ? !entry.cancelledAt : entry.cancelledAt) return false;
    return (!month || entry.date.slice(5, 7) === month) && (!type || entry.type === type) && (!category || entry.category === category)
      && (!status || status === "cancelled" || (status === "missing" ? missingEvidence(entry) : entry.settlement === status))
      && (!query.trim() || `${entry.description} ${entry.owner} ${entry.ministry} ${entry.category}`.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko")));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 40));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * 40, currentPage * 40 + 40);
  const selected = entries.find((entry) => entry.id === detailId);

  function edit(entry?: FinanceEntry) {
    const draft = entry ? { ...Object.fromEntries(ENTRY_FIELDS.map((field) => [field, entry[field]])), amount: String(entry.amount) } as Draft : blankDraft(year, memberName || user?.displayName || "");
    setEditor({ entryId: entry?.id, revision: entry?.revision ?? 0, initial: draft, draft }); setDetailId(null); setActionError("");
  }
  async function closeEditor() {
    if (pending.current || unresolved.current) return;
    if (editor && JSON.stringify(editor.initial) !== JSON.stringify(editor.draft) && !await uiConfirm("입력 중인 거래를 저장하지 않고 닫을까요?")) return;
    if (alive.current) setEditor(null);
  }
  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editor) return;
    const amount = Number(editor.draft.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_FINANCE_AMOUNT) { setActionError("금액은 1원 이상, 1조 원 이하의 원 단위 정수로 입력해 주세요."); return; }
    const saved = await execute({ kind: "entry.save", ...(editor.entryId ? { entryId: editor.entryId } : {}), expectedRevision: editor.revision, entry: { ...editor.draft, amount } });
    if (saved && alive.current) setEditor(null);
  }
  async function saveOpening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!view || opening === null) return;
    const amount = Number(opening);
    if (!Number.isSafeInteger(amount) || Math.abs(amount) > MAX_FINANCE_AMOUNT || !opening.trim()) { setActionError("이월금은 ±1조 원 이내의 원 단위 정수로 입력해 주세요."); return; }
    if (await execute({ kind: "opening.save", expectedRevision: view.openingRevision, amount }) && alive.current) setOpening(null);
  }
  async function cancelEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !cancelReason.trim()) return;
    const target = selected;
    if (!await uiConfirm(`‘${target.description}’ ${won(target.amount)} 거래를 취소할까요? 원래 기록과 취소 사유는 보존됩니다.`) || !alive.current) return;
    if (await execute({ kind: "entry.cancel", entryId: target.id, expectedRevision: target.revision, reason: cancelReason.trim() }) && alive.current) { setCancelling(false); setCancelReason(""); }
  }
  async function addReceipt(entry: FinanceEntry, file: File) {
    if (pending.current || unresolved.current) return;
    changeBusy(true); setActionError("");
    let prepared: { name: string; mimeType: FinanceReceipt["mimeType"]; base64: string };
    try { prepared = await prepareReceipt(file); } catch (error) { if (alive.current) setActionError(errorText(error)); changeBusy(false); return; }
    changeBusy(false);
    if (alive.current) await execute({ kind: "receipt.add", entryId: entry.id, expectedRevision: entry.revision, file: prepared });
  }
  async function download(entry: FinanceEntry, receipt: FinanceReceipt) {
    if (pending.current || unresolved.current) return;
    changeBusy(true); setActionError("");
    try { await downloadFinanceReceipt(year, entry.id, receipt); } catch (error) { if (alive.current) setActionError(errorText(error)); } finally { changeBusy(false); }
  }
  async function exportEntries() {
    if (pending.current || unresolved.current || !view) return;
    changeBusy(true); setActionError("");
    try {
      const XLSX = await loadXlsx();
      if (!alive.current) return;
      const rows: (string | number)[][] = [[`${year}년 연간 회계`], ["전년도 이월금", view.openingBalance], ["연간 수입", summary.income], ["연간 지출", summary.expense], ["장부 잔액", summary.balance], [], ["현재 검색·필터에 해당하는 거래", filtered.length], ["거래일", "구분", "분류", "내용", "금액(원)", "담당자", "관련 사역", "정산", "증빙 수", "증빙 제외 사유", "취소 사유"], ...filtered.map((entry) => [entry.date, typeLabel(entry.type), entry.category, entry.description, entry.amount, entry.owner, entry.ministry, settlementLabel(entry.settlement), entry.receipts.length, entry.receiptExemptReason, entry.cancelReason])];
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      // 사용자 문구는 수식으로 해석하지 않도록 문자열 셀로 고정한다.
      for (const [address, cell] of Object.entries(sheet)) if (!address.startsWith("!") && typeof cell === "object" && cell && "v" in cell && typeof cell.v === "string") { cell.t = "s"; delete cell.f; }
      const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "거래 내역");
      const monthly = XLSX.utils.aoa_to_sheet([["월", "수입(원)", "지출(원)", "월말 장부 잔액(원)"], ...monthlySummary(entries, view.openingBalance).map((row) => [row.month, row.income, row.expense, row.balance])]);
      XLSX.utils.book_append_sheet(workbook, monthly, "월별 집계");
      XLSX.writeFile(workbook, `${year}년_고등부_회계.xlsx`);
    } catch (error) { if (alive.current) setActionError(errorText(error)); } finally { changeBusy(false); }
  }

  if (loading) return <p className={styles.state} role="status">{year}년 회계 기록을 불러오는 중입니다.</p>;
  if (loadError || !view) return <div className={styles.state} role="alert"><p>{loadError || "회계 기록을 불러오지 못했습니다."}</p><button type="button" className="btn-secondary" onClick={refresh}>다시 불러오기</button></div>;
  return <section className={styles.workspace} aria-label={`${year}년 연간 회계`} aria-busy={busy}>
    <div className={styles.header}><div><h2>연간 회계</h2><span className={styles.muted}>{year}년 1월–12월</span></div><div className={styles.actions}><button type="button" className="btn-secondary" disabled={locked} onClick={refresh}>새로고침</button><button type="button" className="btn-secondary" disabled={locked} onClick={() => void exportEntries()}>엑셀 내보내기</button>{editable && <button type="button" className="btn-primary" disabled={locked} onClick={() => edit()}>거래 등록</button>}</div></div>
    <dl className={styles.summary}><div><dt>전년도 이월금</dt><dd>{won(view.openingBalance)}</dd><div className={styles.actions}>{editable && <button type="button" className={styles.textButton} disabled={locked} onClick={() => { setOpening(String(view.openingBalance)); setActionError(""); }}>이월금 수정</button>}<button type="button" className={styles.textButton} disabled={locked} onClick={() => { setDetailId("opening"); setActionError(""); }}>변경 이력</button></div></div><div><dt>올해 수입</dt><dd className={styles.income}>{won(summary.income)}</dd></div><div><dt>올해 지출</dt><dd>{won(summary.expense)}</dd></div><div className={styles.balance}><dt>장부 잔액</dt><dd>{won(summary.balance)}</dd></div></dl>
    <div className={styles.workQueue}><button type="button" aria-pressed={status === "pending"} onClick={() => { setStatus(status === "pending" ? "" : "pending"); setPage(0); }}>정산 대기 <strong>{summary.pending}건</strong></button><button type="button" aria-pressed={status === "missing"} onClick={() => { setStatus(status === "missing" ? "" : "missing"); setPage(0); }}>증빙 필요 <strong>{summary.missingEvidence}건</strong></button></div>
    {!editor && opening === null && !detailId && actionFailure}
    <details className={styles.breakdown}><summary>월별 · 분류별 집계</summary><div className={styles.breakdownGrid}><div className={styles.scroll}><table className={styles.table}><caption className="sr-only">월별 수입·지출과 월말 장부 잔액</caption><thead><tr><th>월</th><th>수입</th><th>지출</th><th>월말 잔액</th></tr></thead><tbody>{monthlySummary(entries, view.openingBalance).map((row) => <tr key={row.month}><th scope="row">{row.month}월</th><td>{won(row.income)}</td><td>{won(row.expense)}</td><td>{won(row.balance)}</td></tr>)}</tbody></table></div><div className={styles.scroll}><table className={styles.table}><caption className="sr-only">분류별 수입·지출</caption><thead><tr><th>분류</th><th>수입</th><th>지출</th></tr></thead><tbody>{categories.map((name) => { const value = financeSummary(entries.filter((entry) => entry.category === name), 0); return <tr key={name}><th scope="row">{name}</th><td>{won(value.income)}</td><td>{won(value.expense)}</td></tr>; })}{!categories.length && <tr><td colSpan={3}>등록된 분류가 없습니다.</td></tr>}</tbody></table></div></div></details>
    <div className={styles.ledger}>
      <div className={styles.filters}><label className={styles.search}><span>거래 검색</span><input type="search" value={query} placeholder="내용 · 담당자 · 관련 사역" onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label><label><span>월</span><select value={month} onChange={(event) => { setMonth(event.target.value); setPage(0); }}><option value="">연간 전체</option>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, "0")}>{index + 1}월</option>)}</select></label><label><span>구분</span><select value={type} onChange={(event) => { setType(event.target.value); setPage(0); }}><option value="">수입·지출</option><option value="income">수입</option><option value="expense">지출</option></select></label><label><span>분류</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(0); }}><option value="">모든 분류</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></label><label><span>상태</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}><option value="">전체 (취소 제외)</option><option value="pending">정산 대기</option><option value="settled">정산 완료</option><option value="missing">증빙 필요</option><option value="cancelled">취소 기록</option></select></label></div>
      <div className={styles.listHeader}><p role="status">거래 <strong>{filtered.length}건</strong></p>{(query || month || type || category || status) && <button type="button" className={styles.textButton} onClick={() => { setQuery(""); setMonth(""); setType(""); setCategory(""); setStatus(""); setPage(0); }}>필터 초기화</button>}</div>
      {!filtered.length ? <div className={styles.empty}><h3>{entries.length ? "조건에 맞는 거래가 없습니다." : "등록된 거래가 없습니다."}</h3>{!entries.length && editable && <button type="button" className="btn-primary" disabled={locked} onClick={() => edit()}>첫 거래 등록</button>}</div> : <>
        <div className={styles.desktop}><div className={styles.scroll}><table className={styles.table}><caption className="sr-only">{year}년 거래 내역. 거래 내용을 선택하면 증빙과 변경 이력을 확인합니다.</caption><thead><tr><th scope="col">거래일</th><th scope="col">내용 · 분류</th><th scope="col">담당 · 사역</th><th scope="col">금액</th><th scope="col">정산 · 증빙</th><th scope="col"><span className="sr-only">상세</span></th></tr></thead><tbody>{visible.map((entry) => <tr key={entry.id} className={entry.cancelledAt ? styles.cancelled : undefined}><td>{entry.date}</td><th scope="row"><button type="button" className={styles.entryName} disabled={locked} onClick={() => { setDetailId(entry.id); setCancelling(false); setActionError(""); }}>{entry.description}</button><small>{typeLabel(entry.type)} · {entry.category}</small></th><td>{entry.owner}<small>{entry.ministry || "—"}</small></td><td className={`${styles.amount} ${entry.type === "income" ? styles.income : ""}`}>{entry.type === "income" ? "+" : "−"}{won(entry.amount)}</td><td><EntryStatus entry={entry} /></td><td><button type="button" className={styles.textButton} disabled={locked} onClick={() => { setDetailId(entry.id); setCancelling(false); setActionError(""); }} aria-label={`${entry.description} 상세 보기`}>상세</button></td></tr>)}</tbody></table></div></div>
        <div className={styles.mobile}>{visible.map((entry) => <button type="button" key={entry.id} className={styles.mobileEntry} disabled={locked} onClick={() => { setDetailId(entry.id); setCancelling(false); setActionError(""); }}><span className={styles.mobileEntryTop}><strong>{entry.description}</strong><strong className={entry.type === "income" ? styles.income : ""}>{entry.type === "income" ? "+" : "−"}{won(entry.amount)}</strong></span><span className={styles.muted}>{entry.date} · {entry.category} · {entry.owner}</span><EntryStatus entry={entry} /></button>)}</div>
        {pageCount > 1 && <nav className={styles.pagination} aria-label="거래 목록 페이지"><button type="button" className="btn-secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</button><span>{currentPage + 1} / {pageCount}</span><button type="button" className="btn-secondary" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>다음</button></nav>}
      </>}
    </div>
    {editor && <OverlayShell label={editor.entryId ? "거래 수정" : "거래 등록"} onClose={() => void closeEditor()} panelClassName={styles.panel} variant="fullscreen-mobile" closeOnBackdrop={!locked}><form onSubmit={saveEntry} className={styles.form}><div className={styles.dialogHeader}><h3>{editor.entryId ? "거래 수정" : "거래 등록"}</h3><button type="button" className="btn-secondary" disabled={locked} onClick={() => void closeEditor()}>닫기</button></div><fieldset disabled={locked} className={styles.formFields}><div className={styles.formGrid}><label>거래일<input data-autofocus type="date" required min={`${year}-01-01`} max={`${year}-12-31`} value={editor.draft.date} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, date: event.target.value } })} /></label><label>수입·지출<select value={editor.draft.type} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, type: event.target.value as Draft["type"] } })}><option value="expense">지출</option><option value="income">수입</option></select></label><label className={styles.full}>거래 내용<input required maxLength={400} value={editor.draft.description} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, description: event.target.value } })} /></label><label>금액 (원)<input type="number" required min="1" max={MAX_FINANCE_AMOUNT} step="1" inputMode="numeric" value={editor.draft.amount} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, amount: event.target.value } })} /></label><label>분류<input required maxLength={80} list="finance-categories" placeholder="예: 헌금, 교재, 간식" value={editor.draft.category} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, category: event.target.value } })} /><datalist id="finance-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist></label><label>담당자<input required maxLength={80} value={editor.draft.owner} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, owner: event.target.value } })} /></label><label>정산 상태<select value={editor.draft.settlement} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, settlement: event.target.value as Draft["settlement"] } })}><option value="pending">정산 대기</option><option value="settled">정산 완료</option></select></label><label className={styles.full}>관련 사역 <span className={styles.optional}>선택</span><input maxLength={120} placeholder="예: 겨울수련회, 찬양팀" value={editor.draft.ministry} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, ministry: event.target.value } })} /></label>{editor.draft.type === "expense" && <label className={styles.full}>증빙 제외 사유 <span className={styles.optional}>해당 시</span><input maxLength={300} value={editor.draft.receiptExemptReason} placeholder="영수증이 필요하지 않은 거래만 입력" onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, receiptExemptReason: event.target.value } })} /></label>}</div><p className={styles.muted}>영수증은 거래를 저장한 뒤 상세 화면에서 첨부합니다.</p></fieldset>{actionFailure}<div className={styles.formFooter}><button type="button" className="btn-secondary" disabled={locked} onClick={() => void closeEditor()}>취소</button><button type="submit" className="btn-primary" disabled={locked}>{busy ? "저장 중…" : "거래 저장"}</button></div></form></OverlayShell>}
    {opening !== null && <OverlayShell label="전년도 이월금 수정" onClose={() => { if (!pending.current && !unresolved.current) setOpening(null); }} panelClassName={styles.smallPanel} closeOnBackdrop={!locked}><form onSubmit={saveOpening} className={styles.form}><h3>전년도 이월금 수정</h3><label className={styles.field}>{year}년 시작 잔액 (원)<input data-autofocus type="number" step="1" required min={-MAX_FINANCE_AMOUNT} max={MAX_FINANCE_AMOUNT} value={opening} disabled={locked} onChange={(event) => setOpening(event.target.value)} /></label>{actionFailure}<div className={styles.formFooter}><button type="button" className="btn-secondary" disabled={locked} onClick={() => setOpening(null)}>취소</button><button type="submit" className="btn-primary" disabled={locked}>{busy ? "저장 중…" : "이월금 저장"}</button></div></form></OverlayShell>}
    {detailId && <OverlayShell label={selected ? `${selected.description} 거래 상세` : "이월금 변경 이력"} onClose={() => { if (!pending.current && !unresolved.current) { setDetailId(null); setCancelling(false); } }} panelClassName={styles.panel} variant="fullscreen-mobile" closeOnBackdrop={!locked}><div className={styles.form}><div className={styles.dialogHeader}><h3>{selected ? "거래 상세" : "이월금 변경 이력"}</h3><button type="button" className="btn-secondary" disabled={locked} onClick={() => { setDetailId(null); setCancelling(false); }}>닫기</button></div>{selected && <><div className={styles.detailHeadline}><h4>{selected.description}</h4><strong className={selected.type === "income" ? styles.income : ""}>{typeLabel(selected.type)} {won(selected.amount)}</strong><EntryStatus entry={selected} /></div><dl className={styles.details}>{ENTRY_FIELDS.filter((field) => !["description", "amount", "type"].includes(field)).map((field) => <div key={field}><dt>{fieldLabels[field]}</dt><dd>{field === "settlement" ? settlementLabel(String(selected[field])) : selected[field] || "—"}</dd></div>)}{selected.cancelledAt && <div><dt>취소 사유</dt><dd>{selected.cancelReason}<small>{time(selected.cancelledAt)}</small></dd></div>}</dl><section className={styles.receipts}><h4>증빙 <span>{selected.receipts.length}/3</span></h4>{selected.receipts.map((receipt) => <button type="button" className={styles.receipt} disabled={locked} key={receipt.id} onClick={() => void download(selected, receipt)}><span>{receipt.name}</span><span>{Math.ceil(receipt.size / 1024)}KB · 다운로드</span></button>)}{!selected.receipts.length && <p className={styles.muted}>{selected.receiptExemptReason ? `증빙 제외: ${selected.receiptExemptReason}` : "첨부된 영수증이 없습니다."}</p>}{editable && !selected.cancelledAt && selected.receipts.length < 3 && <label className={styles.fileField}>영수증 첨부<input type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" disabled={locked} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void addReceipt(selected, file); }} /><small>JPG · PNG · PDF, 파일당 512KB. 큰 사진은 자동으로 줄입니다.</small></label>}</section>{editable && !selected.cancelledAt && <div className={styles.actions}><button type="button" className="btn-secondary" disabled={locked} onClick={() => edit(selected)}>거래 수정</button><button type="button" className={styles.dangerButton} disabled={locked} onClick={() => { setCancelling(!cancelling); setCancelReason(""); }}>거래 취소</button></div>}{cancelling && !selected.cancelledAt && <form className={styles.cancelForm} onSubmit={cancelEntry}><label className={styles.field}>취소 사유<input required maxLength={300} value={cancelReason} disabled={locked} onChange={(event) => setCancelReason(event.target.value)} /></label><button type="submit" className={styles.dangerButton} disabled={locked || !cancelReason.trim()}>취소 사유를 남기고 거래 취소</button></form>}</>}{actionFailure}<FinanceHistory key={`${detailId}:${selected?.revision ?? view.openingRevision}`} year={year} target={detailId} /></div></OverlayShell>}
  </section>;
}

function EntryStatus({ entry }: { entry: FinanceEntry }) {
  return <span className={styles.statuses}>{entry.cancelledAt ? <span className={styles.cancelledBadge}>취소됨</span> : <><span className={entry.settlement === "settled" ? styles.settled : styles.pending}>{settlementLabel(entry.settlement)}</span>{missingEvidence(entry) ? <span className={styles.evidenceNeeded}>증빙 필요</span> : <span className={styles.muted}>{entry.receipts.length ? `증빙 ${entry.receipts.length}개` : entry.receiptExemptReason ? "증빙 제외" : ""}</span>}</>}</span>;
}

function FinanceHistory({ year, target }: { year: number; target: string }) {
  const [items, setItems] = useState<FinanceHistoryItem[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readFinanceHistory(year, target, controller.signal).then((next) => { if (!controller.signal.aborted) setItems(next); }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorText(failure)); });
    return () => controller.abort();
  }, [year, target, retry]);
  return <section className={styles.history}><h4>변경 이력</h4>{error ? <div role="alert"><p className={styles.error}>{error}</p><button type="button" className="btn-secondary" onClick={() => { setError(""); setRetry((value) => value + 1); }}>이력 다시 불러오기</button></div> : !items ? <p role="status" className={styles.muted}>이력을 불러오는 중입니다.</p> : !items.length ? <p className={styles.muted}>저장된 변경 이력이 없습니다.</p> : <ol>{items.map((item) => <li key={item.operationId}><div className={styles.historyHeader}><strong>{{ "entry.save": item.before ? "거래 수정" : "거래 등록", "entry.cancel": "거래 취소", "opening.save": "이월금 변경", "receipt.add": "영수증 첨부" }[item.kind]}</strong><span>{item.actorName} · {time(item.at)}</span></div><ul>{historyChanges(item).map((change, index) => <li key={index}>{change}</li>)}</ul></li>)}</ol>}</section>;
}

function historyChanges(item: FinanceHistoryItem): string[] {
  if (typeof item.after === "number") return [`이월금: ${won(typeof item.before === "number" ? item.before : 0)} → ${won(item.after)}`];
  const after = item.after;
  const before = item.before && typeof item.before === "object" ? item.before : null;
  if (item.kind === "entry.cancel") return [`취소 사유: ${after.cancelReason}`];
  if (item.kind === "receipt.add") return after.receipts.filter((receipt) => !before?.receipts.some((old) => old.id === receipt.id)).map((receipt) => `첨부: ${receipt.name}`);
  return ENTRY_FIELDS.filter((field) => !before || before[field] !== after[field]).map((field) => {
    const format = (value: string | number) => field === "amount" ? won(Number(value)) : field === "type" ? typeLabel(String(value)) : field === "settlement" ? settlementLabel(String(value)) : String(value || "미입력");
    return `${fieldLabels[field]}: ${before ? `${format(before[field])} → ` : ""}${format(after[field])}`;
  });
}

function monthlySummary(entries: FinanceEntry[], openingBalance: number) {
  let balance = openingBalance;
  return Array.from({ length: 12 }, (_, index) => {
    const monthly = financeSummary(entries.filter((entry) => Number(entry.date.slice(5, 7)) === index + 1), 0);
    balance += monthly.income - monthly.expense;
    return { month: index + 1, income: monthly.income, expense: monthly.expense, balance };
  });
}

async function prepareReceipt(file: File): Promise<{ name: string; mimeType: FinanceReceipt["mimeType"]; base64: string }> {
  if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) throw new Error("JPG·PNG·PDF 파일을 선택해 주세요.");
  if (file.size === 0 || file.size > 20 * 1024 * 1024) throw new Error("비어 있지 않은 20MB 이하의 파일을 선택해 주세요.");
  let blob: Blob = file;
  let name = file.name.replace(/[\\/]/g, "_").slice(-110);
  let mimeType = file.type as FinanceReceipt["mimeType"];
  if (file.size > MAX_RECEIPT_BYTES) {
    if (file.type === "application/pdf") throw new Error("PDF는 512KB 이하로 줄인 뒤 첨부해 주세요.");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      for (let attempt = 0; attempt < 7; attempt++) {
        const context = canvas.getContext("2d"); if (!context) throw new Error("사진을 처리하지 못했습니다. 작은 파일로 다시 선택해 주세요.");
        context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("사진 압축에 실패했습니다.")), "image/jpeg", Math.max(0.45, 0.85 - attempt * 0.08)));
        if (blob.size <= MAX_RECEIPT_BYTES) break;
        canvas.width = Math.max(1, Math.round(canvas.width * 0.8)); canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
      }
      if (blob.size > MAX_RECEIPT_BYTES) throw new Error("사진을 512KB 이하로 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.");
      mimeType = "image/jpeg"; name = `${name.replace(/\.[^.]+$/, "")}.jpg`;
    } finally { URL.revokeObjectURL(url); }
  }
  const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("파일을 읽지 못했습니다.")); reader.readAsDataURL(blob); });
  return { name, mimeType, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}
