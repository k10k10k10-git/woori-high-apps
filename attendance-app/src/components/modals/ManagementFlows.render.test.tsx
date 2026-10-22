/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ state: null as unknown, get: vi.fn(), set: vi.fn(), transaction: vi.fn(), update: vi.fn(), dispatch: vi.fn(), restore: vi.fn(), removeCopy: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_db: unknown, path: string) => path, get: m.get, runTransaction: m.transaction, update: m.update, set: m.set, push: () => ({ key: 'operation' }) }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state as AppState, dispatch: m.dispatch }) }));
vi.mock('@/lib/rosterRestore', () => ({ restoreRoster: m.restore, permanentDeleteRosterCopy: m.removeCopy }));
vi.mock('@/lib/firebase/client', () => ({ db: {}, auth: { currentUser: { uid: 'synthetic-admin', getIdToken: async () => 'synthetic-token' } } }));
vi.mock('@/lib/managementSave', async original => ({ ...await original<typeof import('@/lib/managementSave')>(),
  runManagementSave: async (check: () => boolean, task: (session: { read: typeof m.read; write: typeof m.write; check: () => void }) => Promise<unknown>) => {
    if (!check()) throw new Error('조회 상태가 변경되었습니다.');
    return task({ read: m.read, write: m.write, check: () => { if (!check()) throw new Error('조회 상태가 변경되었습니다.'); } });
  },
}));
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
  m.state = { ...initialState, curYear: 2026, curPart: '1', curGrade: '1', curClass: '1', userRole: { role: 'admin' }, dataLoaded: { classes: true, attendance: true, events: true }, classData: { '1-1-1': { teacher: '시험 교사', students: [student] } } };
  m.get.mockResolvedValue({ val: () => ({}), exists: () => true });
  m.transaction.mockResolvedValue({ committed: true });
  m.restore.mockResolvedValue(undefined); m.removeCopy.mockResolvedValue(undefined);
  m.read.mockResolvedValue({ value: { teacher: '시험 교사', students: { s: student } }, etag: 'fresh' });
  m.write.mockResolvedValue(undefined);
});
afterEach(cleanup);
it('수정창이 열린 뒤 같은 SID의 인물이 교체되면 저장을 중단한다', async () => {
  const onClose = vi.fn();
  m.read.mockResolvedValue({ value: { students: { s: {
    ...student, personId: 'person_other', name: '다른 학생',
  } } }, etag: 'fresh' });
  render(<StudentModal editId="s" onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('학교'), { target: { value: '새 학교' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByRole('alert');
  expect(onClose).not.toHaveBeenCalled();
});
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
  m.write.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
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
  expect(m.write).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('반 번호 *'), { target: { value: '02' } });
  m.read.mockResolvedValue({ value: { teacher: '다른 교사' }, etag: 'fresh' });
  fireEvent.click(screen.getByRole('button', { name: '반 추가' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('같은 반'));
  expect(m.read.mock.calls[0][0]).toBe('classes/2026/1-1-2');
  expect(m.write).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
it('학생 편집은 변경하지 않은 원격 연락처를 보존한다', async () => {
  const onClose = vi.fn();
  m.read.mockResolvedValue({ value: { teacher: '교사', students: { s: { ...student, phone: 'remote', num: 7 } } }, etag: 'fresh' });
  render(<StudentModal editId="s" onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('학교'), { target: { value: '수정 학교' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(m.write.mock.calls[0][2]).toMatchObject({ students: { s: { phone: 'remote', school: '수정 학교', jang: true, num: 7 } } });
});
it('같은 학생 ID의 삭제본 두 개 중 선택한 실제 키만 영구 삭제한다', async () => {
  const first = { ...student, ck: '1-1-1', deletedAt: 1 };
  const second = { ...student, ck: '1-1-2', deletedAt: 2 };
  m.get.mockResolvedValue({ val: () => ({ students: { oldKey: first, newKey: second } }), exists: () => true });
  render(<TrashModal onClose={() => {}} />);
  const buttons = await screen.findAllByRole('button', { name: '영구 삭제' });
  fireEvent.click(buttons[0]);
  fireEvent.click(screen.getByRole('button', { name: '영구 삭제 확인' }));
  await waitFor(() => expect(m.removeCopy).toHaveBeenCalledOnce());
  expect(m.removeCopy.mock.calls[0][0]).toMatchObject({ year: 2026, kind: 'students', key: 'newKey', value: second });
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
  m.read.mockResolvedValue({ value: { '1-1-1': { teacher: '교사', students: { s: student } } }, etag: 'fresh' });
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
  const snapshot = { teacher: '교사', students: { s: student } };
  m.read.mockImplementation(async (path: string) => ({ value: path === 'classes' ? { 2026: { '1-1-1': snapshot } }
    : path === 'classes/2026' ? { '1-1-1': snapshot } : path.startsWith('trash/') ? null : snapshot, etag: 'fresh' }));
  m.write.mockRejectedValueOnce(new Error('백업 실패'));
  render(<RosterModal onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('학생 명단'), { target: { value: '신규,2010-01-01,01011112222' } });
  fireEvent.change(screen.getByLabelText('반영 방식'), { target: { value: 'replace' } });
  fireEvent.click(screen.getByRole('button', { name: '최신 명단과 비교하기' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '확인한 명단 반영' }));
  await screen.findByText('백업 실패');
  expect(m.write.mock.calls[0][0]).toMatch(/^trash\/2026\/classes\//);
  expect(m.write.mock.calls.some(([path]) => path.startsWith('classes/'))).toBe(false);
  expect(m.transaction).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect((screen.getByLabelText('학생 명단') as HTMLTextAreaElement).value).toContain('신규');
});
it('복원 결과 불명은 성공·사본 정리로 표시하지 않고 같은 사본을 유지한다', async () => {
  const item = { ...student, ck: '1-1-1', deletedAt: 1 };
  m.get.mockResolvedValue({ val: () => ({ students: { old: item } }) });
  m.restore.mockRejectedValueOnce(new Error('복원 결과를 확인하지 못했습니다. 목록을 다시 확인해 주세요.'));
  render(<TrashModal onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: '복원' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('복원 결과를 확인하지 못했습니다'));
  expect(screen.queryByText('명단 복원과 삭제 목록 정리가 함께 완료되었습니다.')).toBeNull();
  expect(screen.queryByRole('button', { name: '삭제 목록 정리' })).toBeNull();
  expect(m.removeCopy).not.toHaveBeenCalled();
  expect(m.transaction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '복원' }));
  await screen.findByText('최근 삭제된 항목이 없습니다.');
  expect(m.restore).toHaveBeenCalledTimes(2);
  expect(m.restore.mock.calls.map(([input]) => input.value)).toEqual([item, item]);
});
it('실패 후 새로고침한 사본 내용이 바뀌면 최신 확인 대상으로 다시 검증한다', async () => {
  const item = { ...student, ck: '1-1-1', deletedAt: 1 };
  m.get.mockResolvedValue({ val: () => ({ students: { old: item } }) });
  m.restore.mockRejectedValueOnce(new Error('확인 필요'));
  render(<TrashModal onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: '복원' }));
  await screen.findByRole('alert');
  await waitFor(() => expect((screen.getByRole('button', { name: '목록 새로고침' }) as HTMLButtonElement).disabled).toBe(false));
  m.get.mockResolvedValue({ val: () => ({ students: { old: { ...item, deletedAt: 2 } } }) });
  fireEvent.click(screen.getByRole('button', { name: '목록 새로고침' }));
  await screen.findByRole('button', { name: '복원' });
  expect(screen.queryByRole('button', { name: '삭제 목록 정리' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '복원' }));
  await screen.findByText('최근 삭제된 항목이 없습니다.');
  expect(m.restore.mock.calls[1][0].value.deletedAt).toBe(2);
});
