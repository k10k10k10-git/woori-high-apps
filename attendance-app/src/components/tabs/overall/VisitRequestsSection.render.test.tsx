/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  onValue: vi.fn(),
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
}));

vi.mock('@/lib/db', () => ({ db: {}, ref: mocks.ref, onValue: mocks.onValue, update: mocks.update }));
vi.mock('@/store/AppContext', async original => ({
  ...await original<typeof import('@/store/AppContext')>(),
  useApp: () => ({ state: { ...initialState, curYear: 2026, classData: { '1-1-1': { teacher: '김교사', students: [] } } } }),
}));

import VisitRequestsSection from './VisitRequestsSection';

beforeEach(() => {
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
});
