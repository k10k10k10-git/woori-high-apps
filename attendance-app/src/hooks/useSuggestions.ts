'use client';
import { useEffect, useRef, useState } from 'react';
import { db, ref, onValue, push } from '@/lib/db';
import { showToast } from '@/utils/toast';
type Suggestion = { id: string; text: string; createdAt: number; author: string };

export function useSuggestions(year: number, classKey: string, listEnabled: boolean, teacher: string) {
  const scope = `${year}/${classKey}`;
  const [list, setList] = useState<{ scope: string; items: Suggestion[]; error: boolean } | null>(null);
  const [draft, setDraft] = useState({ scope, text: '' });
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!listEnabled) return;
    let active = true;
    const stop = onValue(ref(db, `suggestions/${scope}`), snap => {
      if (!active) return;
      const value: unknown = snap.val();
      const items: Suggestion[] = [];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [id, entry] of Object.entries(value)) {
          if (!entry || typeof entry !== 'object' || typeof entry.text !== 'string') continue;
          items.push({ id, text: entry.text, createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0, author: typeof entry.author === 'string' ? entry.author : '' });
        }
      }
      setList({ scope, items: items.sort((a, b) => b.createdAt - a.createdAt), error: false });
    }, () => { if (active) setList({ scope, items: [], error: true }); });
    return () => { active = false; stop?.(); };
  }, [scope, listEnabled]);
  const text = draft.scope === scope ? draft.text : '';
  async function submit() {
    if (!text.trim() || inFlight.current) return;
    inFlight.current = true; setSaving(true);
    try {
      await push(ref(db, `suggestions/${scope}`), { text: text.trim(), createdAt: Date.now(), author: teacher });
      setDraft(current => current.scope === scope && current.text === text ? { scope, text: '' } : current);
      showToast('건의사항이 등록되었습니다.');
    } catch { showToast('저장에 실패했습니다. 내용을 보존했으니 다시 시도해 주세요.'); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return { suggestions: list?.scope === scope ? list.items : [], suggestLoadError: list?.scope === scope && list.error,
    suggestText: text, setSuggestText: (value: string) => setDraft({ scope, text: value }), suggestSaving: saving, handleSuggestSubmit: submit };
}
