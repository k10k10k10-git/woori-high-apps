/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const save = vi.hoisted(() => vi.fn());
vi.mock('@/lib/newFriendRemarks', () => ({ REMARK_LIMIT: 10000, saveFriendRemark: save, subscribeFriendRemark: vi.fn() }));
import NewFriendRemarkEditor from '@/components/admin/NewFriendRemarkEditor';
const props = { friendKey: '2026-sunday/f', name: '합성 학생', opened: '기존 비고', latest: { status: 'ready' as const, value: '기존 비고' }, isCurrent: () => true, onClose: vi.fn(), onRetry: vi.fn() };
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe('비고 편집', () => {
  it('기존 비고를 읽고 성공을 알린다', async () => {
    save.mockResolvedValue(undefined); render(<NewFriendRemarkEditor {...props} />);
    const input = screen.getByLabelText('비고 내용'); expect((input as HTMLTextAreaElement).value).toBe('기존 비고');
    fireEvent.change(input, { target: { value: '새 비고' } }); fireEvent.click(screen.getByRole('button', { name: '비고 저장' }));
    await waitFor(() => expect(screen.getByText('비고가 저장되었습니다.')).toBeTruthy());
    expect(save).toHaveBeenCalledWith(props.friendKey, '기존 비고', '새 비고', expect.any(Function));
  });
  it('실시간 변경은 작성 내용을 덮지 않고 명시 선택으로만 반영한다', () => {
    const view = render(<NewFriendRemarkEditor {...props} />);
    fireEvent.change(screen.getByLabelText('비고 내용'), { target: { value: '내 작성' } });
    view.rerender(<NewFriendRemarkEditor {...props} latest={{ status: 'ready', value: '다른 관리자 비고' }} />);
    expect((screen.getByLabelText('비고 내용') as HTMLTextAreaElement).value).toBe('내 작성');
    fireEvent.click(screen.getByRole('button', { name: '작성 내용 대신 최신 비고 사용' }));
    expect((screen.getByLabelText('비고 내용') as HTMLTextAreaElement).value).toBe('다른 관리자 비고');
  });
  it('저장 실패 때 작성 내용을 유지하며 재시도할 수 있다', async () => {
    save.mockRejectedValue(new Error('다른 관리자가 비고를 수정했습니다.')); render(<NewFriendRemarkEditor {...props} />);
    fireEvent.change(screen.getByLabelText('비고 내용'), { target: { value: '내 작성' } }); fireEvent.click(screen.getByRole('button', { name: '비고 저장' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('다른 관리자'));
    expect((screen.getByLabelText('비고 내용') as HTMLTextAreaElement).value).toBe('내 작성');
    expect((screen.getByRole('button', { name: '비고 저장' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('연결 실패 상태와 빈 비고를 구분한다', () => {
    render(<NewFriendRemarkEditor {...props} latest={{ status: 'error', value: null }} />);
    expect(screen.getByRole('alert').textContent).toContain('불러오지 못했습니다');
    expect((screen.getByRole('button', { name: '비고 저장' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('저장하지 않은 작성 내용은 닫기 확인을 취소하면 유지한다', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<NewFriendRemarkEditor {...props} />);
    fireEvent.change(screen.getByLabelText('비고 내용'), { target: { value: '작성 중' } }); fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(props.onClose).not.toHaveBeenCalled(); expect(confirm).toHaveBeenCalledOnce();
    expect((screen.getByLabelText('비고 내용') as HTMLTextAreaElement).value).toBe('작성 중'); confirm.mockRestore();
  });
});
