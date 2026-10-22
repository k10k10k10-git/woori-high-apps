/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StudentDuplicateNotice from './StudentDuplicateNotice';

afterEach(cleanup);
it('중복 의심과 동명이인을 구분하고 연락처 원값·자동 삭제 없이 양쪽 학생 상세만 연다', () => {
  const a = { id: 'a', name: '합성학생', birth: '2010. 01. 02', phone: '010-1234-5678', personId: 'old' };
  const b = { id: 'b', name: '합성학생', birth: '2010-01-02', personId: 'new', jang: true };
  const onOpen = vi.fn();
  const view = render(<StudentDuplicateNotice classes={{ '2-1-4': { students: [a] }, '2-1-6': { students: [b] } }} onOpen={onOpen} />);
  expect(view.container.textContent).toContain('중복 의심 1건');
  expect(view.container.textContent).not.toContain(a.phone);
  fireEvent.click(screen.getByText(/중복 등록 점검/));
  fireEvent.click(screen.getByRole('button', { name: /합성학생 2부 1학년 6반/ }));
  expect(onOpen).toHaveBeenCalledWith('2-1-6', b, expect.any(HTMLButtonElement));
  expect(view.container.textContent).toContain('합치거나 삭제하지 않습니다');
  view.rerender(<StudentDuplicateNotice classes={{ '2-1-4': { students: [a] }, '2-1-6': { students: [{ ...b, birth: '2010-02-03' }] } }} onOpen={onOpen} />);
  expect(view.container.textContent).toContain('중복 의심 없음');
  expect(view.container.textContent).toContain('동명이인 확인 1건');
});
it('후보가 없어도 정보 부족의 한계를 알리고 쓰기 동작을 만들지 않는다', () => {
  const view = render(<StudentDuplicateNotice classes={{}} onOpen={vi.fn()} />);
  expect(view.container.textContent).toContain('비교 조건이 일치하는 학생 쌍이 없습니다');
  expect(view.container.querySelectorAll('button')).toHaveLength(0);
});
