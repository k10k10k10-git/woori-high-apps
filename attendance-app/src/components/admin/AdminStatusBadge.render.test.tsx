/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AdminStatusBadge from './AdminStatusBadge';

afterEach(cleanup);
it('색상과 서로 다른 SVG 표식으로 상태를 구분하며 문구를 유지한다', () => {
  const labels = ['연락 필요', '출석 입력 확인', '출석 흐름 확인', '초기 4주 출석 양호', '관찰 기간 부족'];
  const { container } = render(<>{labels.map(label => <AdminStatusBadge key={label} label={label} />)}</>);
  const badges = [...container.querySelectorAll('.admin-status-badge')];
  expect(badges.map(badge => badge.getAttribute('data-status-tone'))).toEqual(['danger', 'warning', 'info', 'success', 'neutral']);
  expect(new Set(badges.map(badge => badge.querySelector('svg')!.innerHTML)).size).toBe(5);
  for (const label of labels) expect(screen.getByText(label)).toBeTruthy();
  for (const svg of container.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect(screen.queryByRole('button')).toBeNull();
});
it('상세 열기는 이름이 유지되는 네이티브 버튼이며 기존 콜백을 실행한다', () => {
  const open = vi.fn();
  render(<AdminStatusBadge label="연락 필요" onClick={open} />);
  const button = screen.getByRole('button', { name: '연락 필요' });
  expect(button.getAttribute('type')).toBe('button');
  button.focus(); expect(document.activeElement).toBe(button);
  fireEvent.click(button); expect(open).toHaveBeenCalledTimes(1);
});
it('숫자나 기존 문구를 바꾸지 않고 명시한 상태 표시를 사용한다', () => {
  render(<AdminStatusBadge label="3회 이상 결석 후 출석" tone="success" />);
  expect(screen.getByText('3회 이상 결석 후 출석').closest('[data-status-tone]')?.getAttribute('data-status-tone')).toBe('success');
});
