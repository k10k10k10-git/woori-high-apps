/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemoAttendance from './DemoAttendance';

const selection = { ck: '1-2-3', teacherName: '' };

describe('운영 DB와 분리된 출석 데모', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-23T03:00:00Z')); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('가상 출석을 화면에서만 변경하고 표 조회에도 반영한다', () => {
    const onAdminLogin = vi.fn();
    render(<DemoAttendance selection={selection} onChangeClass={vi.fn()} onAdminLogin={onAdminLogin} />);
    expect(screen.getByText(/실제 학생 정보와 연결되지 않습니다/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '실제 출석부 로그인' }));
    expect(onAdminLogin).toHaveBeenCalledTimes(1);
    const button = screen.getByRole('button', { name: '가상 학생 1 출석' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: '출석부 조회' }));
    expect(screen.getByRole('row', { name: /가상 학생 1 출석/ })).not.toBeNull();
  });
});
