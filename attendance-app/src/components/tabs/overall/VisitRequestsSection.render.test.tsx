/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  onValue: vi.fn(),
  dispatch: vi.fn(),
  state: {} as typeof initialState,
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
}));

vi.mock('@/lib/db', () => ({ db: {}, ref: mocks.ref, onValue: mocks.onValue, update: mocks.update }));
vi.mock('@/store/AppContext', async original => ({
  ...await original<typeof import('@/store/AppContext')>(),
  useApp: () => ({ state: mocks.state, dispatch: mocks.dispatch }),
}));

import VisitRequestsSection from './VisitRequestsSection';

beforeEach(() => {
  mocks.state = { ...initialState, curYear: 2026, classData: { '1-1-1': { teacher: '김교사', students: [] } } };
  mocks.dispatch.mockClear();
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.ref.mockClear();
  mocks.onValue.mockReset().mockImplementation((_query, receive) => {
    receive({ val: () => ({ '1-1-1': {
      open: { kind: 'visit', studentId: 's1', studentName: '합성 학생', text: '연락 필요', status: 'open', createdAt: 1, author: '김교사' },
      done: { kind: 'visit', studentId: 's2', studentName: '완료 학생', text: '확인 완료', status: 'done', createdAt: 2, author: '김교사' },
      note: { kind: 'note', text: '특이사항', createdAt: 3, author: '김교사' },
    } }) });
    return vi.fn();
  });
});
afterEach(cleanup);

describe('관리자 심방 요청', () => {
  it('이동 학생을 현재 반 필터에서 찾고 연락·이력은 현재 학생, 상태 저장은 원래 요청 경로를 사용한다', async () => {
    mocks.state.classData = { '2-1-7': { teacher: '새교사', students: [{ id: 'moved', personId: 'person_student_a', name: '합성 학생', phone: '010-0000-1111', pphone: '010-0000-2222' }] } };
    mocks.onValue.mockImplementation((_query, receive) => {
      receive({ val: () => ({ '1-1-1': { open: { kind: 'visit', studentId: 's1', studentPersonId: 'person_student_a', studentName: '합성 학생', text: '연락 필요' } } }) }); return vi.fn();
    });
    render(<VisitRequestsSection filter={{ part: '2', classKey: '2-1-7' }} />);
    expect(screen.getByText('현재 2부 1학년 7반 · 새교사')).toBeTruthy();
    expect(screen.getByText('요청 당시 1부 1학년 1반')).toBeTruthy();
    expect(screen.getByRole('link', { name: '합성 학생 학생에게 전화' }).getAttribute('href')).toBe('tel:01000001111');
    fireEvent.click(screen.getByRole('button', { name: '출석 이력 보기' }));
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'OPEN_HISTORY_MODAL', payload: { sid: 'moved', ck: '2-1-7' } });
    fireEvent.click(screen.getByRole('button', { name: '처리 완료' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ path: 'suggestions/2026/1-1-1/open' }, expect.objectContaining({ status: 'done' })));
  });
  it('연결이 불확실하면 연락처와 이력 버튼을 표시하지 않는다', () => {
    mocks.state.classData = { '1-1-1': { students: [{ id: 's1', name: '다른 학생', phone: '010-0000-9999' }] } };
    render(<VisitRequestsSection />);
    expect(screen.getByText(/학생 연결 확인 필요/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button', { name: '출석 이력 보기' })).toBeNull();
  });
  it('제목 건수는 현재 선택한 상태의 명단과 일치한다', () => {
    render(<VisitRequestsSection initialView="done" filter={{ search: '완료 학생' }} />);
    expect(screen.getByRole('heading', { name: '심방 요청 1건' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /처리 완료 1/ }).getAttribute('aria-pressed')).toBe('true');
  });
  it('확인 필요와 처리 완료를 분리하고 상태만 안전하게 갱신한다', async () => {
    render(<VisitRequestsSection />);
    expect(screen.getByText('합성 학생')).toBeTruthy();
    expect(screen.queryByText('완료 학생')).toBeNull();
    expect(screen.queryByText('특이사항')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '처리 완료' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(
      { path: 'suggestions/2026/1-1-1/open' },
      expect.objectContaining({ status: 'done' }),
    ));

    fireEvent.click(screen.getByRole('button', { name: /처리 완료 1/ }));
    expect(screen.getByText('완료 학생')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 열기' })).toBeTruthy();
  });
  it('심방 직접 링크가 처리 완료 건도 찾아 초점을 옮긴다', async () => {
    render(<VisitRequestsSection requestKey="1-1-1/done" />);
    const target = await screen.findByRole('article', { name: '완료 학생 심방 요청' });
    await waitFor(() => expect(target).toBe(document.activeElement));
    expect(screen.getByRole('button', { name: /처리 완료 1/ }).getAttribute('aria-pressed')).toBe('true');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('심방 직접 링크의 대상이 사라지면 빈 목록과 구분해 안내한다', () => {
    render(<VisitRequestsSection requestKey="1-1-1/missing" />);
    expect(screen.getByRole('status').textContent).toContain('요청한 심방 건을 찾을 수 없습니다');
  });
});
