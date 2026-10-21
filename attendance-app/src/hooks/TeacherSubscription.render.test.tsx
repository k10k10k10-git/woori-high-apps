/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { AppProvider, useApp } from '@/store/AppContext';
import { useSuggestions } from './useSuggestions';
import { useVisitRequests } from './useVisitRequests';

type Listener = { receive: (snap: { val: () => unknown }) => void; fail: () => void; stop: ReturnType<typeof vi.fn> };
const mocks = vi.hoisted(() => ({ listeners: [] as Listener[] }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_db: unknown, path: string) => path,
  onValue: (_path: string, receive: Listener['receive'], fail: Listener['fail']) => {
    const stop = vi.fn(); mocks.listeners.push({ receive, fail, stop }); return stop;
  },
}));
vi.mock('@/lib/teacherMessageSave', () => ({ saveTeacherMessage: vi.fn(), TeacherMessageSaveError: class extends Error {} }));
function Editor({ kind, ck = '1-1-1' }: { kind: 'note' | 'visit'; ck?: string }) {
  const { dispatch } = useApp();
  useEffect(() => { dispatch({ type: 'SET_USER_ROLE', payload: { role: 'admin' } }); }, [dispatch]);
  const note = useSuggestions(2026, ck, kind === 'note', '합성 교사');
  const visit = useVisitRequests(2026, ck, kind === 'visit', '합성 교사');
  const loading = kind === 'note' ? note.suggestLoading : visit.visitLoading;
  const error = kind === 'note' ? note.suggestLoadError : visit.visitLoadError;
  const items = kind === 'note' ? note.suggestions : visit.visitRequests;
  return <>
    <textarea aria-label="초안" value={kind === 'note' ? note.suggestText : visit.visitText}
      onChange={event => (kind === 'note' ? note.setSuggestText : visit.setVisitText)(event.target.value)} />
    <output>{error ? '조회 실패' : loading ? '불러오는 중' : items.map(item => item.text).join(',') || '자료 없음'}</output>
    <button onClick={kind === 'note' ? note.retrySuggestions : visit.retryVisitRequests}>재시도</button>
  </>;
}
beforeEach(() => { mocks.listeners = []; });
afterEach(cleanup);
describe('교사 기록 구독 재시도', () => {
  it.each(['note', 'visit'] as const)('%s 재시도는 초안을 보존하고 이전 구독의 늦은 콜백을 무시한다', kind => {
    render(<AppProvider><Editor kind={kind} /></AppProvider>);
    expect(screen.getByText('불러오는 중')).toBeTruthy();
    expect(screen.queryByText('자료 없음')).toBeNull();
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '보존할 합성 초안' } });
    const old = mocks.listeners[0]; act(() => old.fail());
    expect(screen.getByText('조회 실패')).toBeTruthy();
    fireEvent.click(screen.getByText('재시도'));
    expect(old.stop).toHaveBeenCalledOnce();
    expect(screen.getByText('불러오는 중')).toBeTruthy();
    act(() => { old.receive({ val: () => ({ late: { kind, text: '늦은 자료', studentId: 'a', studentName: '합성 학생' } }) }); old.fail(); });
    expect(screen.queryByText('늦은 자료')).toBeNull();
    expect(screen.getByText('불러오는 중')).toBeTruthy();
    act(() => mocks.listeners[1].receive({ val: () => ({ current: { kind, text: '현재 자료', studentId: 'a', studentName: '합성 학생' } }) }));
    expect(screen.getByText('현재 자료')).toBeTruthy();
    expect((screen.getByLabelText('초안') as HTMLTextAreaElement).value).toBe('보존할 합성 초안');
  });
});
