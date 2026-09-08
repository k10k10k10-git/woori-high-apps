/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
import type { ReportFriend } from '@/utils/pastoralReport';
const mocks = vi.hoisted(() => ({ state: {} as typeof initialState, demo: false, receive: (() => {}) as (friends: ReportFriend[]) => void, fail: (() => {}) as (error: Error) => void, stop: vi.fn(), subscribe: vi.fn() }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: mocks.state }) }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: { email: 'synthetic@example.test' } } }));
vi.mock('@/lib/demo', () => ({ isDemoAccount: () => mocks.demo }));
vi.mock('@/lib/pastoralFriends', () => ({ subscribeReportFriends: (...args: unknown[]) => mocks.subscribe(...args) }));
import PastoralReport from './PastoralReport';
beforeEach(() => {
  mocks.demo = false; mocks.stop.mockClear(); mocks.subscribe.mockReset();
  mocks.state = { ...initialState, curYear: 2026, userRole: { role: 'admin' }, months: [{ month: 1, sundays: [4, 11, 18, 25] }], events: {}, classData: { '1-1-1': { students: [{ id: 'nf_one', name: '합성 학생', phone: '010-0000-0000' }] } }, attData: { '1-1-1': { nf_one: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' } } } };
  mocks.subscribe.mockImplementation((_year, receive, fail) => { mocks.receive = receive; mocks.fail = fail; return mocks.stop; });
});
afterEach(cleanup);
describe('목양 리포트 실제 화면', () => {
  it('세부 탭을 전환하고 연락처 연결과 검색을 제공한다', () => {
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    expect(screen.getByRole('link', { name: '010-0000-0000' }).getAttribute('href')).toBe('tel:01000000000');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '없는 이름' } });
    expect(screen.getByText('이 조건에 해당하는 연속 결석 학생이 없습니다.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    fireEvent.click(screen.getByRole('button', { name: '이번 주 요약' }));
    expect(screen.getByText('3회 이상 연속 결석 · 일반 학생')).toBeTruthy();
  });
  it('권한 오류를 0명으로 숨기지 않고 재시도하며 해제된 응답을 무시한다', () => {
    const { rerender } = render(<PastoralReport />);
    act(() => mocks.fail(new Error('권한 없음')));
    expect(screen.getByRole('alert').textContent).toContain('전체 새친구 집계가 아닙니다');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
    const oldReceive = mocks.receive;
    mocks.state = { ...mocks.state, curYear: 2025, dataRevision: 2 };
    rerender(<PastoralReport />);
    act(() => oldReceive([{ key: 'old', name: '오래된 비공개 이름', part: '1', grade: '1' }]));
    expect(screen.queryByText('오래된 비공개 이름')).toBeNull();
    expect(mocks.stop).toHaveBeenCalled();
  });
  it.each(['teacher', 'demo'])('%s는 새친구를 구독하거나 연락처를 표시하지 않는다', mode => {
    if (mode === 'teacher') mocks.state = { ...mocks.state, userRole: { role: 'teacher' } };
    else mocks.demo = true;
    render(<PastoralReport />);
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
