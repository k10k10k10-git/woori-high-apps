/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  onPick: vi.fn(),
  onAdminLogin: vi.fn(),
  lastSelection: null as { ck: string; teacherName: string } | null,
}));

vi.mock('@/lib/db', () => ({
  db: { name: 'fixture-db' },
  ref: (_db: unknown, path: string) => ({ path }),
  get: mocks.get,
}));

vi.mock('@/lib/demo', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/demo')>();
  return {
    ...actual,
    loadLastDemoSelection: () => mocks.lastSelection,
  };
});

import DemoClassPicker from './DemoClassPicker';

function snapshot(value: unknown) {
  return {
    exists: () => value !== null && value !== undefined,
    val: () => value,
  };
}

function teacherRole(part: string, grade: string, cls: string, name: string): UserRole {
  return { role: 'teacher', part, grade, class: cls, name, email: `${part}-${grade}-${cls}@example.com` };
}

describe('데모 반 선택 진입 화면', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.onPick.mockReset();
    mocks.onAdminLogin.mockReset();
    mocks.lastSelection = null;
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it('1부·1학년이 없어도 실제 첫 옵션을 유효한 선택으로 파생한다', async () => {
    mocks.get.mockResolvedValue(snapshot({ only: teacherRole('2', '3', '4', '김교사') }));

    render(<DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} />);

    expect(await screen.findByLabelText('부서')).toHaveProperty('value', '2');
    expect(screen.getByLabelText('학년')).toHaveProperty('value', '3');
    expect(screen.getByLabelText('반')).toHaveProperty('value', '4');

    fireEvent.click(screen.getByRole('button', { name: /이 반으로 들어가기/ }));
    expect(mocks.onPick).toHaveBeenCalledWith({ ck: '2-3-4', teacherName: '김교사' });
  });

  it('상위 선택을 바꾸면 학년과 반을 새 범위로 함께 파생한다', async () => {
    mocks.get.mockResolvedValue(snapshot({
      first: teacherRole('1', '1', '1', '박교사'),
      second: teacherRole('2', '3', '4', '김교사'),
    }));

    render(<DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} />);
    const partSelect = await screen.findByLabelText('부서');

    fireEvent.change(partSelect, { target: { value: '2' } });
    expect(screen.getByLabelText('학년')).toHaveProperty('value', '3');
    expect(screen.getByLabelText('반')).toHaveProperty('value', '4');

    fireEvent.click(screen.getByRole('button', { name: /이 반으로 들어가기/ }));
    expect(mocks.onPick).toHaveBeenLastCalledWith({ ck: '2-3-4', teacherName: '김교사' });
  });

  it('최근 반·관리자 진입과 실제 저장 안내 계약을 유지한다', async () => {
    mocks.lastSelection = { ck: '1-2-3', teacherName: '최근교사' };
    mocks.get.mockResolvedValue(snapshot({ current: teacherRole('1', '1', '1', '박교사') }));

    const { container } = render(
      <DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} />,
    );

    const recent = await screen.findByRole('button', { name: /최근 선택한 반/ });
    expect(screen.getByText(/입력한 내용은 실제로 저장됩니다/)).not.toBeNull();
    expect(container.querySelector('.entry-brand svg')).not.toBeNull();
    expect(container.textContent).not.toContain('📋');

    fireEvent.click(recent);
    fireEvent.click(screen.getByRole('button', { name: /관리자 계정으로 접근/ }));
    expect(mocks.onPick).toHaveBeenCalledWith({ ck: '1-2-3', teacherName: '최근교사' });
    expect(mocks.onAdminLogin).toHaveBeenCalledTimes(1);
  });

  it('로딩과 오류 상태를 보조기기에 알린다', async () => {
    mocks.get.mockImplementation(() => new Promise(() => undefined));
    const pending = render(
      <DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} />,
    );
    expect(screen.getByRole('status').textContent).toContain('반 목록을 불러오는 중입니다');
    pending.unmount();

    render(
      <DemoClassPicker
        onPick={mocks.onPick}
        onAdminLogin={mocks.onAdminLogin}
        signInError="데모 로그인에 실패했습니다"
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('데모 로그인에 실패했습니다');
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
  });

  it('반 목록 조회가 실패하면 원인을 알리고 진입을 잠근다', async () => {
    mocks.get.mockRejectedValue(new Error('network unavailable'));
    render(<DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('network unavailable');
    expect(screen.getByRole('button', { name: /이 반으로 들어가기/ })).toHaveProperty('disabled', true);
  });
});
