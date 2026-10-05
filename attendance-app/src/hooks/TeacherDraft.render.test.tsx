/** @vitest-environment jsdom */
import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '@/store/AppContext';
import { useSuggestions } from './useSuggestions';
import { useVisitRequests } from './useVisitRequests';
import { TeacherMessageSaveError } from '@/lib/teacherMessageSave';

const mocks = vi.hoisted(() => ({ push: vi.fn(), ids: [] as string[], guards: [] as (() => boolean)[] }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_db: unknown, path: string) => path, push: mocks.push, onValue: vi.fn(() => vi.fn()) }));
vi.mock('@/lib/teacherMessageSave', () => ({ TeacherMessageSaveError: class extends Error {}, saveTeacherMessage: (year: number, ck: string, id: string, payload: unknown, isCurrent: () => boolean) => {
  mocks.ids.push(id); mocks.guards.push(isCurrent); return mocks.push(`suggestions/${year}/${ck}`, payload);
} }));

function Editor({ kind, year, ck }: { kind: 'note' | 'visit'; year: number; ck: string }) {
  const notes = useSuggestions(year, ck, false, '합성교사');
  const visits = useVisitRequests(year, ck, false, '합성교사');
  const value = kind === 'note' ? notes.suggestText : visits.visitText;
  const saving = kind === 'note' ? notes.suggestSaving : visits.visitSaving;
  const setText = kind === 'note' ? notes.setSuggestText : visits.setVisitText;
  return <><textarea aria-label="초안" value={value} onChange={e => setText(e.target.value)} />
    <button onClick={() => kind === 'note' ? notes.setSuggestStudentId('s1') : visits.setVisitStudentId('s1')}>학생 선택</button>
    <button disabled={saving} onClick={() => kind === 'note' ? notes.handleSuggestSubmit('합성학생') : visits.handleVisitSubmit('합성학생', 'person_student_a')}>등록</button></>;
}
function Harness({ kind = 'note', year = 2026, ck = '1-1-1' }: { kind?: 'note' | 'visit'; year?: number; ck?: string }) {
  const { dispatch } = useApp();
  const [visible, setVisible] = useState(true);
  useEffect(() => { dispatch({ type: 'SET_USER_ROLE', payload: { role: 'admin' } }); }, [dispatch]);
  return <><button onClick={() => setVisible(v => !v)}>화면 이동</button>
    <button onClick={() => dispatch({ type: 'SET_USER_ROLE', payload: { role: 'teacher', email: 'new@example.invalid' } })}>계정 변경</button>
    {visible && <Editor kind={kind} year={year} ck={ck} />}</>;
}
beforeEach(() => { mocks.ids = []; mocks.guards = []; mocks.push.mockReset().mockResolvedValue(undefined); });
afterEach(cleanup);
describe('세션 안의 교사 작성 초안', () => {
  it.each(['note', 'visit'] as const)('%s 화면을 종료·재진입해도 초안을 보존한다', kind => {
    render(<AppProvider><Harness kind={kind} /></AppProvider>);
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '합성 상담 내용' } });
    fireEvent.click(screen.getByText('화면 이동')); fireEvent.click(screen.getByText('화면 이동'));
    expect((screen.getByLabelText('초안') as HTMLTextAreaElement).value).toBe('합성 상담 내용');
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it('반·연도·종류별로 분리하고 같은 계정의 원래 범위로 돌아오면 복원한다', () => {
    const { rerender } = render(<AppProvider><Harness /></AppProvider>);
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '원래 반 초안' } });
    for (const props of [{ ck: '2-1-7' }, { year: 2025 }, { kind: 'visit' as const }]) {
      rerender(<AppProvider><Harness {...props} /></AppProvider>);
      expect((screen.getByLabelText('초안') as HTMLTextAreaElement).value).toBe('');
    }
    rerender(<AppProvider><Harness /></AppProvider>);
    expect((screen.getByLabelText('초안') as HTMLTextAreaElement).value).toBe('원래 반 초안');
  });
  it('페이지를 닫기 전에 경고하고 계정 전환은 초안을 폐기한다', () => {
    render(<AppProvider><Harness /></AppProvider>);
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '아직 등록 전' } });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByText('계정 변경'));
    expect((screen.getByLabelText('초안') as HTMLTextAreaElement).value).toBe('');
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after); expect(after.defaultPrevented).toBe(false);
  });
  it.each(['note', 'visit'] as const)('%s 저장 실패에는 보존하고 성공 후에만 지운다', async kind => {
    mocks.push.mockRejectedValueOnce(new Error('합성 실패'));
    render(<AppProvider><Harness kind={kind} /></AppProvider>);
    fireEvent.click(screen.getByText('학생 선택'));
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '등록할 내용' } });
    fireEvent.click(screen.getByText('등록'));
    await waitFor(() => expect((screen.getByText('등록') as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByLabelText('초안') as HTMLTextAreaElement).value).toBe('등록할 내용');
    fireEvent.click(screen.getByText('등록'));
    await waitFor(() => expect((screen.getByLabelText('초안') as HTMLTextAreaElement).value).toBe(''));
    if (kind === 'visit') expect(mocks.push).toHaveBeenLastCalledWith('suggestions/2026/1-1-1', expect.objectContaining({ studentPersonId: 'person_student_a' }));
  });
  it('저장 중 재진입은 중복 전송하지 않고 새로 쓴 내용도 지우지 않는다', async () => {
    let finish!: () => void;
    mocks.push.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<AppProvider><Harness /></AppProvider>);
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '보내는 내용' } });
    fireEvent.click(screen.getByText('등록'));
    expect(mocks.guards[0]()).toBe(true);
    fireEvent.click(screen.getByText('화면 이동')); fireEvent.click(screen.getByText('화면 이동'));
    expect(mocks.guards[0]()).toBe(false);
    expect((screen.getByText('등록') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '추가 작성' } });
    await act(async () => { finish(); });
    expect((screen.getByLabelText('초안') as HTMLTextAreaElement).value).toBe('추가 작성');
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });
  it('전송 전 실패가 확실하면 수정된 내용으로 새 등록을 허용한다', async () => {
    mocks.push.mockRejectedValueOnce(Object.assign(new TeacherMessageSaveError('전송 전 실패'), { kind: 'unavailable' }));
    render(<AppProvider><Harness /></AppProvider>);
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '수정 전' } });
    fireEvent.click(screen.getByText('등록'));
    await waitFor(() => expect((screen.getByText('등록') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '수정 후' } });
    fireEvent.click(screen.getByText('등록'));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(2));
    expect(mocks.ids[0]).not.toBe(mocks.ids[1]);
    expect(mocks.push.mock.calls[1][1].text).toBe('수정 후');
  });
  it.each(['note', 'visit'] as const)('%s 응답 유실 후 재진입해도 같은 요청 키·원래 내용으로 확인하고 새 초안을 보존한다', async kind => {
    mocks.push.mockRejectedValueOnce(new Error('저장 결과 불명'));
    render(<AppProvider><Harness kind={kind} /></AppProvider>);
    fireEvent.click(screen.getByText('학생 선택'));
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '최초 전송 내용' } });
    fireEvent.click(screen.getByText('등록'));
    await waitFor(() => expect((screen.getByText('등록') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('화면 이동')); fireEvent.click(screen.getByText('화면 이동'));
    fireEvent.change(screen.getByLabelText('초안'), { target: { value: '추가 작성 내용' } });
    fireEvent.click(screen.getByText('등록'));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(2));
    expect(mocks.ids[0]).toBe(mocks.ids[1]);
    expect(mocks.push.mock.calls[1][1].text).toBe('최초 전송 내용');
    expect((screen.getByLabelText('초안') as HTMLTextAreaElement).value).toBe('추가 작성 내용');
  });
});
