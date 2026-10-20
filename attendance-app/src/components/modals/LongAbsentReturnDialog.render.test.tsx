/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ state: null as unknown, save: vi.fn(), toast: vi.fn(), close: vi.fn() }));
vi.mock('@/lib/longAbsentReturn', () => ({ returnLongAbsentStudent: m.save }));
vi.mock('@/utils/toast', () => ({ showToast: m.toast }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ getState: () => m.state as AppState }) }));
import { initialState } from '@/store/AppContext';
import LongAbsentReturnDialog from './LongAbsentReturnDialog';
const target = { year: 2026, classKey: '1-1-1', revision: 4, student: { id: 's', name: '합성 장결 학생', jang: true } };
beforeEach(() => {
  vi.clearAllMocks();
  m.state = { ...initialState, curYear: 2026, dataRevision: 4, userRole: { role: 'admin', name: '합성 관리자' }, dataLoaded: { classes: true, attendance: true, events: true } };
  m.save.mockImplementation(async (_input, check) => { if (!check()) throw new Error('조회 상태가 변경되었습니다'); });
});
afterEach(cleanup);
it('대상 학생·반·이력 보존을 설명하고 취소에는 저장하지 않는다', () => {
  render(<LongAbsentReturnDialog target={target} onClose={m.close} />);
  expect(screen.getByRole('dialog').textContent).toContain('합성 장결 학생');
  expect(screen.getByText(/과거 출석을 자동으로 수정하지/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(m.close).toHaveBeenCalledOnce(); expect(m.save).not.toHaveBeenCalled();
});
it('확인한 대상만 복귀하고 완료 후 창을 닫는다', async () => {
  render(<LongAbsentReturnDialog target={target} onClose={m.close} />);
  fireEvent.click(screen.getByRole('button', { name: '일반 명단으로 복귀' }));
  await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  expect(m.save.mock.calls[0][0]).toMatchObject({ ...target, actor: '합성 관리자' });
  expect(m.toast).toHaveBeenCalledOnce();
});
it('일반 학생의 장결 지정은 같은 확인창에서 영향과 복귀 방법을 알리고 저장한다', async () => {
  const active = { ...target, student: { ...target.student, jang: false }, nextJang: true };
  render(<LongAbsentReturnDialog target={active} onClose={m.close} />);
  const dialog = screen.getByRole('dialog', { name: '장결자로 지정' });
  expect(dialog.textContent).toContain('일반 출석 체크 명단에서 빠지고');
  expect(dialog.textContent).toContain('다시 일반 명단으로 복귀');
  expect(dialog.textContent).toContain('과거 출석을 자동으로 수정하지 않습니다.');
  fireEvent.click(screen.getByRole('button', { name: '장결자로 지정' }));
  await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  expect(m.save.mock.calls[0][0]).toMatchObject({ ...active, actor: '합성 관리자' });
  expect(m.toast).toHaveBeenCalledWith('장결자로 지정했습니다. 기존 출석 이력은 유지됩니다.', 'success');
});
it('장결 지정을 취소하면 원장 변경을 요청하지 않는다', () => {
  render(<LongAbsentReturnDialog target={{ ...target, student: { ...target.student, jang: false }, nextJang: true }} onClose={m.close} />);
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(m.close).toHaveBeenCalledOnce(); expect(m.save).not.toHaveBeenCalled();
});
it('저장 중 중복 클릭·취소·ESC를 막고 실패 시 오류와 재시도를 유지한다', async () => {
  let reject!: (error: Error) => void;
  m.save.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  render(<LongAbsentReturnDialog target={target} onClose={m.close} />);
  fireEvent.click(screen.getByRole('button', { name: '일반 명단으로 복귀' }));
  const saving = screen.getByRole('button', { name: '복귀 중…' });
  fireEvent.click(saving); fireEvent.keyDown(window, { key: 'Escape' });
  expect(saving).toHaveProperty('disabled', true); expect(m.save).toHaveBeenCalledOnce(); expect(m.close).not.toHaveBeenCalled();
  reject(new Error('명단이 변경되었습니다')); await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: '일반 명단으로 복귀' })).toHaveProperty('disabled', false);
  expect(m.toast).not.toHaveBeenCalled();
});
it.each([false, true].flatMap(nextJang => ['teacher', 'year', 'revision', 'data'].map(change => ({ nextJang, change }))))('대화창을 연 뒤 $change 상태가 바뀌면 장결 상태 변경($nextJang)을 막는다', async ({ nextJang, change }) => {
  render(<LongAbsentReturnDialog target={{ ...target, student: { ...target.student, jang: !nextJang }, nextJang }} onClose={m.close} />);
  const state = m.state as AppState;
  if (change === 'teacher') state.userRole = { role: 'teacher' };
  if (change === 'year') state.curYear = 2027;
  if (change === 'revision') state.dataRevision++;
  if (change === 'data') state.dataLoaded.classes = false;
  fireEvent.click(screen.getByRole('button', { name: nextJang ? '장결자로 지정' : '일반 명단으로 복귀' }));
  await screen.findByRole('alert'); expect(m.close).not.toHaveBeenCalled(); expect(m.toast).not.toHaveBeenCalled();
});
