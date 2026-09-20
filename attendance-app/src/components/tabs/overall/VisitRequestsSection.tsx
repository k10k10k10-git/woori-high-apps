'use client';
import { useEffect, useState } from 'react';
import { db, onValue, ref, update } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import AdminIcon from '@/components/admin/AdminIcon';
import { showToast } from '@/utils/toast';
import { formatSuggestionDate } from '@/utils/suggestionDate';
import { parseYearTeacherMessages, type TeacherMessage, type VisitRequestStatus } from '@/utils/teacherMessages';

type VisitRow = TeacherMessage & { classKey: string };
type VisitLoad = { year: number; rows: VisitRow[]; status: 'loading' | 'ready' | 'error' };

export default function VisitRequestsSection({ initialView = 'open' }: { initialView?: 'open' | 'done' }) {
  const { state } = useApp();
  const { classData, curYear } = state;
  const [load, setLoad] = useState<VisitLoad>({ year: curYear, rows: [], status: 'loading' });
  const [view, setView] = useState<'open' | 'done'>(initialView);
  const [retry, setRetry] = useState(0);
  const [savingKey, setSavingKey] = useState<string | null>(null);

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
  const openCount = current.rows.filter(row => row.status !== 'done').length;
  const doneCount = current.rows.length - openCount;
  const rows = current.rows.filter(row => view === 'done' ? row.status === 'done' : row.status !== 'done');

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
    {current.status === 'error' ? <div className="ao-error" role="alert"><span>심방 요청을 불러오지 못했습니다.</span><button type="button" onClick={() => { setLoad({ year: curYear, rows: [], status: 'loading' }); setRetry(value => value + 1); }}>다시 시도</button></div>
      : current.status === 'loading' ? <p className="ao-loading" role="status">심방 요청을 불러오고 있습니다.</p>
        : rows.length === 0 ? <div className="ad-empty"><AdminIcon name="book" size={26} /><h3>{view === 'open' ? '확인이 필요한 심방 요청이 없습니다.' : '처리 완료된 심방 요청이 없습니다.'}</h3><p>교사가 출석 입력 화면에서 요청하면 이곳에 표시됩니다.</p></div>
          : <div className="ao-visit-list">{rows.map(row => {
            const [part, grade, cls] = row.classKey.split('-');
            const key = `${row.classKey}/${row.id}`;
            const date = formatSuggestionDate(row.createdAt, 'detail');
            return <article key={key} className="ao-visit-row">
              <div className="ao-visit-person"><strong>{row.studentName}</strong><span>{part}부 {grade}학년 {cls}반 · {classData[row.classKey]?.teacher || row.author || '담임 미등록'}</span></div>
              <p>{row.text}</p>
              <div className="ao-visit-action"><time dateTime={date.dateTime}>{date.label}</time><button type="button" disabled={savingKey === key}
                onClick={() => changeStatus(row, row.status === 'done' ? 'open' : 'done')}>{savingKey === key ? '저장 중' : row.status === 'done' ? '다시 열기' : '처리 완료'}</button></div>
            </article>;
          })}</div>}
  </section>;
}
