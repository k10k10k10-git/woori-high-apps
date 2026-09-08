/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ state: null as unknown, get: vi.fn(), set: vi.fn(), transaction: vi.fn(), update: vi.fn(), dispatch: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_db: unknown, path: string) => path, get: m.get, runTransaction: m.transaction, update: m.update, set: m.set, push: () => ({ key: 'operation' }) }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state as AppState, dispatch: m.dispatch }) }));
import { initialState } from '@/store/AppContext';
import ManagementDialog from './ManagementDialog';
import AddClassModal from './AddClassModal';
import TeacherModal from './TeacherModal';
import StudentModal from './StudentModal';
import TrashModal from './TrashModal';
import RosterModal from './RosterModal';
const student = { id: 's', name: '시험 학생', phone: 'old', personId: 'person', jang: true };
beforeEach(() => {
  vi.clearAllMocks();
  m.state = { ...initialState, curYear: 2026, curPart: '1', curGrade: '1', curClass: '1', userRole: { role: 'admin' }, classData: { '1-1-1': { teacher: '시험 교사', students: [student] } } };
  m.get.mockResolvedValue({ val: () => ({}), exists: () => true });
  m.transaction.mockResolvedValue({ committed: true });
});
afterEach(cleanup);
it('작성 중 닫기는 확인을 거치며 저장 중 ESC·배경 클릭은 창을 닫지 않는다', () => {
  const onClose = vi.fn();
  const { rerender } = render(<ManagementDialog title="시험 편집" dirty onClose={onClose}>{() => <input aria-label="내용" />}</ManagementDialog>);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByRole('button', { name: '계속 작성' })).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
  rerender(<ManagementDialog title="시험 편집" busy onClose={onClose}>{() => <input aria-label="내용" />}</ManagementDialog>);
  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.click(screen.getByRole('dialog').parentElement!);
  expect(onClose).not.toHaveBeenCalled();
});
it('교사 저장 실패는 입력을 보존하고 같은 창에서 다시 저장할 수 있다', async () => {
  const onClose = vi.fn();
  m.transaction.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ committed: true });
  render(<TeacherModal onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('교사 이름'), { target: { value: '수정 교사' } });
  fireEvent.click(screen.getByRole('button', { name: '교사 정보 저장' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('교사 이름') as HTMLInputElement).value).toBe('수정 교사');
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '교사 정보 저장' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});
it('반 추가는 올바른 정수만 받고 동시 생성 충돌 시 창을 유지한다', async () => {
  const onClose = vi.fn();
  render(<AddClassModal onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('반 번호 *'), { target: { value: '1.5' } });
  fireEvent.click(screen.getByRole('button', { name: '반 추가' }));
  expect(m.transaction).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('반 번호 *'), { target: { value: '02' } });
  m.transaction.mockImplementation(async (_path, change) => ({ committed: change({ teacher: '다른 교사' }) !== undefined }));
  fireEvent.click(screen.getByRole('button', { name: '반 추가' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('같은 반'));
  expect(m.transaction.mock.calls[0][0]).toBe('classes/2026/1-1-2');
  expect(onClose).not.toHaveBeenCalled();
});
it('학생 편집은 변경하지 않은 원격 연락처를 보존한다', async () => {
  const onClose = vi.fn(); let saved: unknown;
  m.transaction.mockImplementation(async (_path, change) => { saved = change({ teacher: '교사', students: { s: { ...student, phone: 'remote', num: 7 } } }); return { committed: Boolean(saved) }; });
  render(<StudentModal editId="s" onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('학교'), { target: { value: '수정 학교' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(saved).toMatchObject({ students: { s: { phone: 'remote', school: '수정 학교', jang: true, num: 7 } } });
});
it('같은 학생 ID의 삭제본 두 개 중 선택한 실제 키만 영구 삭제한다', async () => {
  const first = { ...student, ck: '1-1-1', deletedAt: 1 };
  const second = { ...student, ck: '1-1-2', deletedAt: 2 };
  m.get.mockResolvedValue({ val: () => ({ students: { oldKey: first, newKey: second } }), exists: () => true });
  m.transaction.mockImplementation(async (_path, change) => ({ committed: change(second) === null }));
  render(<TrashModal onClose={() => {}} />);
  const buttons = await screen.findAllByRole('button', { name: '영구 삭제' });
  fireEvent.click(buttons[0]);
  fireEvent.click(screen.getByRole('button', { name: '영구 삭제 확인' }));
  await waitFor(() => expect(m.transaction).toHaveBeenCalled());
  expect(m.transaction.mock.calls[0][0]).toBe('trash/2026/students/newKey');
  await waitFor(() => expect(screen.getAllByRole('button', { name: '영구 삭제' })).toHaveLength(1));
});
it('삭제 목록 조회 실패는 빈 목록으로 표시하지 않고 재시도를 제공한다', async () => {
  m.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ val: () => ({}) });
  render(<TrashModal onClose={() => {}} />);
  const error = await screen.findByRole('alert');
  fireEvent.click(within(error).getByRole('button', { name: '다시 불러오기' }));
  await screen.findByText('최근 삭제된 항목이 없습니다.');
});

it('명단 미리보기 후 입력이 바뀌면 오래된 계획을 적용하지 않는다', async () => {
  m.get.mockResolvedValue({ val: () => ({ 2026: { '1-1-1': { teacher: '교사', students: { s: student } } } }), exists: () => true });
  render(<RosterModal onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('학생 명단'), { target: { value: '신규,2010-01-01,01011112222' } });
  fireEvent.click(screen.getByRole('button', { name: '최신 명단과 비교하기' }));
  await screen.findByRole('region', { name: '명단 반영 미리보기' });
  fireEvent.change(screen.getByLabelText('학생 명단'), { target: { value: '변경된 이름' } });
  expect((screen.getByRole('button', { name: '확인한 명단 반영' }) as HTMLButtonElement).disabled).toBe(true);
  expect(m.transaction).not.toHaveBeenCalled();
});
it('대화상자가 닫히면 배경 잠금과 열기 버튼 초점이 복구된다', async () => {
  const root = document.createElement('div');
  const button = document.createElement('button'); root.append(button); document.body.append(root); button.focus();
  const { unmount } = render(<ManagementDialog title="시험" onClose={() => {}}>{() => <button>내부</button>}</ManagementDialog>);
  expect(root.inert).toBe(true);
  unmount();
  expect(root.inert).toBeFalsy();
  expect(document.activeElement).toBe(button);
  root.remove();
});

it('명단 교체 백업에 실패하면 원장 저장을 시작하지 않고 입력을 보존한다', async () => {
  const onClose = vi.fn();
  m.get.mockResolvedValue({ val: () => ({ 2026: { '1-1-1': { teacher: '교사', students: { s: student } } } }) });
  m.set.mockRejectedValueOnce(new Error('백업 실패'));
  render(<RosterModal onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('학생 명단'), { target: { value: '신규,2010-01-01,01011112222' } });
  fireEvent.change(screen.getByLabelText('반영 방식'), { target: { value: 'replace' } });
  fireEvent.click(screen.getByRole('button', { name: '최신 명단과 비교하기' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '확인한 명단 반영' }));
  await screen.findByText('백업 실패');
  expect(m.transaction).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect((screen.getByLabelText('학생 명단') as HTMLTextAreaElement).value).toContain('신규');
});
it('복원 후 사본 정리 실패는 복원을 반복하지 않고 정리만 재시도한다', async () => {
  const item = { ...student, ck: '1-1-1', deletedAt: 1 };
  m.get.mockResolvedValue({ val: () => ({ students: { old: item } }) });
  m.transaction.mockResolvedValueOnce({ committed: true }).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ committed: true });
  render(<TrashModal onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: '복원' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('명단 복원은 완료'));
  fireEvent.click(screen.getByRole('button', { name: '삭제 목록 정리' }));
  await screen.findByText('최근 삭제된 항목이 없습니다.');
  expect(m.transaction.mock.calls.map(call => call[0])).toEqual(['classes/2026/1-1-1', 'trash/2026/students/old', 'trash/2026/students/old']);
});
it('복원 후 새로고침한 레거시 사본 내용이 다르면 이전 복원으로 간주하지 않는다', async () => {
  const item = { ...student, ck: '1-1-1', deletedAt: 1 };
  m.get.mockResolvedValue({ val: () => ({ students: { old: item } }) });
  m.transaction.mockResolvedValueOnce({ committed: true }).mockRejectedValueOnce(new Error('offline'));
  render(<TrashModal onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: '복원' }));
  await screen.findByRole('button', { name: '삭제 목록 정리' });
  await waitFor(() => expect((screen.getByRole('button', { name: '목록 새로고침' }) as HTMLButtonElement).disabled).toBe(false));
  m.get.mockResolvedValue({ val: () => ({ students: { old: { ...item, deletedAt: 2 } } }) });
  fireEvent.click(screen.getByRole('button', { name: '목록 새로고침' }));
  await screen.findByRole('button', { name: '복원' });
  expect(screen.queryByRole('button', { name: '삭제 목록 정리' })).toBeNull();
});
