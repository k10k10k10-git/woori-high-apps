/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), onPick: vi.fn(), onAdminLogin: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: { name: 'fixture-db' },
  ref: (_db: unknown, path: string) => ({ path }),
  get: mocks.get,
}));

import DemoClassPicker from './DemoClassPicker';

function snapshot(value: unknown) {
  return { exists: () => value !== null && value !== undefined, val: () => value };
}

describe('실제 반 선택 진입 화면', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.onPick.mockReset();
    mocks.onAdminLogin.mockReset();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('운영 반 노드에서 모든 반을 읽어 선택한다', async () => {
    mocks.get.mockResolvedValue(snapshot({
      '1-1-1': { teacher: '첫 담임' },
      '2-3-4': { teacher: '둘째 담임' },
    }));
    render(<DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} />);

    await screen.findByLabelText('부서');
    fireEvent.change(screen.getByLabelText('부서'), { target: { value: '2' } });
    expect(screen.getByLabelText('학년')).toHaveProperty('value', '3');
    expect(screen.getByLabelText('반')).toHaveProperty('value', '4');
    fireEvent.click(screen.getByRole('button', { name: /이 반으로 들어가기/ }));

    expect(mocks.onPick).toHaveBeenCalledWith({ ck: '2-3-4', teacherName: '둘째 담임' });
    expect((mocks.get.mock.calls[0][0] as { path: string }).path).toMatch(/^classes\/\d{4}$/);
    expect(screen.getByText(/운영 출석부에 저장됩니다/)).not.toBeNull();
  });

  it('교사 계정이 없는 반도 실제 반 노드에 있으면 선택된다', async () => {
    mocks.get.mockResolvedValue(snapshot({ '2-3-4': { teacher: '반 담임' } }));
    render(<DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} />);

    expect(await screen.findByLabelText('부서')).toHaveProperty('value', '2');
    expect(screen.getByLabelText('반')).toHaveProperty('value', '4');
    fireEvent.click(screen.getByRole('button', { name: /이 반으로 들어가기/ }));
    expect(mocks.onPick).toHaveBeenCalledWith({ ck: '2-3-4', teacherName: '반 담임' });
  });

  it('최근 반과 개인 계정 로그인을 제공한다', async () => {
    localStorage.setItem('demoLastSelection', JSON.stringify({ ck: '1-2-3', teacherName: '최근 담임' }));
    mocks.get.mockResolvedValue(snapshot({ '1-2-3': { teacher: '현재 담임' } }));
    render(<DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} />);

    fireEvent.click(await screen.findByRole('button', { name: /최근 선택한 반/ }));
    fireEvent.click(screen.getByRole('button', { name: /교사·관리자 로그인/ }));
    expect(mocks.onPick).toHaveBeenCalledWith({ ck: '1-2-3', teacherName: '현재 담임' });
    expect(mocks.onAdminLogin).toHaveBeenCalledTimes(1);
  });

  it('현재 연도 명단에 없는 최근 반은 제안하지 않는다', async () => {
    localStorage.setItem('demoLastSelection', JSON.stringify({ ck: '1-2-3', teacherName: '이전 담임' }));
    mocks.get.mockResolvedValue(snapshot({ '2-1-1': { teacher: '현재 담임' } }));
    render(<DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} />);

    await screen.findByLabelText('부서');
    expect(screen.queryByRole('button', { name: /최근 선택한 반/ })).toBeNull();
  });

  it('공용 인증 실패나 DB 조회 오류에는 선택을 잠근다', async () => {
    const failedAuth = render(<DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} signInError="공용 계정 오류" />);
    expect(screen.getByRole('alert').textContent).toContain('공용 계정 오류');
    expect(mocks.get).not.toHaveBeenCalled();
    failedAuth.unmount();

    mocks.get.mockRejectedValue(new Error('network unavailable'));
    render(<DemoClassPicker onPick={mocks.onPick} onAdminLogin={mocks.onAdminLogin} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('network unavailable');
    expect(screen.getByRole('button', { name: /이 반으로 들어가기/ })).toHaveProperty('disabled', true);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
  });
});
