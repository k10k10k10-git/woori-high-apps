/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: { curYear: 2026, draftSession: 1, userRole: { role: 'admin' } },
  auth: { currentUser: { uid: 'first-admin' } as { uid: string } | null },
}));
vi.mock('@/store/AppContext', () => ({ useApp: () => ({ state: mocks.state }) }));
vi.mock('@/lib/firebase/client', () => ({ auth: mocks.auth }));
import { clearAdminViewState, useAdminViewState } from './useAdminViewState';

function Harness({ page = 'directory' }: { page?: string }) {
  const [view, update] = useAdminViewState(page, { part: 'all', query: '', selected: '', open: false as boolean }, ['query']);
  return <><input aria-label="검색" value={view.query} onChange={event => update({ query: event.target.value })} />
    <output>{JSON.stringify(view)}</output><button onClick={() => { update({ part: '2' }); update({ selected: '2-1-1/s', open: true }); }}>선택</button></>;
}

beforeEach(() => {
  clearAdminViewState();
  mocks.auth.currentUser = { uid: 'first-admin' };
  mocks.state = { curYear: 2026, draftSession: 1, userRole: { role: 'admin' } };
});
afterEach(() => { cleanup(); clearAdminViewState(); });

describe('관리자 보기 복원', () => {
  it('같은 로그인 세션 메뉴 왕복에서는 검색과 상세를 보존하되 검색어는 저장소에 남기지 않는다', () => {
    const first = render(<Harness />);
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: '010-1234-5678' } });
    fireEvent.click(screen.getByText('선택'));
    expect(JSON.parse(screen.getByRole('status').textContent ?? '{}')).toMatchObject({ part: '2', selected: '2-1-1/s', open: true });
    expect(JSON.stringify(sessionStorage)).not.toContain('010-1234-5678');
    expect(sessionStorage.getItem('woori-admin-ui:first-admin/2026/directory')).toContain('2-1-1/s');
    first.unmount();
    render(<Harness />);
    expect((screen.getByLabelText('검색') as HTMLInputElement).value).toBe('010-1234-5678');
    expect(screen.getByRole('status').textContent).toContain('2-1-1/s');
  });
  it('사용자·연도·페이지를 격리하고 다른 계정 진입 때 이전 계정 상태를 버린다', () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(screen.getByText('선택'));
    mocks.state = { ...mocks.state, curYear: 2025 };
    rerender(<Harness />);
    expect(screen.getByRole('status').textContent).toContain('"part":"all"');
    mocks.state = { ...mocks.state, curYear: 2026 };
    rerender(<Harness page="pastoral" />);
    expect(screen.getByRole('status').textContent).toContain('"part":"all"');
    mocks.auth.currentUser = { uid: 'other-admin' };
    rerender(<Harness />);
    expect(screen.getByRole('status').textContent).toContain('"selected":""');
    expect(sessionStorage.getItem('woori-admin-ui:first-admin/2026/directory')).toBeNull();
  });
  it('새 로그인 세션에는 비민감 조건만 복원하고 로그아웃 정리·저장소 차단을 견딘다', () => {
    const first = render(<Harness />);
    fireEvent.click(screen.getByText('선택'));
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: '개인 검색어' } });
    first.unmount();
    mocks.state = { ...mocks.state, draftSession: 2 };
    const next = render(<Harness />);
    expect((screen.getByLabelText('검색') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('status').textContent).toContain('2-1-1/s');
    act(clearAdminViewState);
    next.unmount();
    render(<Harness />);
    expect(screen.getByRole('status').textContent).toContain('"selected":""');
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('차단'); });
    fireEvent.click(screen.getByText('선택'));
    expect(screen.getByRole('status').textContent).toContain('2-1-1/s');
    blocked.mockRestore();
  });
});
