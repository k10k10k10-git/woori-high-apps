/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  onChangeClass: vi.fn(),
  onAdminLogin: vi.fn(),
  onLogout: vi.fn(),
  state: { current: null as unknown },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/attendance',
}));

vi.mock('@/store/AppContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/store/AppContext')>();
  return {
    ...actual,
    useApp: () => ({ state: mocks.state.current as AppState, dispatch: mocks.dispatch }),
  };
});

import { initialState } from '@/store/AppContext';
import ClassTabBar from './ClassTabBar';
import TabNav from './TabNav';
import TopBar from './TopBar';

function teacherState(): AppState {
  return {
    ...initialState,
    userRole: { role: 'teacher', part: '1', grade: '1', class: '1', name: '김교사' },
    curPart: '1',
    curGrade: '1',
    curClass: '1',
    classData: {
      '1-1-1': { teacher: '김교사', students: [] },
    },
    saveStatus: 'saved',
  };
}

describe('교사 공통 셀', () => {
  beforeEach(() => {
    mocks.state.current = teacherState();
    mocks.dispatch.mockReset();
    mocks.onChangeClass.mockReset();
    mocks.onAdminLogin.mockReset();
    mocks.onLogout.mockReset();
  });

  afterEach(() => cleanup());

  it('하단 메뉴를 페이지 내비게이션으로 제공하고 현재 경로를 표시한다', () => {
    render(<TabNav />);

    const navigation = screen.getByRole('navigation', { name: '메인 메뉴' });
    const links = within(navigation).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(screen.getByRole('link', { name: '출석 페이지' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '통계 페이지' }).hasAttribute('aria-current')).toBe(false);
    expect(within(navigation).queryAllByRole('tab')).toHaveLength(0);
  });

  it('반 선택을 현재 상태가 드러나는 토글 그룹으로 제공한다', () => {
    render(<ClassTabBar />);

    const group = screen.getByRole('group', { name: '반 선택' });
    const currentClass = within(group).getByRole('button', { name: '1반 · 김교사' });
    expect(currentClass.getAttribute('aria-pressed')).toBe('true');
    expect(within(group).queryAllByRole('tab')).toHaveLength(0);

    fireEvent.click(currentClass);
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'SET_CLASS', payload: '1' });
  });

  it('저장 상태를 알리고 데모 액션을 그대로 유지한다', () => {
    const { container } = render(
      <TopBar
        onLogout={mocks.onLogout}
        demo={{ onChangeClass: mocks.onChangeClass, onAdminLogin: mocks.onAdminLogin }}
      />,
    );

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('저장됨');
    expect(container.querySelector('.topbar-title svg')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '반 바꾸기' }));
    fireEvent.click(screen.getByRole('button', { name: '교사·관리자 로그인' }));
    expect(mocks.onChangeClass).toHaveBeenCalledTimes(1);
    expect(mocks.onAdminLogin).toHaveBeenCalledTimes(1);
  });
});
