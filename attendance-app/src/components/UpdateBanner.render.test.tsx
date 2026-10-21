/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UpdateBanner from './UpdateBanner';
afterEach(cleanup);
describe('업데이트 안내', () => {
  it('저장 중에는 새로고침을 막고 안내를 닫을 수 있다', () => {
    const reload = vi.fn(), dismiss = vi.fn();
    const view = render(<UpdateBanner saving onReload={reload} onDismiss={dismiss} />);
    const button = screen.getByRole('button', { name: '저장 중' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button); expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '나중에' })); expect(dismiss).toHaveBeenCalledOnce();
    view.rerender(<UpdateBanner onReload={reload} onDismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button', { name: '새로고침' })); expect(reload).toHaveBeenCalledOnce();
  });
});
