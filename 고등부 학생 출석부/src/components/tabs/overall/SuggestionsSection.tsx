'use client';
import { useEffect, useState } from 'react';
import { ref, onValue, off, remove } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';

type Suggestion = { id: string; text: string; createdAt: number; author: string };

export default function SuggestionsSection() {
  const { state } = useApp();
  const { classData, curYear } = state;

  const [allSuggestions, setAllSuggestions] = useState<Record<string, Suggestion[]>>({});
  const [expandedCk, setExpandedCk] = useState<string | null>(null);
  const [deletingSugKey, setDeletingSugKey] = useState<string | null>(null);

  useEffect(() => {
    const sugRef = ref(db, `suggestions/${curYear}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onValue(sugRef, snap => {
      if (!snap.exists()) { setAllSuggestions({}); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = snap.val() as Record<string, Record<string, any>>;
      const result: Record<string, Suggestion[]> = {};
      Object.entries(data).forEach(([ck, items]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result[ck] = Object.entries(items).map(([id, v]: [string, any]) => ({ id, ...v } as Suggestion))
          .sort((a, b) => b.createdAt - a.createdAt);
      });
      setAllSuggestions(result);
    });
    return () => off(sugRef);
  }, [curYear]);

  return (
    <div style={{ padding: '12px' }}>
      {Object.keys(allSuggestions).length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '50px 20px', fontSize: 14 }}>
          등록된 건의사항이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(allSuggestions)
            .sort(([,a],[,b]) => b[0].createdAt - a[0].createdAt)
            .map(([ck, items]) => {
              const [p, g, c] = ck.split('-');
              const teacher = classData[ck]?.teacher ?? '';
              const isOpen = expandedCk === ck;
              const latest = items[0];
              return (
                <div key={ck} className="suggest-admin-card">
                  <button className="suggest-admin-header" onClick={() => setExpandedCk(isOpen ? null : ck)}
                    aria-expanded={isOpen} aria-label={`${p}부 ${g}학년 ${c}반 건의사항 ${items.length}건`}>
                    <div>
                      <span className="suggest-admin-class">{p}부 {g}학년 {c}반</span>
                      {teacher && <span className="suggest-admin-teacher"> · {teacher}</span>}
                      <span className="suggest-count" style={{ marginLeft: 8 }}>{items.length}건</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                        {new Date(latest.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </span>
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {!isOpen && (
                    <div className="suggest-admin-preview">{latest.text}</div>
                  )}
                  {isOpen && (
                    <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {items.map(s => (
                        <div key={s.id} className="suggest-item">
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                            <div className="suggest-item-meta">
                              {new Date(s.createdAt).toLocaleDateString('ko-KR', {
                                year: 'numeric', month: 'long', day: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </div>
                            {deletingSugKey === s.id ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  className="suggest-delete-btn"
                                  style={{ background: 'var(--red-bg)', color: 'var(--red-text)' }}
                                  onClick={async () => {
                                    setDeletingSugKey(null);
                                    await remove(ref(db, `suggestions/${curYear}/${ck}/${s.id}`));
                                  }}
                                  aria-label="건의사항 삭제 확인"
                                >확인</button>
                                <button
                                  className="suggest-delete-btn"
                                  onClick={() => setDeletingSugKey(null)}
                                  aria-label="건의사항 삭제 취소"
                                >취소</button>
                              </div>
                            ) : (
                              <button
                                className="suggest-delete-btn"
                                onClick={() => setDeletingSugKey(s.id)}
                                aria-label="건의사항 삭제"
                              >삭제</button>
                            )}
                          </div>
                          <div className="suggest-item-text">{s.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
