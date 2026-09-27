/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemoClassPicker from './DemoClassPicker';

const onPick = vi.fn();
const onAdminLogin = vi.fn();

describe('가상 데모 반 선택', () => {
  beforeEach(() => { localStorage.clear(); onPick.mockClear(); onAdminLogin.mockClear(); });
  afterEach(() => cleanup());

  it('부서·학년·반을 골라 가상 출석부로 이동한다', () => {
    render(<DemoClassPicker onPick={onPick} onAdminLogin={onAdminLogin} />);
    fireEvent.change(screen.getByLabelText('부서'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('학년'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('반'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /이 반으로 들어가기/ }));

    expect(onPick).toHaveBeenCalledWith({ ck: '2-3-2', teacherName: '' });
    expect(screen.getByText(/운영 출석부에 저장되지 않습니다/)).not.toBeNull();
  });

  it('이전 실제 반 이름을 표시하지 않고 교사·관리자 로그인을 안내한다', () => {
    localStorage.setItem('demoLastSelection', JSON.stringify({ ck: '1-2-3', teacherName: '실제 담임' }));
    render(<DemoClassPicker onPick={onPick} onAdminLogin={onAdminLogin} />);
    expect(screen.queryByText('실제 담임')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /최근 선택한 반/ }));
    fireEvent.click(screen.getByRole('button', { name: /실제 출석부 로그인/ }));
    expect(onPick).toHaveBeenCalledWith({ ck: '1-2-3', teacherName: '' });
    expect(onAdminLogin).toHaveBeenCalledTimes(1);
  });
});
