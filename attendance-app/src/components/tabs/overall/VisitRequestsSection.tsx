'use client';
import { useEffect, useRef, useState } from 'react';
import { db, onValue, ref, update } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import AdminIcon from '@/components/admin/AdminIcon';
import { showToast } from '@/utils/toast';
import { formatSuggestionDate } from '@/utils/suggestionDate';
import { parseYearTeacherMessages, type TeacherMessage, type VisitRequestStatus } from '@/utils/teacherMessages';

type VisitRow = TeacherMessage & { classKey: string };
type VisitLoad = { year: number; rows: VisitRow[]; status: 'loading' | 'ready' | 'error' };

type VisitFilter = { part?: string; grade?: string; classKey?: string; search?: string };

export default function VisitRequestsSection({ initialView = 'open', filter, requestKey = '' }: { initialView?: 'open' | 'done'; filter?: VisitFilter; requestKey?: string }) {
  const { state } = useApp();
  const { classData, curYear } = state;
  const [load, setLoad] = useState<VisitLoad>({ year: curYear, rows: [], status: 'loading' });
  const [view, setView] = useState<'open' | 'done'>(initialView);
  const [retry, setRetry] = useState(0);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const targetRef = useRef<HTMLElement>(null);
  const focusedRequest = useRef('');

  useEffect(() => {
    let active = true;
    const stop = onValue(ref(db, `suggestions/${curYear}`), snap => {
      if (!active) return;
      const rows = Object.entries(parseYearTeacherMessages(snap.val(), 'visit'))
        .flatMap(([classKey, items]) => items.map(item => ({ ...item, classKey })))
        .sort((a, b) => b.createdAt - a.createdAt);
      setLoad({ year: curYear, rows, status: 'ready' });
    }, () => { if (active) setLoad({ year: curYear, rows: [], status: 'error' }); });
    return () => { active = false; stop?.(); };
  }, [curYear, retry]);

  const current = load.year === curYear ? load : { year: curYear, rows: [], status: 'loading' as const };
  const query = (filter?.search ?? '').trim().normalize('NFC').toLocaleLowerCase('ko');
  const scopedRows = current.rows.filter(row => {
    const [part, grade] = row.classKey.split('-');
    if (filter?.part && filter.part !== part) return false;
    if (filter?.grade && filter.grade !== grade) return false;
    if (filter?.classKey && filter.classKey !== row.classKey) return false;
    return !query || `${row.studentName} ${row.text} ${classData[row.classKey]?.teacher ?? row.author ?? ''}`.normalize('NFC').toLocaleLowerCase('ko').includes(query);
  });
  const openCount = scopedRows.filter(row => row.status !== 'done').length;
  const doneCount = scopedRows.length - openCount;
  const rows = scopedRows.filter(row => view === 'done' ? row.status === 'done' : row.status !== 'done');
  const requestedRow = current.rows.find(row => `${row.classKey}/${row.id}` === requestKey);
  const requestVisible = scopedRows.some(row => `${row.classKey}/${row.id}` === requestKey);

  useEffect(() => {
    if (!requestKey || current.status !== 'ready' || !requestedRow || !requestVisible || focusedRequest.current === requestKey) return;
    const targetView = requestedRow.status === 'done' ? 'done' : 'open';
    if (view !== targetView) { setView(targetView); return; }
    targetRef.current?.focus({ preventScroll: true });
    targetRef.current?.scrollIntoView?.({ block: 'center' });
    focusedRequest.current = requestKey;
  }, [requestKey, current.status, requestedRow, requestVisible, view]);

  async function changeStatus(row: VisitRow, status: VisitRequestStatus) {
    const key = `${row.classKey}/${row.id}`;
    if (savingKey) return;
    setSavingKey(key);
    try {
      await update(ref(db, `suggestions/${curYear}/${row.classKey}/${row.id}`), status === 'done'
        ? { status, resolvedAt: Date.now() }
        : { status, resolvedAt: null });
      showToast(status === 'done' ? '심방 요청을 처리 완료로 표시했습니다.' : '심방 요청을 다시 열었습니다.');
    } catch { showToast('처리 상태를 저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setSavingKey(null); }
  }

  return <section className="ao-visits" aria-labelledby="ao-visits-title">
    <header className="ao-suggestions-heading">
      <div><h2 id="ao-visits-title">심방 요청 <span>{current.status === 'ready' ? openCount : '—'}</span></h2>
        <p>교사가 요청한 학생과 이유를 확인하고 처리 상태를 관리하세요.</p></div>
    </header>
    <div className="ad-status-tabs ao-visit-tabs" role="group" aria-label="심방 요청 상태">
      <button type="button" aria-pressed={view === 'open'} onClick={() => setView('open')}>확인 필요 <span>{openCount}</span></button>
      <button type="button" aria-pressed={view === 'done'} onClick={() => setView('done')}>처리 완료 <span>{doneCount}</span></button>
    </div>
    {requestKey && current.status === 'ready' && !requestedRow && <p className="pr-empty" role="status">요청한 심방 건을 찾을 수 없습니다. 조회 연도를 확인해 주세요.</p>}
    {requestKey && current.status === 'ready' && requestedRow && !requestVisible && <p className="pr-empty" role="status">요청한 심방 건이 현재 필터에 보이지 않습니다. 필터를 초기화해 주세요.</p>}
    {current.status === 'error' ? <div className="ao-error" role="alert"><span>심방 요청을 불러오지 못했습니다.</span><button type="button" onClick={() => { setLoad({ year: curYear, rows: [], status: 'loading' }); setRetry(value => value + 1); }}>다시 시도</button></div>
      : current.status === 'loading' ? <p className="ao-loading" role="status">심방 요청을 불러오고 있습니다.</p>
        : rows.length === 0 ? <div className="ad-empty"><AdminIcon name="book" size={26} /><h3>{view === 'open' ? '확인이 필요한 심방 요청이 없습니다.' : '처리 완료된 심방 요청이 없습니다.'}</h3><p>교사가 출석 입력 화면에서 요청하면 이곳에 표시됩니다.</p></div>
          : <div className="ao-visit-list">{rows.map(row => {
            const [part, grade, cls] = row.classKey.split('-');
            const key = `${row.classKey}/${row.id}`;
            const date = formatSuggestionDate(row.createdAt, 'detail');
            return <article key={key} ref={requestKey === key ? targetRef : undefined} tabIndex={requestKey === key ? -1 : undefined} aria-label={requestKey === key ? `${row.studentName} 심방 요청` : undefined} className="ao-visit-row" style={requestKey === key ? { background: '#faf9fc', outline: '1px solid #6355a7', outlineOffset: '-1px', scrollMarginTop: '24px' } : undefined}>
              <div className="ao-visit-person"><strong>{row.studentName}</strong><span>{part}부 {grade}학년 {cls}반 · {classData[row.classKey]?.teacher || row.author || '담임 미등록'}</span></div>
              <p>{row.text}</p>
              <div className="ao-visit-action"><time dateTime={date.dateTime}>{date.label}</time><button type="button" disabled={savingKey === key}
                onClick={() => changeStatus(row, row.status === 'done' ? 'open' : 'done')}>{savingKey === key ? '저장 중' : row.status === 'done' ? '다시 열기' : '처리 완료'}</button></div>
            </article>;
          })}</div>}
  </section>;
}
