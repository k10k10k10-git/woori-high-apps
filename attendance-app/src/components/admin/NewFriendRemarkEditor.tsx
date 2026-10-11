import { useEffect, useRef, useState } from 'react';
import { REMARK_LIMIT, saveFriendRemark, subscribeFriendRemark, type RemarkLoad } from '@/lib/newFriendRemarks';

export function useFriendRemarks(keys: string[]) {
  const keyList = JSON.stringify([...new Set(keys)].sort());
  const [revision, setRevision] = useState(0);
  const [loads, setLoads] = useState<Record<string, RemarkLoad>>({});
  useEffect(() => {
    const currentKeys: string[] = JSON.parse(keyList);
    setLoads(Object.fromEntries(currentKeys.map(key => [key, { status: 'loading', value: null }])));
    const stops = currentKeys.map(key => {
      const receive = (load: RemarkLoad) => setLoads(current => ({ ...current, [key]: load }));
      try { return subscribeFriendRemark(key, receive); }
      catch { receive({ status: 'error', value: null }); return () => {}; }
    });
    return () => stops.forEach(stop => stop());
  }, [keyList, revision]);
  return { loads, retry: () => setRevision(value => value + 1) };
}

export default function NewFriendRemarkEditor({ friendKey, name, opened, latest, isCurrent, onClose, onRetry }: {
  friendKey: string; name: string; opened: string | null; latest?: RemarkLoad;
  isCurrent: () => boolean; onClose: () => void; onRetry: () => void;
}) {
  const [draft, setDraft] = useState(opened ?? '');
  const [expected, setExpected] = useState(opened);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const active = useRef(true);
  const busy = useRef(false);
  useEffect(() => { active.current = true; editor.current?.focus(); return () => { active.current = false; }; }, []);
  const changed = latest?.status === 'ready' && latest.value !== expected;
  function close() {
    if ((draft.trim() || null) !== expected && !window.confirm('저장하지 않은 비고 내용이 있습니다. 저장하지 않고 닫을까요?')) return;
    onClose();
  }
  async function save() {
    if (busy.current || !isCurrent()) return;
    busy.current = true; setSaving(true); setError(''); setSaved(false);
    try {
      await saveFriendRemark(friendKey, expected, draft, () => active.current && isCurrent());
      if (active.current && isCurrent()) { setExpected(draft.trim() || null); setDraft(draft.trim()); setSaved(true); }
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : '비고를 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally { busy.current = false; if (active.current) setSaving(false); }
  }
  return <aside className="pr-remark-editor" aria-label={`${name} 비고 편집`}>
    <div className="pr-remark-editor-head"><div><h3>{name} · 비고</h3><p>통합사이트 바나바의 비고와 함께 반영됩니다.</p></div><button type="button" disabled={saving} onClick={close}>닫기</button></div>
    <label htmlFor="pr-friend-remark">비고 내용</label>
    <textarea id="pr-friend-remark" ref={editor} rows={5} value={draft} disabled={saving} maxLength={REMARK_LIMIT} aria-describedby="pr-remark-help" onChange={event => { setDraft(event.target.value); setSaved(false); }} />
    <p id="pr-remark-help" className="pr-remark-help">{draft.length.toLocaleString()} / 10,000자 · 다른 비공개 메모와 연락처는 변경하지 않습니다.</p>
    {changed && <div className="pr-remark-conflict" role="status"><p>최신 비고가 변경되었습니다. 현재 작성 내용은 자동으로 바꾸지 않습니다.</p><pre>{latest.value || '비고 없음'}</pre><button type="button" disabled={saving} onClick={() => { setExpected(latest.value); setDraft(latest.value ?? ''); setError(''); setSaved(false); }}>작성 내용 대신 최신 비고 사용</button></div>}
    {latest?.status === 'error' && <p role="alert">최신 비고를 불러오지 못했습니다. <button type="button" disabled={saving} onClick={onRetry}>비고 다시 불러오기</button></p>}
    {error && <p className="pr-remark-error" role="alert">{error}</p>}
    <div className="pr-remark-actions"><span role="status">{saving ? '저장 중…' : saved ? '비고가 저장되었습니다.' : ''}</span><button type="button" className="pr-remark-save" disabled={saving || draft.length > REMARK_LIMIT || latest?.status !== 'ready'} onClick={() => void save()}>{saving ? '저장 중…' : '비고 저장'}</button></div>
  </aside>;
}
