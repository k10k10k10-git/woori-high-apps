'use client';
import { useEffect, useId } from 'react';

type Draft = { scope: 'groups' | 'stage'; dirty: boolean; busy: boolean };
const drafts = new Map<string, Draft>();
/** 화면 안 초안만 추적한다. 이름·명단·편집 내용은 브라우저 저장소에 기록하지 않는다. */
export function confirmPraiseNavigation(scope?: Draft['scope']): boolean {
  const affected = [...drafts.values()].filter(draft => !scope || draft.scope === scope);
  if (affected.some(draft => draft.busy)) {
    window.alert('저장이 진행 중입니다. 결과를 확인한 뒤 이동해 주세요.');
    return false;
  }
  return !affected.some(draft => draft.dirty) || window.confirm('저장하지 않은 편성이 있습니다. 변경 내용을 버리고 이동할까요? 취소하면 계속 편집할 수 있습니다.');
}
function beforeUnload(event: BeforeUnloadEvent) {
  if ([...drafts.values()].some(draft => draft.dirty || draft.busy)) { event.preventDefault(); event.returnValue = ''; }
}
function beforeLink(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.href === window.location.href) return;
  if (!confirmPraiseNavigation()) { event.preventDefault(); event.stopPropagation(); }
}
export function usePraiseDraftGuard(scope: Draft['scope'], dirty: boolean, busy: boolean) {
  const id = useId();
  useEffect(() => {
    drafts.set(id, { scope, dirty, busy });
    if (drafts.size === 1) { window.addEventListener('beforeunload', beforeUnload); document.addEventListener('click', beforeLink, true); }
    return () => {
      drafts.delete(id);
      if (!drafts.size) { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', beforeLink, true); }
    };
  }, [id, scope, dirty, busy]);
}
