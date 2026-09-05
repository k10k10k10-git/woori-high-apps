'use client';
import { useEffect, useState } from 'react';
import { db, ref, onValue, remove } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import AdminIcon from '@/components/admin/AdminIcon';
import { showToast } from '@/utils/toast';
import { formatSuggestionDate } from '@/utils/suggestionDate';

type Suggestion = { id: string; text: string; createdAt: number; author: string };
type SuggestionLoad = { year: number; items: Record<string, Suggestion[]>; status: 'loading' | 'ready' | 'error' };

export default function SuggestionsSection() {
  const { state } = useApp();
  const { classData, curYear } = state;
  const [loaded, setLoaded] = useState<SuggestionLoad>({ year: curYear, items: {}, status: 'loading' });
  const [retry, setRetry] = useState(0);
  const [expandedCk, setExpandedCk] = useState<string | null>(null);
  const [deletingSugKey, setDeletingSugKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = onValue(ref(db, `suggestions/${curYear}`), snap => {
      if (!active) return;
      const data = (snap.val() ?? {}) as Record<string, Record<string, Omit<Suggestion, 'id'>>>;
      const items: Record<string, Suggestion[]> = {};
      Object.entries(data).forEach(([ck, values]) => {
        const rows = Object.entries(values ?? {}).map(([id, value]) => ({ ...value, id }))
          .sort((a, b) => b.createdAt - a.createdAt);
        if (rows.length) items[ck] = rows;
      });
      setLoaded({ year: curYear, items, status: 'ready' });
    }, () => { if (active) setLoaded({ year: curYear, items: {}, status: 'error' }); });
    return () => { active = false; unsubscribe(); };
  }, [curYear, retry]);

  const allSuggestions = loaded.year === curYear ? loaded.items : {};
  const loadStatus = loaded.year === curYear ? loaded.status : 'loading';
  const total = Object.values(allSuggestions).reduce((sum, items) => sum + items.length, 0);

  async function deleteSuggestion(ck: string, id: string) {
    if (deleting) return;
    setDeleting(true);
    try {
      await remove(ref(db, `suggestions/${curYear}/${ck}/${id}`));
      setDeletingSugKey(null);
    } catch { showToast('건의사항을 삭제하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setDeleting(false); }
  }

  return (
    <section className="ao-suggestions" aria-labelledby="ao-suggestions-title">
      <header className="ao-suggestions-heading">
        <div><h2 id="ao-suggestions-title">건의사항 <span>{loadStatus === 'ready' ? total : '—'}</span></h2>
          <p>반별로 모인 의견을 최신순으로 확인하세요.</p></div>
      </header>
      {loadStatus === 'error' ? <div className="ao-error" role="alert">
        <span>건의사항을 불러오지 못했습니다.</span>
        <button type="button" onClick={() => { setLoaded({ year: curYear, items: {}, status: 'loading' }); setRetry(n => n + 1); }}>다시 시도</button>
      </div> : loadStatus === 'loading' ? <p className="ao-loading" role="status">건의사항을 불러오고 있습니다.</p>
        : total === 0 ? <div className="ad-empty"><AdminIcon name="book" size={26} /><h3>등록된 건의사항이 없습니다.</h3><p>교사가 출석부에서 남긴 의견이 이곳에 모입니다.</p></div>
          : <div className="ao-suggestion-list">
            {Object.entries(allSuggestions).sort(([, a], [, b]) => b[0].createdAt - a[0].createdAt).map(([ck, items]) => {
              const [p, g, c] = ck.split('-');
              const teacher = classData[ck]?.teacher ?? '';
              const isOpen = expandedCk === ck;
              const latestDate = formatSuggestionDate(items[0].createdAt);
              return <article key={ck} className="ao-suggestion">
                <button type="button" className="ao-suggestion-toggle" onClick={() => { setExpandedCk(isOpen ? null : ck); setDeletingSugKey(null); }}
                  aria-expanded={isOpen} aria-controls={`ao-suggestions-${ck}`}>
                  <div><strong>{p}부 {g}학년 {c}반 <span>{items.length}건</span></strong><small>{teacher || '담임 교사 미등록'}</small></div>
                  <time dateTime={latestDate.dateTime}>{latestDate.label}</time>
                  <AdminIcon name="chevron" className={isOpen ? 'ao-chevron-open' : ''} />
                </button>
                {!isOpen && <p className="ao-suggestion-preview">{items[0].text}</p>}
                <div id={`ao-suggestions-${ck}`} hidden={!isOpen}>{isOpen && items.map(s => {
                  const key = `${curYear}/${ck}/${s.id}`;
                  const date = formatSuggestionDate(s.createdAt, 'detail');
                  return <div key={s.id} className="ao-suggestion-item">
                    <div className="ao-suggestion-meta">
                      <time dateTime={date.dateTime}>{date.label}</time>
                      {deletingSugKey === key ? <div>
                        <button type="button" disabled={deleting} className="ao-delete-confirm" onClick={() => deleteSuggestion(ck, s.id)}>삭제 확인</button>
                        <button type="button" disabled={deleting} onClick={() => setDeletingSugKey(null)}>취소</button>
                      </div> : <button type="button" disabled={deleting} onClick={() => setDeletingSugKey(key)} aria-label={`${p}부 ${g}학년 ${c}반 건의사항 삭제`}>삭제</button>}
                    </div>
                    <p>{s.text}</p>
                  </div>;
                })}</div>
              </article>;
            })}
          </div>}
    </section>
  );
}
